import type { GridTelemetry } from '../../types';
import { GRID_TOPOLOGY } from '../../constants';

/**
 * Command Spoofing / Breaker Manipulation Attack.
 * Sends unauthorized command to open a circuit breaker.
 * Based on Ukraine 2015 BlackEnergy attack pattern.
 */
export function injectCommandSpoof(
  telemetry: GridTelemetry[],
  targetBus: string,
  _intensity: number = 0.8
): GridTelemetry[] {
  return telemetry.map((t) => {
    if (t.busId === targetBus) {
      // Breaker trips — bus loses primary supply
      return {
        ...t,
        voltage: t.voltage * 0.55,
        activePower: t.activePower * 0.3,
        current: t.current * 0.3,
        breakerStatus: 'TRIP' as const,
        lineFlows: t.lineFlows.map((lf) => ({
          ...lf,
          activePowerFlow: lf.fromBus === targetBus || lf.toBus === targetBus
            ? 0
            : lf.activePowerFlow,
          current: lf.fromBus === targetBus || lf.toBus === targetBus
            ? 0
            : lf.current,
          loadingPercent: lf.fromBus === targetBus || lf.toBus === targetBus
            ? 0
            : lf.loadingPercent,
        })),
      };
    }

    // Adjacent lines overload as they compensate
    const connectedToTarget = GRID_TOPOLOGY.lines.some(
      (l) =>
        (l.fromBus === t.busId && l.toBus === targetBus) ||
        (l.toBus === t.busId && l.fromBus === targetBus)
    );

    if (connectedToTarget) {
      return {
        ...t,
        voltage: t.voltage * 0.92,
        lineFlows: t.lineFlows.map((lf) => ({
          ...lf,
          loadingPercent: Math.min(120, lf.loadingPercent * 1.6),
          activePowerFlow: lf.activePowerFlow * 1.5,
        })),
      };
    }

    return t;
  });
}
