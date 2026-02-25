import type { GridTelemetry, SystemState } from './grid';
import type { ThreatAlert } from './alerts';

export type AttackType =
  | 'FDI'
  | 'COMMAND_SPOOF'
  | 'MADIOT'
  | 'SENSOR_TAMPER'
  | 'METER_ATTACK';

export interface AttackConfig {
  type: AttackType;
  targetBus?: string;
  intensity?: number; // 0.0-1.0
  startTime?: number;
}

export interface SimulationState {
  running: boolean;
  tick: number;
  speed: number; // 1.0 = real-time
  activeAttacks: AttackConfig[];
  elapsedSeconds: number;
}

export interface SimulationEvent {
  type: 'telemetry' | 'system_state';
  data: GridTelemetry | SystemState;
  tick: number;
}

export interface DetectionEvent {
  type: 'alert' | 'alert_update';
  data: ThreatAlert;
}

// Socket.IO event map
export interface ServerToClientEvents {
  'grid:telemetry': (data: GridTelemetry) => void;
  'grid:system': (data: SystemState) => void;
  'grid:alert': (data: ThreatAlert) => void;
  'simulation:state': (data: SimulationState) => void;
}

export interface ClientToServerEvents {
  'simulation:start': () => void;
  'simulation:stop': () => void;
  'simulation:attack': (config: AttackConfig) => void;
  'simulation:reset': () => void;
  'simulation:speed': (speed: number) => void;
}
