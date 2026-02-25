import type { GridTelemetry } from '../../types';

/**
 * Smart Meter Compromise Attack.
 * Compromised meters report zero consumption while actual load persists.
 * Creates discrepancy between meter aggregate and bus-level PMU readings.
 */
export function injectMeterAttack(
  telemetry: GridTelemetry[],
  targetBus: string,
  intensity = 1.0
): GridTelemetry[] {
  return telemetry.map((t) => {
    if (t.busId !== targetBus) return t;
    if (t.meterCount === 0) return t; // No meters on this bus

    // Intensity scales how many meters are compromised (1.0 = all report zero)
    const compromisedFraction = intensity;
    return {
      ...t,
      meterConsumption: t.meterConsumption * (1 - compromisedFraction),
      // Bus-level PMU still reads real values — this creates the detectable discrepancy
    };
  });
}
