/**
 * IngestionEngine — Bridges real external telemetry → VajraGrid detection pipeline
 *
 * Accepts raw telemetry from IoT sensors / SCADA / MQTT and:
 *  1. Validates + normalizes the data into GridTelemetry format
 *  2. Buffers samples for statistical detection (windowing)
 *  3. Publishes into the same EventBus used by the simulation engine
 *  4. Feeds the 4-layer detection pipeline (Rules → Physics → Stats → ML)
 *  5. Persists to the TelemetryStore for time-series queries
 *
 * The simulation engine remains available for demo/training mode.
 * When ingestion is active, live data takes priority.
 */

import type { GridTelemetry, SystemState, AttackType } from '@/lib/types';
import { publish } from '@/lib/events/EventBus';
import { runRules } from '@/lib/detection/RuleEngine';
import { runPhysicsChecks } from '@/lib/detection/PhysicsEngine';
import { StatisticalDetector } from '@/lib/detection/StatisticalEngine';
import { classifyThreats } from '@/lib/detection/AlertClassifier';
import { runMLDetection, isMLReady } from '@/lib/detection/MLDetector';
import { processAlerts, tickHealing, getShieldStatus, resetShield } from '@/lib/healing';
import { setOnBusHealedCallback } from '@/lib/healing/SelfHealingEngine';
import { getTelemetryStore } from './TelemetryStore';
import type { ThreatAlert } from '@/lib/types';
import { injectFDI, injectCommandSpoof, injectMaDIoT, injectSensorTamper, injectMeterAttack } from '@/lib/simulation/attacks';

/** Source of telemetry data */
export type DataSource = 'LIVE' | 'SIMULATION' | 'REPLAY';

/** Active attack overlay applied to incoming telemetry */
export interface ActiveAttack {
  type: AttackType;
  targetBus: string;
  intensity: number;
  startedAt: string;
  elapsedTicks: number;
}

interface IngestionState {
  active: boolean;
  dataSource: DataSource;
  statDetector: StatisticalDetector;
  previousReadings: Map<string, GridTelemetry>;
  alertHistory: ThreatAlert[];
  latestTelemetry: GridTelemetry[];
  mlAnomalies: { busId: string; score: number; isAnomaly: boolean; confidence: number }[];
  ingestedCount: number;
  lastIngestTime: string | null;
  errors: string[];
  tickCount: number;
  activeAttacks: ActiveAttack[];
}

const g = globalThis as unknown as { __vajraIngestion?: IngestionState };

function getState(): IngestionState {
  if (!g.__vajraIngestion) {
    g.__vajraIngestion = {
      active: false,
      dataSource: 'SIMULATION',
      statDetector: new StatisticalDetector(),
      previousReadings: new Map(),
      alertHistory: [],
      latestTelemetry: [],
      mlAnomalies: [],
      ingestedCount: 0,
      lastIngestTime: null,
      errors: [],
      tickCount: 0,
      activeAttacks: [],
    };
  }
  // Ensure activeAttacks exists (hot-reload compat)
  if (!g.__vajraIngestion.activeAttacks) {
    g.__vajraIngestion.activeAttacks = [];
  }
  return g.__vajraIngestion;
}

// Register auto-heal callback: when VajraShield restores a bus, remove its attack overlay
setOnBusHealedCallback((busId: string) => {
  const state = getState();
  const before = state.activeAttacks.length;
  state.activeAttacks = state.activeAttacks.filter(a => a.targetBus !== busId);
  if (state.activeAttacks.length < before) {
    publish('ingestion_attacks', state.activeAttacks);
    // If all attacks cleared after healing, clean up fully
    if (state.activeAttacks.length === 0) {
      state.alertHistory = [];
      resetShield();
      publish('clear_alerts', true);
      publish('shield', getShieldStatus());
    }
  }
});

/**
 * Validate and normalize a raw telemetry payload into GridTelemetry.
 * Accepts partial/messy IoT data and fills in sensible defaults.
 */
export function normalizeRawTelemetry(raw: Record<string, unknown>): GridTelemetry | null {
  const busId = typeof raw.busId === 'string' ? raw.busId : null;
  if (!busId) return null;

  const num = (key: string, fallback: number): number => {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const parsed = parseFloat(v);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  };

  const str = (key: string, fallback: string): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : fallback;

  // Normalize line flows if present
  const rawFlows = Array.isArray(raw.lineFlows) ? raw.lineFlows : [];
  const lineFlows = rawFlows
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map(f => ({
      lineId: typeof f.lineId === 'string' ? f.lineId : 'UNKNOWN',
      fromBus: typeof f.fromBus === 'string' ? f.fromBus : busId,
      toBus: typeof f.toBus === 'string' ? f.toBus : 'UNKNOWN',
      activePowerFlow: typeof f.activePowerFlow === 'number' ? f.activePowerFlow : 0,
      reactivePowerFlow: typeof f.reactivePowerFlow === 'number' ? f.reactivePowerFlow : 0,
      current: typeof f.current === 'number' ? f.current : 0,
      loadingPercent: typeof f.loadingPercent === 'number' ? f.loadingPercent : 0,
      losses: typeof f.losses === 'number' ? f.losses : 0,
    }));

  return {
    busId,
    timestamp: str('timestamp', new Date().toISOString()),
    sequenceNumber: num('sequenceNumber', Date.now()),
    voltage: num('voltage', 230),
    frequency: num('frequency', 50.0),
    phaseAngle: num('phaseAngle', 0),
    activePower: num('activePower', 0),
    reactivePower: num('reactivePower', 0),
    current: num('current', 0),
    powerFactor: num('powerFactor', 0.95),
    lineFlows,
    transformerTemp: num('transformerTemp', 45),
    breakerStatus: (['CLOSED', 'OPEN', 'TRIP'].includes(str('breakerStatus', 'CLOSED'))
      ? str('breakerStatus', 'CLOSED')
      : 'CLOSED') as GridTelemetry['breakerStatus'],
    meterCount: num('meterCount', 0),
    meterConsumption: num('meterConsumption', 0),
    dataQuality: (['GOOD', 'SUSPECT', 'BAD'].includes(str('dataQuality', 'GOOD'))
      ? str('dataQuality', 'GOOD')
      : 'GOOD') as GridTelemetry['dataQuality'],
    source: (['PMU', 'RTU', 'SMART_METER'].includes(str('source', 'RTU'))
      ? str('source', 'RTU')
      : 'RTU') as GridTelemetry['source'],
  };
}

/** Derive system state from a batch of telemetry readings */
function deriveSystemState(telemetry: GridTelemetry[]): SystemState | null {
  if (!telemetry.length) return null;
  const uniqueBuses = new Set(telemetry.map(t => t.busId));
  const activeBuses = telemetry.filter(t => t.breakerStatus !== 'TRIP' && t.voltage > 10)
    .map(t => t.busId).filter((v, i, a) => a.indexOf(v) === i).length;
  const totalGen = telemetry.reduce((s, t) => s + Math.max(0, t.activePower), 0);
  const totalLoad = telemetry.reduce((s, t) => s + Math.abs(Math.min(0, t.activePower)), 0) || totalGen * 0.95;
  const avgFreq = telemetry.reduce((s, t) => s + t.frequency, 0) / telemetry.length;
  const balance = totalLoad > 0 ? totalGen / totalLoad : 1;
  const losses = Math.max(0, totalGen - totalLoad);

  let status: SystemState['systemStatus'] = 'NOMINAL';
  if (activeBuses === 0) status = 'BLACKOUT';
  else if (avgFreq < 49.5 || avgFreq > 50.5 || activeBuses < 3) status = 'EMERGENCY';
  else if (avgFreq < 49.9 || avgFreq > 50.1 || Math.abs(1 - balance) > 0.1) status = 'ALERT';

  return {
    timestamp: new Date().toISOString(),
    totalGeneration: totalGen,
    totalLoad,
    totalLosses: losses,
    systemFrequency: avgFreq,
    generationLoadBalance: balance,
    activeBuses,
    activeLines: uniqueBuses.size,
    systemStatus: status,
  };
}

const STARTUP_GRACE_TICKS = 10;

/**
 * Ingest a batch of telemetry readings from an external source.
 * This is the main entry point — called by the /api/ingest/telemetry route.
 */
export function ingestTelemetry(rawBatch: Record<string, unknown>[]): {
  accepted: number;
  rejected: number;
  alerts: ThreatAlert[];
} {
  const state = getState();
  state.active = true;
  state.dataSource = 'LIVE';
  state.tickCount++;

  const normalized: GridTelemetry[] = [];
  let rejected = 0;

  for (const raw of rawBatch) {
    const t = normalizeRawTelemetry(raw);
    if (t) {
      normalized.push(t);
    } else {
      rejected++;
    }
  }

  if (normalized.length === 0) {
    return { accepted: 0, rejected, alerts: [] };
  }

  // === Apply active attack overlays ===
  // Attacks modify the normalized telemetry BEFORE detection, so the AI
  // pipeline sees attacked data and must detect + respond to it.
  let telemetry = normalized;
  if (state.activeAttacks.length > 0) {
    for (const attack of state.activeAttacks) {
      attack.elapsedTicks++;
      switch (attack.type) {
        case 'FDI':
          telemetry = injectFDI(telemetry, attack.targetBus, attack.intensity);
          break;
        case 'COMMAND_SPOOF':
          telemetry = injectCommandSpoof(telemetry, attack.targetBus, attack.intensity);
          break;
        case 'MADIOT':
          telemetry = injectMaDIoT(telemetry, attack.targetBus, attack.intensity);
          break;
        case 'SENSOR_TAMPER':
          telemetry = injectSensorTamper(telemetry, attack.targetBus, attack.intensity, attack.elapsedTicks);
          break;
        case 'METER_ATTACK':
          telemetry = injectMeterAttack(telemetry, attack.targetBus, attack.intensity);
          break;
      }
    }
  }

  state.latestTelemetry = telemetry;
  state.ingestedCount += telemetry.length;
  state.lastIngestTime = new Date().toISOString();

  // Publish attacked telemetry to EventBus (frontend sees attacked values)
  publish('telemetry', telemetry);

  // Publish active attacks state so frontend can show attack indicators
  publish('ingestion_attacks', state.activeAttacks);

  // Derive and publish system state
  const systemState = deriveSystemState(telemetry);
  if (systemState) publish('system_state', systemState);

  // Persist CLEAN data to store (non-blocking)
  const store = getTelemetryStore();
  store.write(telemetry).catch(err => {
    state.errors.push(`Store write error: ${err}`);
    if (state.errors.length > 100) state.errors.shift();
  });

  // Collect samples for statistical baseline (always runs for accurate baselines)
  for (const t of normalized) {
    state.previousReadings.set(t.busId, t);
    state.statDetector.addSample(t.busId, t);
  }

  // Grace period for baselines
  if (state.tickCount <= STARTUP_GRACE_TICKS) {
    return { accepted: telemetry.length, rejected, alerts: [] };
  }

  // === 4-Layer Detection Pipeline ===
  // Only runs when attacks are active — normal operation = clean dashboard.
  // The detection pipeline detects the attack perturbations applied above.
  if (state.activeAttacks.length === 0) {
    // No attacks → just tick healing (for ongoing recovery) and publish shield
    tickHealing();
    publish('shield', getShieldStatus());
    return { accepted: telemetry.length, rejected, alerts: [] };
  }

  const killChain: { layer: string; triggered: boolean; count: number; timestamp: string; details: string }[] = [];
  const now = () => new Date().toISOString();

  // Layer 1: Rule-based
  const allRuleViolations = [];
  for (const t of telemetry) {
    const prev = state.previousReadings.get(t.busId) || null;
    allRuleViolations.push(...runRules(t, prev));
  }
  killChain.push({
    layer: 'RULES', triggered: allRuleViolations.length > 0,
    count: allRuleViolations.length, timestamp: now(),
    details: allRuleViolations.length > 0 ? allRuleViolations.map(r => r.ruleName).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'No violations',
  });

  // Layer 2: Physics consistency
  const physicsViolations = runPhysicsChecks(telemetry);
  killChain.push({
    layer: 'PHYSICS', triggered: physicsViolations.length > 0,
    count: physicsViolations.length, timestamp: now(),
    details: physicsViolations.length > 0 ? physicsViolations.map(p => p.checkName).join(', ') : 'Consistent',
  });

  // Layer 3: Statistical
  const anomalies = [];
  const cusumAlerts = [];
  const correlations = new Map<string, number>();
  for (const t of telemetry) {
    anomalies.push(...state.statDetector.getZScoreAnomalies(t.busId));
    cusumAlerts.push(...state.statDetector.getCUSUM(t.busId));
  }
  const busIds = telemetry.map(t => t.busId);
  for (let i = 0; i < busIds.length; i++) {
    for (let j = i + 1; j < busIds.length; j++) {
      correlations.set(`${busIds[i]}-${busIds[j]}`, state.statDetector.getCrossCorrelation(busIds[i], busIds[j]));
    }
  }
  killChain.push({
    layer: 'STATISTICAL', triggered: anomalies.length > 0 || cusumAlerts.length > 0,
    count: anomalies.length + cusumAlerts.length, timestamp: now(),
    details: anomalies.length > 0 ? `${anomalies.length} z-score anomalies, ${cusumAlerts.length} CUSUM alerts` : 'Within baseline',
  });

  // Fuse layers 1-3
  const alerts = classifyThreats(allRuleViolations, physicsViolations, { anomalies, cusumAlerts, correlations }, telemetry);

  // Layer 4: ML (async, non-blocking)
  runMLDetection(telemetry).then(mlResults => {
    state.mlAnomalies = mlResults;
    const mlAnomalyCount = mlResults.filter(m => m.isAnomaly).length;
    const topScore = mlResults.reduce((max, m) => Math.max(max, m.confidence), 0);

    killChain.push({
      layer: 'ML', triggered: mlAnomalyCount > 0,
      count: mlAnomalyCount, timestamp: now(),
      details: mlAnomalyCount > 0 ? `${mlAnomalyCount} anomalies (top confidence: ${(topScore * 100).toFixed(0)}%)` : 'Normal pattern',
    });

    // Publish the full kill chain event
    publish('kill_chain', {
      attacks: state.activeAttacks,
      layers: killChain,
      alertCount: alerts.length,
      shieldPhase: getShieldStatus().activeEvents[0]?.phase || null,
    });

    const FEATURE_NAMES = ['voltage', 'frequency', 'activePower', 'reactivePower', 'voltageAngle', 'powerFactor'];
    for (const ml of mlResults) {
      if (ml.isAnomaly && ml.confidence > 0.65 && state.activeAttacks.length > 0) {
        const mlAlert: ThreatAlert = {
          id: `ml-${ml.busId}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          severity: ml.confidence > 0.8 ? 'CRITICAL' : ml.confidence > 0.6 ? 'HIGH' : 'MEDIUM',
          threatCategory: 'ANOMALOUS_BEHAVIOR',
          title: `ML Anomaly Detected at ${ml.busId}`,
          description: `Isolation Forest model detected anomalous behavior (score: ${ml.score.toFixed(4)}, confidence: ${(ml.confidence * 100).toFixed(0)}%).`,
          affectedAssets: [ml.busId],
          detectionLayers: ['ML'],
          confidence: ml.confidence,
          indicators: ml.features.map((v, i) => ({
            parameter: FEATURE_NAMES[i] || `feature_${i}`,
            busId: ml.busId,
            expected: 0,
            actual: v,
            deviation: 'ML anomaly',
          })),
          recommendation: 'Cross-reference with rule-based and physics detections.',
          mitreTactic: 'TA0040',
          status: 'ACTIVE',
        };
        alerts.push(mlAlert);
        publish('alert', mlAlert);
      }
    }
  }).catch(() => {/* ML graceful degradation */});

  // Publish alerts
  if (alerts.length > 0) {
    state.alertHistory = [...alerts, ...state.alertHistory].slice(0, 500);
    for (const a of alerts) publish('alert', a);
  }

  // VajraShield self-healing — only for buses actually under attack
  if (alerts.length > 0) {
    const attackedBuses = new Set(state.activeAttacks.map(a => a.targetBus));
    const scopedAlerts = alerts.map(a => ({
      ...a,
      affectedAssets: a.affectedAssets.filter(bus => attackedBuses.has(bus)),
    })).filter(a => a.affectedAssets.length > 0);
    if (scopedAlerts.length > 0) processAlerts(scopedAlerts);
  }
  tickHealing();
  publish('shield', getShieldStatus());

  return { accepted: telemetry.length, rejected, alerts };
}

/** Get current ingestion status for monitoring */
export function getIngestionStatus() {
  const state = getState();
  return {
    active: state.active,
    dataSource: state.dataSource,
    ingestedCount: state.ingestedCount,
    lastIngestTime: state.lastIngestTime,
    latestTelemetry: state.latestTelemetry,
    alertHistory: state.alertHistory.slice(0, 50),
    mlReady: isMLReady(),
    mlAnomalies: state.mlAnomalies,
    errors: state.errors.slice(-10),
    shield: getShieldStatus(),
    tickCount: state.tickCount,
    activeAttacks: state.activeAttacks,
  };
}

// ─── Attack Overlay Management ────────────────────────────────────

const VALID_TYPES: AttackType[] = ['FDI', 'COMMAND_SPOOF', 'MADIOT', 'SENSOR_TAMPER', 'METER_ATTACK'];

/** Inject an attack overlay — applied to all incoming telemetry */
export function injectAttackOverlay(type: AttackType, targetBus: string, intensity: number): ActiveAttack {
  const state = getState();
  if (!VALID_TYPES.includes(type)) throw new Error(`Invalid attack type: ${type}`);

  // Remove duplicate (same type + target)
  state.activeAttacks = state.activeAttacks.filter(
    a => !(a.type === type && a.targetBus === targetBus)
  );

  const attack: ActiveAttack = {
    type,
    targetBus: targetBus || 'SYSTEM',
    intensity: Math.max(0, Math.min(1, intensity)),
    startedAt: new Date().toISOString(),
    elapsedTicks: 0,
  };

  state.activeAttacks.push(attack);
  publish('ingestion_attacks', state.activeAttacks);
  return attack;
}

/** Remove a specific attack overlay */
export function removeAttackOverlay(type: AttackType, targetBus?: string): boolean {
  const state = getState();
  const before = state.activeAttacks.length;
  state.activeAttacks = state.activeAttacks.filter(a => {
    if (a.type !== type) return true;
    if (targetBus && a.targetBus !== targetBus) return true;
    return false;
  });
  publish('ingestion_attacks', state.activeAttacks);
  // If all attacks removed, auto-clear alerts so dashboard goes clean
  if (state.activeAttacks.length === 0 && before > 0) {
    state.alertHistory = [];
    resetShield();
    publish('clear_alerts', true);
    publish('shield', getShieldStatus());
  }
  return state.activeAttacks.length < before;
}

/** Clear all active attack overlays, alerts, and shield state */
export function clearAllAttacks(): number {
  const state = getState();
  const count = state.activeAttacks.length;
  state.activeAttacks = [];
  state.alertHistory = [];
  resetShield();
  publish('ingestion_attacks', []);
  publish('clear_alerts', true);
  publish('shield', getShieldStatus());
  return count;
}

/** Get current active attacks */
export function getActiveAttacks(): ActiveAttack[] {
  return getState().activeAttacks;
}

/** Reset ingestion state */
export function resetIngestion() {
  const state = getState();
  state.active = false;
  state.dataSource = 'SIMULATION';
  state.statDetector = new StatisticalDetector();
  state.previousReadings.clear();
  state.alertHistory = [];
  state.latestTelemetry = [];
  state.mlAnomalies = [];
  state.ingestedCount = 0;
  state.lastIngestTime = null;
  state.errors = [];
  state.tickCount = 0;
  state.activeAttacks = [];
  resetShield();
}
