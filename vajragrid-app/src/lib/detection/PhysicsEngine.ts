import { THRESHOLDS } from '@/lib/constants/thresholds';
import type { GridTelemetry } from '@/lib/types/grid';

export interface PhysicsViolation {
  checkId: string;
  checkName: string;
  type: 'BALANCE' | 'COUPLING' | 'CONSISTENCY' | 'CONSENSUS';
  details: string;
  affectedBuses: string[];
}

export function runPhysicsChecks(buses: GridTelemetry[]): PhysicsViolation[] {
  const violations: PhysicsViolation[] = [];
  if (buses.length === 0) return [];

  // 1. Power Balance (Total Gen ≈ Total Load + Losses within 5%)
  let totalGen = 0;
  let totalLoad = 0;
  let totalLosses = 0;

  buses.forEach(bus => {
    if (bus.activePower > 0) totalGen += bus.activePower;
    else totalLoad += Math.abs(bus.activePower);

    bus.lineFlows.forEach(flow => {
      // Avoid double counting losses by only counting from one side if both are present
      // For this simulation, we'll assume totalLosses is sum of all flow losses / 2 if both ends report
      // or just sum them if they are unique per line. 
      // Based on GridTelemetry, lineFlows are per bus.
      totalLosses += flow.losses;
    });
  });
  
  // Adjust losses because each line is likely counted twice (once per bus)
  totalLosses = totalLosses / 2;

  const totalDemand = totalLoad + totalLosses;
  const imbalance = Math.abs(totalGen - totalDemand);
  const maxSide = Math.max(totalGen, totalDemand);
  const imbalancePercent = maxSide > 0 ? imbalance / maxSide : 0;

  if (imbalancePercent > THRESHOLDS.power.balanceThreshold) {
    violations.push({
      checkId: 'PHYS_PWR_BALANCE',
      checkName: 'System Power Imbalance',
      type: 'BALANCE',
      details: `System-wide imbalance of ${(imbalancePercent * 100).toFixed(2)}% exceeds ${THRESHOLDS.power.balanceThreshold * 100}% threshold. Gen: ${totalGen.toFixed(2)}MW, Load+Loss: ${totalDemand.toFixed(2)}MW`,
      affectedBuses: buses.map(b => b.busId),
    });
  }

  // 2. Voltage Coupling (Adjacent bus voltages within ±15%)
  const busMap = new Map<string, GridTelemetry>();
  buses.forEach(b => busMap.set(b.busId, b));

  buses.forEach(bus => {
    bus.lineFlows.forEach(line => {
      const neighbor = busMap.get(line.toBus);
      if (neighbor) {
        const diff = Math.abs(bus.voltage - neighbor.voltage);
        const diffPercent = diff / THRESHOLDS.voltage.nominal;
        if (diffPercent > 0.15) {
          violations.push({
            checkId: 'PHYS_VOLT_COUPLING',
            checkName: 'Voltage Coupling Violation',
            type: 'COUPLING',
            details: `Voltage difference between ${bus.busId} (${bus.voltage}kV) and ${neighbor.busId} (${neighbor.voltage}kV) is ${(diffPercent * 100).toFixed(1)}%, exceeding 15% physical limit`,
            affectedBuses: [bus.busId, neighbor.busId],
          });
        }
      }
    });
  });

  // 3. Power Equation Consistency (P ≈ V×I×cosφ within 15%)
  buses.forEach(bus => {
    // P(MW) * 1000 = V(kV) * I(A) * PF
    const calculatedP = (bus.voltage * bus.current * bus.powerFactor) / 1000;
    const actualP = Math.abs(bus.activePower);
    const diff = Math.abs(calculatedP - actualP);
    const maxP = Math.max(calculatedP, actualP);
    const diffPercent = maxP > 0.1 ? diff / maxP : 0; // Avoid noise at very low power

    if (diffPercent > 0.15) {
      violations.push({
        checkId: 'PHYS_EQUATION_CONSISTENCY',
        checkName: 'Power Equation Inconsistency',
        type: 'CONSISTENCY',
        details: `Reported MW (${actualP.toFixed(2)}) doesn't match V-I-PF calculation (${calculatedP.toFixed(2)}) at ${bus.busId}. Deviation: ${(diffPercent * 100).toFixed(1)}%`,
        affectedBuses: [bus.busId],
      });
    }
  });

  // 4. Frequency Consensus (All buses within 0.1Hz)
  const frequencies = buses.map(b => b.frequency);
  const minFreq = Math.min(...frequencies);
  const maxFreq = Math.max(...frequencies);
  if (maxFreq - minFreq > 0.1) {
    violations.push({
      checkId: 'PHYS_FREQ_CONSENSUS',
      checkName: 'Frequency Consensus Violation',
      type: 'CONSENSUS',
      details: `Frequency divergence detected across grid. Max spread: ${(maxFreq - minFreq).toFixed(3)} Hz (Limit: 0.1 Hz)`,
      affectedBuses: buses.filter(b => Math.abs(b.frequency - (minFreq + maxFreq) / 2) > 0.04).map(b => b.busId),
    });
  }

  return violations;
}
