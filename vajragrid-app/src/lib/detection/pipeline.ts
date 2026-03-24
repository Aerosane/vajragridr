/**
 * Detection Pipeline — wires SimulationEngine → Detection → Alerts → VajraShield
 * Uses globalThis to survive Next.js dev mode module reloading.
 * 4-layer detection: Rules → Physics → Statistical → ML (ONNX)
 * + VajraShield: Autonomous Self-Healing Response
 */
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { runRules } from './RuleEngine';
import { runPhysicsChecks } from './PhysicsEngine';
import { StatisticalDetector } from './StatisticalEngine';
import { classifyThreats } from './AlertClassifier';
import { runMLDetection, isMLReady } from './MLDetector';
import { processAlerts, tickHealing, resetShield, getShieldStatus } from '@/lib/healing';
import { setOnBusHealedCallback } from '@/lib/healing/SelfHealingEngine';
import { publish } from '@/lib/events/EventBus';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';

/** Ticks to skip detection at startup while telemetry baselines stabilize */
const STARTUP_GRACE_TICKS = 30;

interface PipelineState {
  statDetector: StatisticalDetector;
  previousReadings: Map<string, GridTelemetry>;
  alertHistory: ThreatAlert[];
  latestTelemetry: GridTelemetry[];
  mlAnomalies: { busId: string; score: number; isAnomaly: boolean; confidence: number }[];
  initialized: boolean;
  tickCount: number;
}

const g = globalThis as unknown as { __vajraPipeline?: PipelineState };

function getState(): PipelineState {
  if (!g.__vajraPipeline) {
    g.__vajraPipeline = {
      statDetector: new StatisticalDetector(),
      previousReadings: new Map(),
      alertHistory: [],
      latestTelemetry: [],
      mlAnomalies: [],
      initialized: false,
      tickCount: 0,
    };
  }
  return g.__vajraPipeline;
}

export function ensureDetectionPipeline() {
  const state = getState();
  if (state.initialized) return;
  state.initialized = true;

  const engine = getSimulationEngine();

  // When VajraShield heals a bus, auto-remove its attack from simulation
  setOnBusHealedCallback((busId: string) => {
    const simState = engine.getState();
    const busAttacks = simState.activeAttacks.filter(a => a.targetBus === busId);
    for (const a of busAttacks) {
      engine.removeAttack(a.type, busId);
    }
    const updatedState = engine.getState();
    publish('simulation_state', updatedState);
    if (updatedState.activeAttacks.length === 0) {
      state.alertHistory = [];
      publish('clear_alerts', true);
    }
  });

  engine.setCallbacks({
    onTelemetry: (telemetry: GridTelemetry[]) => {
      state.latestTelemetry = telemetry;
      state.tickCount++;
      publish('telemetry', telemetry);

      // Always collect samples for baseline even during grace period
      for (const t of telemetry) {
        state.previousReadings.set(t.busId, t);
        state.statDetector.addSample(t.busId, t);
      }

      // Startup grace: let baselines stabilize before firing alerts
      if (state.tickCount <= STARTUP_GRACE_TICKS) {
        return;
      }

      // Layer 1: Rule-based detection
      const allRuleViolations = [];
      for (const t of telemetry) {
        const prev = state.previousReadings.get(t.busId) || null;
        allRuleViolations.push(...runRules(t, prev));
      }

      // Layer 2: Physics consistency
      const physicsViolations = runPhysicsChecks(telemetry);

      // Layer 3: Statistical anomalies
      const anomalies = [];
      const cusumAlerts = [];
      const correlations = new Map<string, number>();
      for (const t of telemetry) {
        anomalies.push(...state.statDetector.getZScoreAnomalies(t.busId));
        cusumAlerts.push(...state.statDetector.getCUSUM(t.busId));
      }
      const busPairs = [
        ['BUS-001', 'BUS-003'], ['BUS-001', 'BUS-002'],
        ['BUS-002', 'BUS-004'], ['BUS-003', 'BUS-005'],
        ['BUS-004', 'BUS-005'], ['BUS-002', 'BUS-003'],
      ];
      for (const [b1, b2] of busPairs) {
        correlations.set(`${b1}-${b2}`, state.statDetector.getCrossCorrelation(b1, b2));
      }

      // Fuse layers 1-3 → alerts
      const alerts = classifyThreats(allRuleViolations, physicsViolations, { anomalies, cusumAlerts, correlations }, telemetry);

      // Layer 4: ML anomaly detection (async, non-blocking)
      runMLDetection(telemetry).then(mlResults => {
        state.mlAnomalies = mlResults;
        // Generate ML-specific alerts for anomalies
        for (const ml of mlResults) {
          if (ml.isAnomaly && ml.confidence > 0.65) {
            const FEATURE_NAMES = ['voltage', 'frequency', 'activePower', 'reactivePower', 'voltageAngle', 'powerFactor'];
            const mlAlert: ThreatAlert = {
              id: `ml-${ml.busId}-${Date.now()}`,
              timestamp: new Date().toISOString(),
              severity: ml.confidence > 0.8 ? 'CRITICAL' : ml.confidence > 0.6 ? 'HIGH' : 'MEDIUM',
              threatCategory: 'ANOMALOUS_BEHAVIOR',
              title: `ML Anomaly Detected at ${ml.busId}`,
              description: `Isolation Forest model detected anomalous behavior (score: ${ml.score.toFixed(4)}, confidence: ${(ml.confidence * 100).toFixed(0)}%). Pattern deviates from learned normal grid operation.`,
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
              recommendation: 'Cross-reference with rule-based and physics detections. Investigate bus telemetry for coordinated attack patterns.',
              mitreTactic: 'TA0040',
              status: 'ACTIVE',
            };
            alerts.push(mlAlert);
          }
        }
        if (alerts.length > 0) {
          state.alertHistory = [...alerts, ...state.alertHistory].slice(0, 500);
          for (const a of alerts) publish('alert', a);
        }
      }).catch(() => {/* ML layer graceful degradation */});

      // Also add non-ML alerts immediately (don't wait for ML)
      const nonMLAlerts = alerts.filter(a => !a.detectionLayers.includes('ML'));
      if (nonMLAlerts.length > 0) {
        state.alertHistory = [...nonMLAlerts, ...state.alertHistory].slice(0, 500);
        for (const a of nonMLAlerts) publish('alert', a);
      }

      // ─── VajraShield: Feed alerts to self-healing engine ───
      if (alerts.length > 0) {
        processAlerts(alerts);
      }
      tickHealing();
      // Publish shield status after healing tick
      const shieldStatus = getShieldStatus();
      publish('shield', shieldStatus);

      // Publish kill_chain data so KillChainTimeline works in simulation mode
      const simEngine = getSimulationEngine();
      const simState = simEngine.getState();
      if (simState.activeAttacks.length > 0 || alerts.length > 0) {
        const layerResults = [
          { layer: 'RULES', triggered: allRuleViolations.length > 0, count: allRuleViolations.length, timestamp: new Date().toISOString(), details: allRuleViolations.length > 0 ? `${allRuleViolations.length} rule violation(s)` : 'Clear' },
          { layer: 'PHYSICS', triggered: physicsViolations.length > 0, count: physicsViolations.length, timestamp: new Date().toISOString(), details: physicsViolations.length > 0 ? `${physicsViolations.length} physics anomal(y/ies)` : 'Clear' },
          { layer: 'STATISTICAL', triggered: anomalies.length > 0 || cusumAlerts.length > 0, count: anomalies.length + cusumAlerts.length, timestamp: new Date().toISOString(), details: (anomalies.length + cusumAlerts.length) > 0 ? `${anomalies.length} z-score, ${cusumAlerts.length} CUSUM` : 'Clear' },
          { layer: 'ML', triggered: state.mlAnomalies.some(m => m.isAnomaly), count: state.mlAnomalies.filter(m => m.isAnomaly).length, timestamp: new Date().toISOString(), details: state.mlAnomalies.some(m => m.isAnomaly) ? `${state.mlAnomalies.filter(m => m.isAnomaly).length} anomal(y/ies)` : 'Clear' },
        ];
        publish('kill_chain', {
          attacks: simState.activeAttacks.map((a: { type: string; targetBus?: string; intensity?: number }) => ({
            type: a.type,
            targetBus: a.targetBus || 'ALL',
            intensity: a.intensity || 0.5,
            startedAt: new Date().toISOString(),
            elapsedTicks: 0,
          })),
          layers: layerResults,
          alertCount: state.alertHistory.length,
          shieldPhase: shieldStatus.activeEvents?.[0]?.phase || null,
        });
      }
    },
    onSystemState: (data) => {
      publish('system_state', data);
    },
    onStateChange: (data) => {
      publish('simulation_state', data);
    },
  });
}

export function getLatestTelemetry(): GridTelemetry[] {
  return getState().latestTelemetry;
}

export function getAlertHistory(): ThreatAlert[] {
  return getState().alertHistory;
}

export function getMLStatus(): { ready: boolean; anomalies: PipelineState['mlAnomalies'] } {
  return { ready: isMLReady(), anomalies: getState().mlAnomalies };
}

export function resetPipeline() {
  const state = getState();
  state.alertHistory = [];
  state.latestTelemetry = [];
  state.previousReadings.clear();
  state.statDetector = new StatisticalDetector();
  state.tickCount = 0;
  state.initialized = false;
  resetShield();
}

export { getShieldStatus } from '@/lib/healing';
