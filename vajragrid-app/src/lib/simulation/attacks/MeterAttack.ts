import type { GridTelemetry } from '../../types';

/**
 * Smart Meter Compromise Attack.
 * Compromised meters report zero consumption while actual load persists.
 * Creates discrepancy between meter aggregate and bus-level PMU readings.
 */
export function injectMeterAttack(
  telemetry: GridTelemetry[],
  targetBus: string,
  _intensity: number = 1.0
): GridTelemetry[] {
  return telemetry.map((t) => {
    if (t.busId !== targetBus) return t;
    if (t.meterCount === 0) return t; // No meters on this bus

    return {
      ...t,
      meterConsumption: 0, // Meters report zero
      // But bus-level measurements remain correct (PMU still reads real values)
      // This creates the detectable discrepancy
    };
  });
}
