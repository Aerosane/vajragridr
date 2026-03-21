/**
 * PlaceholderDataSource — Simulates realistic IoT sensor payloads
 *
 * This generates data in the exact format that a real SCADA/RTU/PMU would send.
 * Replace this with your actual data source integration:
 *
 *   - MQTT:        Subscribe to topics like `scada/{busId}/telemetry`
 *   - OPC-UA:      Connect to SCADA OPC-UA server via node-opcua
 *   - Modbus TCP:  Poll RTUs via jsmodbus
 *   - REST Webhook: Have the SCADA system POST to /api/ingest/telemetry
 *   - Kafka:       Consume from a telemetry topic
 *
 * To swap for real data, replace the generatePlaceholderBatch() function
 * or set up an external process that POSTs to /api/ingest/telemetry.
 */

import { GRID_TOPOLOGY } from '@/lib/constants/gridConfig';

/** Generates one batch of realistic placeholder telemetry (like a SCADA poll cycle) */
export function generatePlaceholderBatch(): Record<string, unknown>[] {
  const now = new Date().toISOString();
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  // Realistic daily load curve (Indian grid pattern)
  const loadFactor = getLoadFactor(hour);
  const solarFactor = getSolarFactor(hour);

  return GRID_TOPOLOGY.buses.map(bus => {
    const isGen = bus.type === 'SLACK' || bus.type === 'PV_GEN';
    const isSolar = bus.type === 'PV_GEN';

    // Simulate realistic measurements with sensor noise
    const baseVoltage = bus.nominalVoltage;
    const voltageNoise = (Math.random() - 0.5) * 4; // ±2 kV noise
    const voltage = baseVoltage + voltageNoise;

    const freqNoise = (Math.random() - 0.5) * 0.06; // ±0.03 Hz noise
    const frequency = 50.0 + freqNoise;

    let activePower: number;
    if (bus.type === 'SLACK') {
      // Slack bus balances generation and load
      const totalLoad = GRID_TOPOLOGY.buses
        .filter(b => b.type === 'PQ_LOAD')
        .reduce((sum, b) => sum + b.ratedLoad * loadFactor, 0);
      const solarGen = GRID_TOPOLOGY.buses
        .filter(b => b.type === 'PV_GEN')
        .reduce((sum, b) => sum + b.ratedGeneration * solarFactor, 0);
      activePower = totalLoad - solarGen + totalLoad * 0.03; // + 3% losses
    } else if (isSolar) {
      activePower = bus.ratedGeneration * solarFactor * (0.95 + Math.random() * 0.1);
    } else {
      activePower = -(bus.ratedLoad * loadFactor * (0.95 + Math.random() * 0.1));
    }

    const reactivePower = activePower * (0.2 + Math.random() * 0.15);
    const current = Math.abs(activePower * 1000) / (Math.sqrt(3) * voltage);
    const powerFactor = 0.85 + Math.random() * 0.12;
    const phaseAngle = isGen ? (Math.random() * 10 - 5) : -(Math.random() * 15 + 5);

    // Line flows for this bus
    const busLines = GRID_TOPOLOGY.lines.filter(
      l => l.fromBus === bus.id || l.toBus === bus.id
    );
    const lineFlows = busLines.map(line => {
      const flowDirection = line.fromBus === bus.id ? 1 : -1;
      const flowMW = (Math.abs(activePower) / Math.max(busLines.length, 1)) * flowDirection;
      return {
        lineId: line.id,
        fromBus: line.fromBus,
        toBus: line.toBus,
        activePowerFlow: flowMW * (0.9 + Math.random() * 0.2),
        reactivePowerFlow: flowMW * 0.3 * (0.8 + Math.random() * 0.4),
        current: Math.abs(flowMW * 1000) / (Math.sqrt(3) * voltage),
        loadingPercent: Math.min(100, (Math.abs(flowMW) / line.capacity) * 100),
        losses: Math.abs(flowMW) * line.resistance * 0.01,
      };
    });

    // This is the raw payload format — exactly what a real RTU/PMU would send
    return {
      busId: bus.id,
      timestamp: now,
      sequenceNumber: Date.now(),
      voltage,
      frequency,
      phaseAngle,
      activePower,
      reactivePower,
      current,
      powerFactor,
      lineFlows,
      transformerTemp: 40 + Math.random() * 20,
      breakerStatus: 'CLOSED',
      meterCount: bus.meterCount,
      meterConsumption: bus.type === 'PQ_LOAD' ? bus.ratedLoad * loadFactor * 0.9 : 0,
      dataQuality: 'GOOD',
      source: isGen ? 'PMU' : 'RTU',
    };
  });
}

/** Indian grid load curve — replace with actual NLDC demand profile */
function getLoadFactor(hour: number): number {
  const baseLoad = 0.3;
  const morningRamp = 0.25 * Math.max(0, Math.sin(((hour - 5) * Math.PI) / 8));
  const eveningPeak = 0.40 * Math.exp(-0.5 * Math.pow((hour - 19) / 2.5, 2));
  const middayActivity = 0.15 * Math.exp(-0.5 * Math.pow((hour - 12) / 4, 2));
  return Math.min(1.0, baseLoad + morningRamp + eveningPeak + middayActivity);
}

/** Solar generation curve — replace with actual irradiance data */
function getSolarFactor(hour: number): number {
  if (hour < 6 || hour > 18) return 0;
  const peak = Math.sin(((hour - 6) * Math.PI) / 12);
  const cloudNoise = 0.85 + Math.random() * 0.15; // 85-100% cloud factor
  return peak * cloudNoise;
}
