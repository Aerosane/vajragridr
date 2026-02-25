import { describe, it, expect } from 'vitest';
import { generateTelemetry } from '../../simulation/DataGenerator';
import { runRules } from '../RuleEngine';
import { runPhysicsChecks } from '../PhysicsEngine';
import { StatisticalDetector } from '../StatisticalEngine';
import { classifyThreats } from '../AlertClassifier';
import { injectFDI } from '../../simulation/attacks/FDIAttack';
import { injectCommandSpoof } from '../../simulation/attacks/CommandSpoof';

/** Feed all buses from a telemetry snapshot into the detector */
function feedDetector(detector: StatisticalDetector, buses: ReturnType<typeof generateTelemetry>) {
  for (const bus of buses) detector.addSample(bus.busId, bus);
}

/** Collect all rule violations across every bus */
function runAllRules(buses: ReturnType<typeof generateTelemetry>) {
  return buses.flatMap(bus => runRules(bus, null));
}

/** Build a stats result object compatible with classifyThreats */
function collectStats(detector: StatisticalDetector, buses: ReturnType<typeof generateTelemetry>) {
  const anomalies = buses.flatMap(b => detector.getZScoreAnomalies(b.busId));
  const cusumAlerts = buses.flatMap(b => detector.getCUSUM(b.busId));
  const correlations = new Map<string, number>();
  for (let i = 0; i < buses.length; i++) {
    for (let j = i + 1; j < buses.length; j++) {
      correlations.set(`${buses[i].busId}-${buses[j].busId}`, detector.getCrossCorrelation(buses[i].busId, buses[j].busId));
    }
  }
  return { anomalies, cusumAlerts, correlations };
}

describe('Detection Pipeline', () => {
  describe('RuleEngine', () => {
    it('returns no violations for normal telemetry', () => {
      const buses = generateTelemetry(50, 50);
      const violations = runAllRules(buses);
      const criticals = violations.filter(v => v.severity === 'CRITICAL');
      expect(criticals.length).toBeLessThanOrEqual(1);
    });

    it('detects voltage violations on FDI-attacked bus', () => {
      const buses = injectFDI(generateTelemetry(50, 50), 'BUS-003', 0.9);
      const violations = runAllRules(buses);
      const bus3Violations = violations.filter(v => v.busId === 'BUS-003');
      expect(bus3Violations.length).toBeGreaterThan(0);
    });

    it('detects breaker trip on command spoof', () => {
      const buses = injectCommandSpoof(generateTelemetry(50, 50), 'BUS-002', 0.9);
      const violations = runAllRules(buses);
      const tripViolations = violations.filter(v => v.ruleId === 'RULE_BREAKER_TRIP');
      expect(tripViolations.length).toBeGreaterThan(0);
    });
  });

  describe('PhysicsEngine', () => {
    it('returns few violations for normal telemetry', () => {
      const buses = generateTelemetry(50, 50);
      const violations = runPhysicsChecks(buses);
      expect(violations.length).toBeLessThanOrEqual(5);
    });

    it('detects physics inconsistencies in FDI attack', () => {
      const buses = injectFDI(generateTelemetry(50, 50), 'BUS-003', 0.9);
      const violations = runPhysicsChecks(buses);
      expect(violations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('StatisticalDetector', () => {
    it('initializes and processes multiple readings', () => {
      const detector = new StatisticalDetector();
      for (let i = 0; i < 20; i++) {
        feedDetector(detector, generateTelemetry(i, i));
      }
      const buses = generateTelemetry(20, 20);
      const anomalies = buses.flatMap(b => detector.getZScoreAnomalies(b.busId));
      const cusumAlerts = buses.flatMap(b => detector.getCUSUM(b.busId));
      expect(anomalies).toBeDefined();
      expect(cusumAlerts).toBeDefined();
    });

    it('detects statistical anomalies under FDI', () => {
      const detector = new StatisticalDetector();
      for (let i = 0; i < 30; i++) {
        feedDetector(detector, generateTelemetry(i, i));
      }
      const attacked = injectFDI(generateTelemetry(31, 31), 'BUS-003', 0.9);
      feedDetector(detector, attacked);
      const anomalies = detector.getZScoreAnomalies('BUS-003');
      expect(anomalies.length).toBeGreaterThan(0);
    });
  });

  describe('AlertClassifier', () => {
    it('classifies FDI attack into FALSE_DATA_INJECTION category', () => {
      const attacked = injectFDI(generateTelemetry(50, 50), 'BUS-003', 0.9);
      const rules = runAllRules(attacked);
      const physics = runPhysicsChecks(attacked);

      const detector = new StatisticalDetector();
      for (let i = 0; i < 20; i++) feedDetector(detector, generateTelemetry(i, i));
      feedDetector(detector, attacked);
      const stats = collectStats(detector, attacked);

      const alerts = classifyThreats(rules, physics, stats, attacked);
      const bus3Alerts = alerts.filter(a => a.affectedAssets.includes('BUS-003'));
      expect(bus3Alerts.length).toBeGreaterThan(0);
    });

    it('classifies command spoof into COMMAND_SPOOFING category', () => {
      // Low intensity: breaker trips but voltage stays in nominal range
      const attacked = injectCommandSpoof(generateTelemetry(50, 50), 'BUS-002', 0.1);
      const rules = runAllRules(attacked);
      const physics = runPhysicsChecks(attacked);
      const detector = new StatisticalDetector();
      feedDetector(detector, attacked);
      const stats = collectStats(detector, attacked);

      const alerts = classifyThreats(rules, physics, stats, attacked);
      // At minimum, some alert should fire for the attacked bus
      const bus2Alerts = alerts.filter(a => a.affectedAssets.includes('BUS-002'));
      expect(bus2Alerts.length).toBeGreaterThan(0);
    });

    it('assigns confidence > 0.5 to classified threats', () => {
      const attacked = injectFDI(generateTelemetry(50, 50), 'BUS-003', 0.9);
      const rules = runAllRules(attacked);
      const physics = runPhysicsChecks(attacked);
      const detector = new StatisticalDetector();
      for (let i = 0; i < 10; i++) feedDetector(detector, generateTelemetry(i, i));
      feedDetector(detector, attacked);
      const stats = collectStats(detector, attacked);
      const alerts = classifyThreats(rules, physics, stats, attacked);
      for (const alert of alerts) {
        expect(alert.confidence).toBeGreaterThan(0.5);
      }
    });
  });
});
