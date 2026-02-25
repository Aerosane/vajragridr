import type { GridTelemetry } from '../../types';
import { gaussianRandom } from '../NoiseGenerator';

/**
 * False Data Injection Attack.
 * Compromises SCADA channel to inject falsified sensor readings.
 * Target: voltage and phase angle on a specific bus.
 */
export function injectFDI(
  telemetry: GridTelemetry[],
  targetBus: string,
  intensity: number = 0.7
): GridTelemetry[] {
  const bias = 15 + intensity * 20; // +15 to +35 kV
  const angleBias = 5 + intensity * 15; // +5 to +20 degrees

  return telemetry.map((t) => {
    if (t.busId !== targetBus) return t;
    return {
      ...t,
      voltage: t.voltage + bias + gaussianRandom(0, 2),
      phaseAngle: t.phaseAngle + angleBias,
      dataQuality: 'GOOD' as const, // Attacker marks data as trustworthy
    };
  });
}
