// Grid Telemetry — core data flowing through the system every second

export interface LineFlow {
  lineId: string;
  fromBus: string;
  toBus: string;
  activePowerFlow: number; // MW
  reactivePowerFlow: number; // MVAR
  current: number; // Amperes
  loadingPercent: number; // 0-100%
  losses: number; // MW
}

export interface GridTelemetry {
  busId: string;
  timestamp: string; // ISO 8601
  sequenceNumber: number;

  // Electrical measurements
  voltage: number; // kV (nominal: 230)
  frequency: number; // Hz (nominal: 50.00)
  phaseAngle: number; // degrees (-180 to 180)
  activePower: number; // MW (positive=gen, negative=load)
  reactivePower: number; // MVAR
  current: number; // Amperes
  powerFactor: number; // 0.0 to 1.0

  // Line measurements
  lineFlows: LineFlow[];

  // Equipment
  transformerTemp: number; // °C
  breakerStatus: 'CLOSED' | 'OPEN' | 'TRIP';

  // Smart meter aggregate
  meterCount: number;
  meterConsumption: number; // MWh

  // Metadata
  dataQuality: 'GOOD' | 'SUSPECT' | 'BAD';
  source: 'PMU' | 'RTU' | 'SMART_METER';
}

export interface SystemState {
  timestamp: string;
  totalGeneration: number;
  totalLoad: number;
  totalLosses: number;
  systemFrequency: number;
  generationLoadBalance: number;
  activeBuses: number;
  activeLines: number;
  systemStatus: 'NOMINAL' | 'ALERT' | 'EMERGENCY' | 'BLACKOUT';
}

export type BusType = 'SLACK' | 'PV_GEN' | 'PQ_LOAD';

export interface BusConfig {
  id: string;
  name: string;
  type: BusType;
  nominalVoltage: number; // kV
  ratedGeneration: number; // MW (0 for load buses)
  ratedLoad: number; // MW (0 for gen buses)
  meterCount: number;
  latitude: number;
  longitude: number;
}

export interface LineConfig {
  id: string;
  fromBus: string;
  toBus: string;
  resistance: number; // per-unit
  reactance: number; // per-unit
  capacity: number; // MVA
  lengthKm: number;
}

export interface TopologyConfig {
  buses: BusConfig[];
  lines: LineConfig[];
}
