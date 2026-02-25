/**
 * Detection Pipeline — wires SimulationEngine → Detection → Alerts
 * Uses globalThis to survive Next.js dev mode module reloading.
 */
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { runRules } from './RuleEngine';
import { runPhysicsChecks } from './PhysicsEngine';
import { StatisticalDetector } from './StatisticalEngine';
import { classifyThreats } from './AlertClassifier';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';

interface PipelineState {
  statDetector: StatisticalDetector;
  previousReadings: Map<string, GridTelemetry>;
  alertHistory: ThreatAlert[];
  latestTelemetry: GridTelemetry[];
  initialized: boolean;
}

const g = globalThis as unknown as { __vajraPipeline?: PipelineState };

function getState(): PipelineState {
  if (!g.__vajraPipeline) {
    g.__vajraPipeline = {
      statDetector: new StatisticalDetector(),
      previousReadings: new Map(),
      alertHistory: [],
      latestTelemetry: [],
      initialized: false,
    };
  }
  return g.__vajraPipeline;
}

export function ensureDetectionPipeline() {
  const state = getState();
  if (state.initialized) return;
  state.initialized = true;

  const engine = getSimulationEngine();
  engine.setCallbacks({
    onTelemetry: (telemetry: GridTelemetry[]) => {
      state.latestTelemetry = telemetry;

      // Layer 1: Rule-based detection
      const allRuleViolations = [];
      for (const t of telemetry) {
        const prev = state.previousReadings.get(t.busId) || null;
        allRuleViolations.push(...runRules(t, prev));
        state.previousReadings.set(t.busId, t);
        state.statDetector.addSample(t.busId, t);
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

      // Fuse all layers → alerts
      const alerts = classifyThreats(allRuleViolations, physicsViolations, { anomalies, cusumAlerts, correlations }, telemetry);
      if (alerts.length > 0) {
        state.alertHistory = [...alerts, ...state.alertHistory].slice(0, 500);
      }
    },
  });
}

export function getLatestTelemetry(): GridTelemetry[] {
  return getState().latestTelemetry;
}

export function getAlertHistory(): ThreatAlert[] {
  return getState().alertHistory;
}

export function resetPipeline() {
  const state = getState();
  state.alertHistory = [];
  state.latestTelemetry = [];
  state.previousReadings.clear();
  state.statDetector = new StatisticalDetector();
  state.initialized = false;
}
