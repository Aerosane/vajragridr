import type { GridTelemetry } from '../../types';

/**
 * Sensor Tampering — Slow Drift Attack.
 * Gradually biases sensor calibration to evade threshold-based detection.
 * The stealthiest attack type.
 */
export function injectSensorTamper(
  telemetry: GridTelemetry[],
  targetBus: string,
  _intensity: number = 0.5,
  elapsedTicks: number = 0
): GridTelemetry[] {
  // Drift rate: 0.08 kV per tick (second)
  // After 60s: ~5kV drift. After 300s: ~24kV drift (clearly out of bounds)
  const drift = 0.08 * elapsedTicks;

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
