import type { ThreatAlert, ThreatCategory, AlertSeverity, Indicator, AlertStatus } from '@/lib/types/alerts';
import type { GridTelemetry } from '@/lib/types/grid';
import type { RuleViolation } from './RuleEngine';
import type { PhysicsViolation } from './PhysicsEngine';
import type { Anomaly, CUSUMResult } from './StatisticalEngine';

export function classifyThreats(
  rules: RuleViolation[],
  physics: PhysicsViolation[],
  stats: { anomalies: Anomaly[], cusumAlerts: CUSUMResult[], correlations: Map<string, number> },
  currentTelemetry: GridTelemetry[]
): ThreatAlert[] {
  const alerts: ThreatAlert[] = [];
  const now = new Date().toISOString();

  // Helper to find relevant telemetry for a bus
  const getTelemetry = (busId: string) => currentTelemetry.find(t => t.busId === busId);

  // 1. Check for False Data Injection (FDI)
  // Indicators: Physics equation inconsistencies, high Z-scores on multiple parameters, low correlation with neighbors
  const physicsInconsistencies = physics.filter(p => p.type === 'CONSISTENCY' || p.type === 'COUPLING');
  const busFdiSignals = new Map<string, { rules: RuleViolation[], physics: PhysicsViolation[], anomalies: Anomaly[] }>();

  physicsInconsistencies.forEach(p => {
    p.affectedBuses.forEach(busId => {
      if (!busFdiSignals.has(busId)) busFdiSignals.set(busId, { rules: [], physics: [], anomalies: [] });
      busFdiSignals.get(busId)!.physics.push(p);
    });
  });

  stats.anomalies.forEach(a => {
    if (!busFdiSignals.has(a.busId)) busFdiSignals.set(a.busId, { rules: [], physics: [], anomalies: [] });
    busFdiSignals.get(a.busId)!.anomalies.push(a);
  });

  rules.forEach(r => {
    if (!busFdiSignals.has(r.busId)) busFdiSignals.set(r.busId, { rules: [], physics: [], anomalies: [] });
    busFdiSignals.get(r.busId)!.rules.push(r);
  });

  busFdiSignals.forEach((signals, busId) => {
    const hasPhysics = signals.physics.length > 0;
    const hasStats = signals.anomalies.length > 1; // More than one parameter anomalous
    const hasRules = signals.rules.some(r => r.ruleId === 'RULE_VOLT_ROC' || r.ruleId === 'RULE_ROCOF_CRIT');

    if (hasPhysics && (hasStats || hasRules)) {
      const indicators: Indicator[] = [];
      signals.physics.forEach(p => indicators.push({ parameter: p.type, busId, expected: 0, actual: 0, deviation: p.details }));
      signals.anomalies.forEach(a => indicators.push({ parameter: a.parameter, busId, expected: 0, actual: a.value, deviation: `Z-Score: ${a.zScore.toFixed(2)}` }));

      alerts.push({
        id: `alert-fdi-${busId}-${Date.now()}`,
        timestamp: now,
        severity: signals.rules.some(r => r.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
        threatCategory: 'FALSE_DATA_INJECTION',
        title: `Possible FDI Attack on ${busId}`,
        description: `Physical consistency checks failed along with statistical anomalies at ${busId}, indicating telemetry data manipulation.`,
        affectedAssets: [busId],
        detectionLayers: ['PHYSICS', 'STATISTICAL', 'RULES'].slice(0, (hasPhysics ? 1 : 0) + (hasStats ? 1 : 0) + (hasRules ? 1 : 0)),
        confidence: 0.7 + (hasPhysics ? 0.2 : 0) + (hasStats ? 0.1 : 0),
        indicators,
        recommendation: `Isolate ${busId} telemetry; rely on redundant PMU data if available; check integrity of local RTU.`,
        mitreTactic: 'T0830: Man-in-the-Middle',
        status: 'ACTIVE'
      });
    }
  });

  // 2. Check for Command Spoofing
  // Indicators: Unexpected breaker trip while grid state is nominal (no faults, no overloads)
  const trips = rules.filter(r => r.ruleId === 'RULE_BREAKER_TRIP');
  trips.forEach(trip => {
    const busId = trip.busId;
    const telemetry = getTelemetry(busId);
    
    // Check if there was any physical reason for a trip (overload, low voltage, etc.)
    const otherViolations = rules.filter(r => r.busId === busId && r.ruleId !== 'RULE_BREAKER_TRIP');
    const isNominalBeforeTrip = otherViolations.length === 0;

    if (isNominalBeforeTrip) {
      alerts.push({
        id: `alert-spoof-${busId}-${Date.now()}`,
        timestamp: now,
        severity: 'CRITICAL',
        threatCategory: 'COMMAND_SPOOFING',
        title: `Unauthorized Breaker Operation at ${busId}`,
        description: `Circuit breaker tripped at ${busId} without any detected electrical fault or overload, suggesting a spoofed control command.`,
        affectedAssets: [busId],
        detectionLayers: ['RULES'],
        confidence: 0.85,
        indicators: [{ parameter: 'breakerStatus', busId, expected: 1, actual: 0, deviation: 'Uncommanded TRIP' }],
        recommendation: `Validate breaker control logs; check for unauthorized access to substation control network.`,
        mitreTactic: 'T0859: Valid Accounts',
        status: 'ACTIVE'
      });
    }
  });

  // 3. Check for Sensor Tampering
  // Indicators: Zero meter reading while active power is present
  const zeroMeters = rules.filter(r => r.ruleId === 'RULE_ZERO_METER');
  zeroMeters.forEach(zm => {
    alerts.push({
      id: `alert-sensor-${zm.busId}-${Date.now()}`,
      timestamp: now,
      severity: 'HIGH',
      threatCategory: 'SENSOR_TAMPERING',
      title: `Sensor Tampering at ${zm.busId}`,
      description: `Discrepancy between meter consumption and real-time active power flow at ${zm.busId}.`,
      affectedAssets: [zm.busId],
      detectionLayers: ['RULES'],
      confidence: 0.9,
      indicators: [{ parameter: 'meterConsumption', busId: zm.busId, expected: 1, actual: 0, deviation: 'Zero reading with active power' }],
      recommendation: `Inspect physical integrity of sensors and meters at ${zm.busId}; check for local bypass.`,
      mitreTactic: 'T0839: Modify Parameter',
      status: 'ACTIVE'
    });
  });

  // 4. Check for Load Manipulation
  // Indicators: Power imbalance + high load forecast deviation
  const powerImbalance = physics.find(p => p.checkId === 'PHYS_PWR_BALANCE');
  if (powerImbalance) {
    const highDeviations = currentTelemetry
      .map(t => ({ busId: t.busId, dev: stats.correlations.get(t.busId) || 0 })) // Wait, use forecast deviation if available
      .filter(d => d.dev > 0.25); // Placeholder for load forecast deviation logic

    if (highDeviations.length > 0) {
      alerts.push({
        id: `alert-load-${Date.now()}`,
        timestamp: now,
        severity: 'HIGH',
        threatCategory: 'LOAD_MANIPULATION',
        title: 'Coordinated Load Manipulation',
        description: 'System-wide power imbalance coupled with significant load deviations at multiple buses.',
        affectedAssets: highDeviations.map(d => d.busId),
        detectionLayers: ['PHYSICS', 'STATISTICAL'],
        confidence: 0.75,
        indicators: [{ parameter: 'loadBalance', busId: 'SYSTEM', expected: 0, actual: 1, deviation: powerImbalance.details }],
        recommendation: 'Implement load shedding if necessary; check for coordinated manipulation of demand response systems.',
        mitreTactic: 'T0831: Data of Physical Processes',
        status: 'ACTIVE'
      });
    }
  }

  // 5. Check for Smart Meter Compromise
  // Indicators: Rule zero meter specifically at load-heavy buses
  const loadBusesWithZeroMeter = zeroMeters.filter(zm => {
    const t = getTelemetry(zm.busId);
    return t && t.meterCount > 100; // Assume > 100 meters indicates a consumer/load bus
  });

  loadBusesWithZeroMeter.forEach(zm => {
    alerts.push({
      id: `alert-meter-${zm.busId}-${Date.now()}`,
      timestamp: now,
      severity: 'MEDIUM',
      threatCategory: 'SMART_METER_COMPROMISE',
      title: `Smart Meter Infrastructure Compromise at ${zm.busId}`,
      description: `Large-scale loss of meter data reporting at ${zm.busId} while power delivery continues.`,
      affectedAssets: [zm.busId],
      detectionLayers: ['RULES'],
      confidence: 0.8,
      indicators: [{ parameter: 'meterCount', busId: zm.busId, expected: 100, actual: 0, deviation: 'Total reporting failure' }],
      recommendation: 'Audit AMI (Advanced Metering Infrastructure) head-end; check for local wireless jammer or firmware attack.',
      mitreTactic: 'T0816: Device, File, or Data Deletion',
      status: 'ACTIVE'
    });
  });

  // 6. Default: Rule violations that didn't match specific attack patterns
  rules.forEach(rule => {
    const alreadyAlerted = alerts.some(a => a.affectedAssets.includes(rule.busId));
    if (!alreadyAlerted && rule.severity === 'CRITICAL') {
      alerts.push({
        id: `alert-rule-${rule.ruleId}-${rule.busId}-${Date.now()}`,
        timestamp: now,
        severity: rule.severity,
        threatCategory: 'UNKNOWN_ANOMALY',
        title: `${rule.ruleName} at ${rule.busId}`,
        description: rule.message,
        affectedAssets: [rule.busId],
        detectionLayers: ['RULES'],
        confidence: 0.6,
        indicators: [{ parameter: 'rule', busId: rule.busId, expected: 0, actual: 1, deviation: rule.message }],
        recommendation: `Investigate the root cause of the ${rule.ruleName}; monitor closely for escalating issues.`,
        mitreTactic: 'T0800: Initial Access',
        status: 'ACTIVE'
      });
    }
  });

  return alerts;
}
