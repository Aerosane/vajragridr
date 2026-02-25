import type { GridTelemetry } from '../../types';
import { SYSTEM } from '../../constants';
import { gaussianRandom } from '../NoiseGenerator';

/**
 * Manipulation of Demand via IoT (MaDIoT) Attack.
 * Botnet of high-wattage IoT devices synchronously spikes demand.
 * Based on Princeton University 2018 research.
 */
export function injectMaDIoT(
  telemetry: GridTelemetry[],
  _targetBus: string,
  intensity: number = 0.8
): GridTelemetry[] {
  const loadMultiplier = 1.3 + intensity * 0.4; // 1.3-1.7×

  return telemetry.map((t) => {
    if (t.activePower >= 0) {
      // Generator buses: frequency drops due to load-gen imbalance
      const freqDrop =
        -(loadMultiplier - 1) *
        (190 / (2 * SYSTEM.inertiaConstant * SYSTEM.basePower * SYSTEM.nominalFrequency));
      return {
        ...t,
        frequency: t.frequency + freqDrop * 50 + gaussianRandom(0, 0.02),
        activePower: t.activePower * 1.1, // Generators ramp but can't keep up
      };
    }

    // Load buses: demand spikes simultaneously
    const newLoad = t.activePower * loadMultiplier;
    const freqDrop =
      -(loadMultiplier - 1) *
      (Math.abs(t.activePower) / (2 * SYSTEM.inertiaConstant * SYSTEM.basePower * SYSTEM.nominalFrequency));

    return {
      ...t,
      activePower: newLoad + gaussianRandom(0, 1),
      current: t.current * loadMultiplier,
      frequency: t.frequency + freqDrop * 50 + gaussianRandom(0, 0.02),
      voltage: t.voltage - (loadMultiplier - 1) * 8, // Voltage sag under high load
    };
  });
}
