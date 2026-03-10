import { THRESHOLDS } from '@/lib/constants/thresholds';
import type { GridTelemetry } from '@/lib/types/grid';
import type { AlertSeverity } from '@/lib/types/alerts';

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  busId: string;
}

export function runRules(current: GridTelemetry, previous: GridTelemetry | null): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { busId } = current;

  // 1. Voltage bounds
  if (current.voltage < THRESHOLDS.voltage.criticalLow) {
    violations.push({
      ruleId: 'RULE_VOLT_CRIT_LOW',
      ruleName: 'Critical Low Voltage',
      severity: 'CRITICAL',
      message: `Voltage ${current.voltage.toFixed(2)} kV below critical threshold ${THRESHOLDS.voltage.criticalLow} kV`,
      busId,
    });
  } else if (current.voltage > THRESHOLDS.voltage.criticalHigh) {
    violations.push({
      ruleId: 'RULE_VOLT_CRIT_HIGH',
      ruleName: 'Critical High Voltage',
      severity: 'CRITICAL',
      message: `Voltage ${current.voltage.toFixed(2)} kV above critical threshold ${THRESHOLDS.voltage.criticalHigh} kV`,
      busId,
    });
  } else if (current.voltage < THRESHOLDS.voltage.warningLow || current.voltage > THRESHOLDS.voltage.warningHigh) {
    violations.push({
      ruleId: 'RULE_VOLT_WARN',
      ruleName: 'Voltage Out of Normal Range',
      severity: 'MEDIUM',
      message: `Voltage ${current.voltage.toFixed(2)} kV outside normal range [${THRESHOLDS.voltage.warningLow}, ${THRESHOLDS.voltage.warningHigh}]`,
      busId,
    });
  }

  // 2. Frequency critical
  if (current.frequency < THRESHOLDS.frequency.criticalLow) {
    violations.push({
      ruleId: 'RULE_FREQ_CRIT_LOW',
      ruleName: 'Critical Low Frequency',
      severity: 'CRITICAL',
      message: `Frequency ${current.frequency.toFixed(3)} Hz below critical threshold ${THRESHOLDS.frequency.criticalLow} Hz`,
      busId,
    });
  } else if (current.frequency > THRESHOLDS.frequency.criticalHigh) {
    violations.push({
      ruleId: 'RULE_FREQ_CRIT_HIGH',
      ruleName: 'Critical High Frequency',
      severity: 'CRITICAL',
      message: `Frequency ${current.frequency.toFixed(3)} Hz above critical threshold ${THRESHOLDS.frequency.criticalHigh} Hz`,
      busId,
    });
  }

  // 3. Voltage rate-of-change
  if (previous) {
    const voltChange = Math.abs(current.voltage - previous.voltage);
    if (voltChange > THRESHOLDS.voltage.rateOfChange) {
      violations.push({
        ruleId: 'RULE_VOLT_ROC',
        ruleName: 'Voltage Rate of Change Exceeded',
        severity: 'HIGH',
        message: `Voltage changed by ${voltChange.toFixed(2)} kV/s, exceeding limit ${THRESHOLDS.voltage.rateOfChange} kV/s`,
        busId,
      });
    }

    // 4. RoCoF exceeded
    const rocof = Math.abs(current.frequency - previous.frequency);
    if (rocof > THRESHOLDS.frequency.rocofCritical) {
      violations.push({
        ruleId: 'RULE_ROCOF_CRIT',
        ruleName: 'Critical Rate of Change of Frequency',
        severity: 'CRITICAL',
        message: `RoCoF ${rocof.toFixed(3)} Hz/s exceeds critical limit ${THRESHOLDS.frequency.rocofCritical} Hz/s`,
        busId,
      });
    } else if (rocof > THRESHOLDS.frequency.rocofWarning) {
      violations.push({
        ruleId: 'RULE_ROCOF_WARN',
        ruleName: 'Frequency Rate of Change Warning',
        severity: 'MEDIUM',
        message: `RoCoF ${rocof.toFixed(3)} Hz/s exceeds warning limit ${THRESHOLDS.frequency.rocofWarning} Hz/s`,
        busId,
      });
    }
  }

  // 5. Zero meter reading (significant power but no meter consumption)
  // Only applies to buses that have meters (meterCount > 0)
  if (current.meterCount > 0 && Math.abs(current.activePower) > 1.0 && current.meterConsumption === 0) {
    violations.push({
      ruleId: 'RULE_ZERO_METER',
      ruleName: 'Zero Meter Reading',
      severity: 'HIGH',
      message: `Bus is active (${current.activePower.toFixed(2)} MW) but reporting zero meter consumption`,
      busId,
    });
  }

  // 6. Unexpected breaker trip
  if (current.breakerStatus === 'TRIP') {
    violations.push({
      ruleId: 'RULE_BREAKER_TRIP',
      ruleName: 'Breaker Trip Detected',
      severity: 'CRITICAL',
      message: `Circuit breaker at ${busId} has tripped unexpectedly`,
      busId,
    });
  }

  // 7. Line overload
  current.lineFlows.forEach(line => {
    if (line.loadingPercent > THRESHOLDS.lineLoading.critical) {
      violations.push({
        ruleId: 'RULE_LINE_OVERLOAD_CRIT',
        ruleName: 'Critical Line Overload',
        severity: 'CRITICAL',
        message: `Line ${line.lineId} loading at ${line.loadingPercent.toFixed(1)}% exceeds critical threshold ${THRESHOLDS.lineLoading.critical}%`,
        busId,
      });
    } else if (line.loadingPercent > THRESHOLDS.lineLoading.warning) {
      violations.push({
        ruleId: 'RULE_LINE_OVERLOAD_WARN',
        ruleName: 'Line Loading Warning',
        severity: 'MEDIUM',
        message: `Line ${line.lineId} loading at ${line.loadingPercent.toFixed(1)}% exceeds warning threshold ${THRESHOLDS.lineLoading.warning}%`,
        busId,
      });
    }
  });

  // 8. Low power factor
  if (current.powerFactor < THRESHOLDS.powerFactor.critical) {
    violations.push({
      ruleId: 'RULE_PF_CRIT',
      ruleName: 'Critical Power Factor',
      severity: 'HIGH',
      message: `Power factor ${current.powerFactor.toFixed(2)} below critical limit ${THRESHOLDS.powerFactor.critical}`,
      busId,
    });
  } else if (current.powerFactor < THRESHOLDS.powerFactor.warning) {
    violations.push({
      ruleId: 'RULE_PF_WARN',
      ruleName: 'Low Power Factor Warning',
      severity: 'LOW',
      message: `Power factor ${current.powerFactor.toFixed(2)} below warning limit ${THRESHOLDS.powerFactor.warning}`,
      busId,
    });
  }

  // 9. Transformer overheat
  if (current.transformerTemp > THRESHOLDS.transformer.criticalTemp) {
    violations.push({
      ruleId: 'RULE_TEMP_CRIT',
      ruleName: 'Critical Transformer Temperature',
      severity: 'CRITICAL',
      message: `Transformer temperature ${current.transformerTemp.toFixed(1)}°C exceeds critical limit ${THRESHOLDS.transformer.criticalTemp}°C`,
      busId,
    });
  } else if (current.transformerTemp > THRESHOLDS.transformer.warningTemp) {
    violations.push({
      ruleId: 'RULE_TEMP_WARN',
      ruleName: 'Transformer Temperature Warning',
      severity: 'MEDIUM',
      message: `Transformer temperature ${current.transformerTemp.toFixed(1)}°C exceeds warning limit ${THRESHOLDS.transformer.warningTemp}°C`,
      busId,
    });
  }

  return violations;
}
