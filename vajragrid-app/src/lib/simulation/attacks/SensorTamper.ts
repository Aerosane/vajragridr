import type { GridTelemetry } from '../../types';

/**
 * Sensor Tampering — Slow Drift Attack.
 * Gradually biases sensor calibration to evade threshold-based detection.
 * The stealthiest attack type.
 */
export function injectSensorTamper(
  telemetry: GridTelemetry[],
  targetBus: string,
  intensity = 0.5,
  elapsedTicks: number = 0
): GridTelemetry[] {
  // Drift rate scales with intensity: 0.04-0.16 kV per tick
  const driftRate = 0.04 + (intensity * 0.12);
  const drift = driftRate * elapsedTicks;

  return telemetry.map((t) => {
    if (t.busId !== targetBus) return t;

    // Subtle: attacker adjusts current to maintain apparent P=V×I consistency
    // But can't perfectly compensate — small inconsistency grows
    const driftedVoltage = t.voltage + drift;
    const compensatedCurrent = t.current * (t.voltage / driftedVoltage);

    return {
      ...t,
      voltage: driftedVoltage,
      current: compensatedCurrent * 0.98, // Imperfect compensation
    };
  });
}
