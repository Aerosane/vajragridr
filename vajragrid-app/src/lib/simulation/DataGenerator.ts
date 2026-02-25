import type { GridTelemetry, LineFlow, SystemState } from '../types';
import { GRID_TOPOLOGY, NOISE, SYSTEM } from '../constants';
import { dailyLoadFactor, solarGenerationFactor, tickToHour } from './LoadCurve';
import { addNoise, addPercentNoise, transientNoise } from './NoiseGenerator';
import { isBreakerTripped, isBusIsolated } from '../healing';

/**
 * Generates realistic "normal" grid telemetry for a given tick.
 * Each tick represents 1 minute of simulated time.
 * VajraShield: respects breaker state — isolated buses show zero flow.
 */
export function generateTelemetry(
  tick: number,
  sequenceNumber: number
): GridTelemetry[] {
  const hour = tickToHour(tick);
  const loadFactor = dailyLoadFactor(hour);
  const solarFactor = solarGenerationFactor(hour);
  const timestamp = new Date().toISOString();

  const telemetry: GridTelemetry[] = [];

  for (const bus of GRID_TOPOLOGY.buses) {
    const busIsolated = isBusIsolated(bus.id);
    let activePower: number;
    let reactivePower: number;
    let powerFactor: number;

    if (busIsolated) {
      // Isolated bus: no power flow, voltage collapses
      activePower = 0;
      reactivePower = 0;
      powerFactor = 0;
    } else if (bus.type === 'SLACK') {
      // Slack bus: generates whatever is needed to balance
      const totalLoad =
        GRID_TOPOLOGY.buses
          .filter((b) => b.type === 'PQ_LOAD')
          .reduce((sum, b) => sum + b.ratedLoad * loadFactor, 0);
      const solarGen =
        GRID_TOPOLOGY.buses
          .filter((b) => b.type === 'PV_GEN')
          .reduce((sum, b) => sum + b.ratedGeneration * solarFactor, 0);
      const losses = totalLoad * 0.03; // ~3% transmission losses
      activePower = addPercentNoise(totalLoad - solarGen + losses, NOISE.power.stdDevPercent);
      reactivePower = activePower * 0.2;
      powerFactor = 0.98;
    } else if (bus.type === 'PV_GEN') {
      // Solar: follows sun curve with some cloud variability
      activePower = addPercentNoise(
        bus.ratedGeneration * solarFactor,
        NOISE.power.stdDevPercent * 3 // Solar is more variable
      );
      reactivePower = activePower * 0.05;
      powerFactor = 0.99;
    } else {
      // Load bus: negative power (consuming)
      activePower = -addPercentNoise(
        bus.ratedLoad * loadFactor,
        NOISE.power.stdDevPercent
      );
      reactivePower = activePower * 0.3; // typical reactive ratio
      powerFactor = addNoise(0.92, NOISE.powerFactor.stdDev, 0.8, 1.0);
    }

    // Voltage: nominal ± noise, slightly affected by load
    // VajraShield: isolated bus voltage decays
    const loadEffect =
      bus.type === 'PQ_LOAD' && !busIsolated
        ? -SYSTEM.voltageRegulationCoeff * loadFactor * 5
        : 0;
    const voltage = busIsolated
      ? addNoise(0, 2, 0, 10) // Voltage collapses on isolated bus
      : addNoise(
          bus.nominalVoltage + loadEffect + transientNoise(),
          NOISE.voltage.stdDev,
          200,
          260
        );

    // Frequency: system-wide with tiny variations per bus
    const systemFreq = addNoise(SYSTEM.nominalFrequency, NOISE.frequency.stdDev, 49.5, 50.5);

    // Current derived from power and voltage
    const current = Math.abs(activePower * 1000) / (voltage * Math.sqrt(3));

    // Phase angle: small variations
    const phaseAngle = bus.type === 'SLACK' ? 0 : addNoise(-5 * loadFactor, 2, -30, 30);

    // Transformer temperature: ambient + load-dependent
    const ambientTemp = 25 + 10 * Math.sin(((hour - 6) * Math.PI) / 12); // hotter in afternoon
    const transformerTemp = addNoise(
      ambientTemp + 20 * loadFactor,
      NOISE.temperature.stdDev,
      20,
      100
    );

    // Line flows for lines originating from this bus
    // VajraShield: tripped breakers = zero flow
    const lineFlows: LineFlow[] = GRID_TOPOLOGY.lines
      .filter((l) => l.fromBus === bus.id || l.toBus === bus.id)
      .map((line) => {
        const tripped = isBreakerTripped(line.id);
        if (tripped || busIsolated) {
          return {
            lineId: line.id,
            fromBus: line.fromBus,
            toBus: line.toBus,
            activePowerFlow: 0,
            reactivePowerFlow: 0,
            current: 0,
            loadingPercent: 0,
            losses: 0,
          };
        }

        const flowDirection = line.fromBus === bus.id ? 1 : -1;
        const flowMW =
          addPercentNoise(
            (Math.abs(activePower) / 3) * flowDirection, // Simplified: split power across lines
            0.05
          );
        const flowMVAR = flowMW * 0.15;
        const lineCurrent = Math.abs(flowMW * 1000) / (voltage * Math.sqrt(3));
        const loading = (Math.abs(flowMW) / line.capacity) * 100;
        const lineLosses = Math.abs(flowMW) * line.resistance * 0.01;

        return {
          lineId: line.id,
          fromBus: line.fromBus,
          toBus: line.toBus,
          activePowerFlow: flowMW,
          reactivePowerFlow: flowMVAR,
          current: lineCurrent,
          loadingPercent: Math.min(loading, 120),
          losses: lineLosses,
        };
      });

    // Smart meter consumption (load buses only)
    const meterConsumption =
      bus.type === 'PQ_LOAD'
        ? Math.abs(activePower) * (1 + addNoise(0, 0.02)) // ~matches bus load
        : 0;

    telemetry.push({
      busId: bus.id,
      timestamp,
      sequenceNumber,
      voltage,
      frequency: systemFreq,
      phaseAngle,
      activePower,
      reactivePower,
      current,
      powerFactor,
      lineFlows,
      transformerTemp,
      breakerStatus: busIsolated ? 'TRIP' : 'CLOSED',
      meterCount: bus.meterCount,
      meterConsumption,
      dataQuality: 'GOOD',
      source: bus.type === 'PQ_LOAD' ? 'RTU' : 'PMU',
    });
  }

  return telemetry;
}

/**
 * Compute system-wide state from bus telemetry.
 */
export function computeSystemState(
  telemetry: GridTelemetry[]
): SystemState {
  const genBuses = telemetry.filter((t) => t.activePower > 0);
  const loadBuses = telemetry.filter((t) => t.activePower < 0);

  const totalGeneration = genBuses.reduce((s, t) => s + t.activePower, 0);
  const totalLoad = loadBuses.reduce((s, t) => s + Math.abs(t.activePower), 0);
  const totalLosses = Math.abs(totalGeneration - totalLoad);
  const systemFrequency =
    telemetry.reduce((s, t) => s + t.frequency, 0) / telemetry.length;
  const balance = (totalGeneration - totalLoad) / totalGeneration;

  let systemStatus: SystemState['systemStatus'] = 'NOMINAL';
  if (Math.abs(systemFrequency - 50) > 0.5) systemStatus = 'EMERGENCY';
  else if (Math.abs(systemFrequency - 50) > 0.1) systemStatus = 'ALERT';

  return {
    timestamp: new Date().toISOString(),
    totalGeneration,
    totalLoad,
    totalLosses,
    systemFrequency,
    generationLoadBalance: balance,
    activeBuses: telemetry.filter((t) => t.breakerStatus === 'CLOSED').length,
    activeLines: 6,
    systemStatus,
  };
}
