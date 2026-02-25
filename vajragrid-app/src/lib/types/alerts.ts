export type ThreatCategory =
  | 'FALSE_DATA_INJECTION'
  | 'COMMAND_SPOOFING'
  | 'LOAD_MANIPULATION'
  | 'SENSOR_TAMPERING'
  | 'SMART_METER_COMPROMISE'
  | 'ANOMALOUS_BEHAVIOR'
  | 'UNKNOWN_ANOMALY';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'ACTIVE' | 'INVESTIGATING' | 'MITIGATED' | 'FALSE_POSITIVE';

export interface Indicator {
  parameter: string;
  busId: string;
  expected: number;
  actual: number;
  deviation: string;
}

export interface ThreatAlert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  threatCategory: ThreatCategory;
  title: string;
  description: string;
  affectedAssets: string[];
  detectionLayers: string[];
  confidence: number; // 0.0 - 1.0
  indicators: Indicator[];
  recommendation: string;
  mitreTactic: string;
  status: AlertStatus;
}

// ─── VajraShield: Self-Healing Grid Types ────────────────────────────

export type HealingPhase =
  | 'DETECTING'    // Threat identified, assessing severity
  | 'ISOLATING'    // Tripping breakers to contain compromised bus
  | 'REROUTING'    // Redistributing load through alternate paths
  | 'MONITORING'   // Watching for continued anomalies post-isolation
  | 'RESTORING'    // Re-closing breakers, normalizing power flow
  | 'RESTORED';    // Fully healed, back to nominal

export interface HealingAction {
  timestamp: string;
  phase: HealingPhase;
  action: string;        // Human-readable action description
  targetAsset: string;   // Bus or line ID
  detail: string;        // Technical detail
}

export interface HealingEvent {
  id: string;
  triggeredBy: string;     // Alert ID that triggered healing
  affectedBus: string;
  phase: HealingPhase;
  startTime: string;
  lastUpdate: string;
  actions: HealingAction[];
  isolatedLines: string[];   // Line IDs with tripped breakers
  reroutedPaths: string[];   // Line IDs carrying redirected load
  loadRedistribution: Map<string, number>; // busId → extra MW absorbed
  ticksInPhase: number;
  totalDurationMs: number;
}

export interface HealingState {
  activeEvents: HealingEvent[];
  completedEvents: HealingEvent[];
  trippedBreakers: Set<string>;      // Line IDs currently tripped
  isolatedBuses: Set<string>;        // Bus IDs currently isolated
  reroutedLines: Set<string>;        // Line IDs carrying extra load
  shieldActive: boolean;
}
