import type { GridTelemetry, SystemState, ThreatAlert, AttackConfig, SimulationState } from '../types';
import { generateTelemetry, computeSystemState } from '../simulation/DataGenerator';
import {
  injectFDI,
  injectCommandSpoof,
  injectMaDIoT,
  injectSensorTamper,
  injectMeterAttack,
} from '../simulation/attacks';

export class SimulationEngine {
  private tick = 0;
  private sequenceNumber = 0;
  private running = false;
  private speed = 1.0;
  private activeAttacks: AttackConfig[] = [];
  private attackStartTicks: Map<string, number> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private onTelemetry: ((data: GridTelemetry[]) => void) | null = null;
  private onSystemState: ((data: SystemState) => void) | null = null;
  private onStateChange: ((data: SimulationState) => void) | null = null;

  setCallbacks(cbs: {
    onTelemetry?: (data: GridTelemetry[]) => void;
    onSystemState?: (data: SystemState) => void;
    onStateChange?: (data: SimulationState) => void;
  }) {
    if (cbs.onTelemetry) this.onTelemetry = cbs.onTelemetry;
    if (cbs.onSystemState) this.onSystemState = cbs.onSystemState;
    if (cbs.onStateChange) this.onStateChange = cbs.onStateChange;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.step(), 1000 / this.speed);
    this.emitState();
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emitState();
  }

  reset() {
    this.stop();
    this.tick = 0;
    this.sequenceNumber = 0;
    this.activeAttacks = [];
    this.attackStartTicks.clear();
    this.emitState();
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(10, speed));
    if (this.running) {
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(() => this.step(), 1000 / this.speed);
    }
  }

  injectAttack(config: AttackConfig) {
    const key = `${config.type}-${config.targetBus || 'all'}`;
    if (!this.attackStartTicks.has(key)) {
      this.attackStartTicks.set(key, this.tick);
    }
    // Avoid duplicates
    if (!this.activeAttacks.find((a) => a.type === config.type && a.targetBus === config.targetBus)) {
      this.activeAttacks.push(config);
    }
    this.emitState();
  }

  removeAttack(type: string, targetBus?: string) {
    this.activeAttacks = this.activeAttacks.filter(
      (a) => !(a.type === type && a.targetBus === targetBus)
    );
    const key = `${type}-${targetBus || 'all'}`;
    this.attackStartTicks.delete(key);
    this.emitState();
  }

  getState(): SimulationState {
    return {
      running: this.running,
      tick: this.tick,
      speed: this.speed,
      activeAttacks: [...this.activeAttacks],
      elapsedSeconds: this.tick,
    };
  }

  private step() {
    this.tick++;
    this.sequenceNumber++;

    // Generate clean telemetry
    let telemetry = generateTelemetry(this.tick, this.sequenceNumber);

    // Apply active attacks
    for (const attack of this.activeAttacks) {
      const key = `${attack.type}-${attack.targetBus || 'all'}`;
      const startTick = this.attackStartTicks.get(key) || this.tick;
      const elapsed = this.tick - startTick;
      const target = attack.targetBus || 'BUS-003';
      const intensity = attack.intensity ?? 0.7;

      switch (attack.type) {
        case 'FDI':
          telemetry = injectFDI(telemetry, target, intensity);
          break;
        case 'COMMAND_SPOOF':
          telemetry = injectCommandSpoof(telemetry, target, intensity);
          break;
        case 'MADIOT':
          telemetry = injectMaDIoT(telemetry, target, intensity);
          break;
        case 'SENSOR_TAMPER':
          telemetry = injectSensorTamper(telemetry, target, intensity, elapsed);
          break;
        case 'METER_ATTACK':
          telemetry = injectMeterAttack(telemetry, target, intensity);
          break;
      }
    }

    // Compute system state
    const systemState = computeSystemState(telemetry);

    // Emit to callbacks
    this.onTelemetry?.(telemetry);
    this.onSystemState?.(systemState);
  }

  private emitState() {
    this.onStateChange?.(this.getState());
  }
}

// Singleton via globalThis to survive Next.js dev mode module reloading
const globalForEngine = globalThis as unknown as { __vajraEngine?: SimulationEngine };
export function getSimulationEngine(): SimulationEngine {
  if (!globalForEngine.__vajraEngine) {
    globalForEngine.__vajraEngine = new SimulationEngine();
  }
  return globalForEngine.__vajraEngine;
}
