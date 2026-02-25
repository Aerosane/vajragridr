export type ThreatCategory =
  | 'FALSE_DATA_INJECTION'
  | 'COMMAND_SPOOFING'
  | 'LOAD_MANIPULATION'
  | 'SENSOR_TAMPERING'
  | 'SMART_METER_COMPROMISE'
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
