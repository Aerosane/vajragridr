import { describe, it, expect, beforeEach } from 'vitest';
import { processAlerts, tickHealing, getShieldStatus, resetShield, isBreakerTripped, isBusIsolated } from '../index';
import type { ThreatAlert } from '@/lib/types/alerts';

/** ALERT_CONFIRM_TICKS = 2 in the engine — alerts must persist for 2 ticks before healing triggers */
const CONFIRM_TICKS = 2;

function makeMockAlert(busId: string, severity: 'CRITICAL' | 'HIGH' = 'CRITICAL'): ThreatAlert {
  return {
    id: `test-alert-${busId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    severity,
    threatCategory: 'FALSE_DATA_INJECTION',
    title: `Test FDI on ${busId}`,
    description: 'Test alert',
    affectedAssets: [busId],
    detectionLayers: ['PHYSICS', 'RULES'],
    confidence: 0.9,
    indicators: [],
    recommendation: 'Test',
    mitreTactic: 'T0830',
    status: 'ACTIVE',
  };
}

/** Confirm alerts for the required number of ticks so the shield creates a healing event */
function confirmAlerts(alerts: ThreatAlert[], ticks = CONFIRM_TICKS) {
  for (let i = 0; i < ticks; i++) {
    processAlerts(alerts);
  }
}

describe('SelfHealingEngine (VajraShield)', () => {
  beforeEach(() => {
    resetShield();
  });

  it('starts in idle state with no events', () => {
    const status = getShieldStatus();
    expect(status.active).toBe(true);
    expect(status.activeEvents).toHaveLength(0);
    expect(status.completedEvents).toHaveLength(0);
    expect(status.trippedBreakers).toHaveLength(0);
    expect(status.isolatedBuses).toHaveLength(0);
  });

  it('activates on CRITICAL alert after confirmation ticks', () => {
    const alert = makeMockAlert('BUS-003');
    confirmAlerts([alert]);
    const status = getShieldStatus();
    expect(status.active).toBe(true);
    expect(status.activeEvents.length).toBeGreaterThan(0);
    expect(status.activeEvents[0].affectedBus).toBe('BUS-003');
  });

  it('does not activate on LOW severity alerts', () => {
    const alert: ThreatAlert = {
      ...makeMockAlert('BUS-003'),
      severity: 'LOW',
    };
    confirmAlerts([alert]);
    const status = getShieldStatus();
    expect(status.activeEvents).toHaveLength(0);
  });

  it('progresses through healing phases on tick', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    
    const phase1 = getShieldStatus().activeEvents[0].phase;
    expect(phase1).toBe('DETECTING');

    // Tick through DETECTING phase (4 ticks required)
    for (let i = 0; i < 4; i++) tickHealing();
    const phase2 = getShieldStatus().activeEvents[0].phase;
    expect(phase2).toBe('ISOLATING');
  });

  it('isolates buses during ISOLATING phase', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    for (let i = 0; i < 4; i++) tickHealing(); // DETECTING → ISOLATING
    
    const status = getShieldStatus();
    expect(status.isolatedBuses).toContain('BUS-003');
    expect(isBusIsolated('BUS-003')).toBe(true);
  });

  it('trips breakers during ISOLATING phase', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    for (let i = 0; i < 4; i++) tickHealing(); // → ISOLATING
    
    const status = getShieldStatus();
    expect(status.trippedBreakers.length).toBeGreaterThan(0);
  });

  it('completes full heal cycle', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    
    // DETECTING(4) + ISOLATING(2) + REROUTING(2) + MONITORING(4) + RESTORING(2) = 14
    for (let i = 0; i < 18; i++) {
      tickHealing();
    }
    
    const status = getShieldStatus();
    expect(status.completedEvents.length).toBeGreaterThan(0);
    expect(status.completedEvents[0].phase).toBe('RESTORED');
    expect(status.completedEvents[0].totalDurationMs).toBeGreaterThan(0);
  });

  it('restores breakers after heal cycle', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    
    for (let i = 0; i < 18; i++) {
      tickHealing();
    }
    
    expect(isBreakerTripped('TL-01')).toBe(false);
    expect(isBusIsolated('BUS-003')).toBe(false);
  });

  it('handles multiple simultaneous events', () => {
    confirmAlerts([makeMockAlert('BUS-002'), makeMockAlert('BUS-004')]);
    
    const status = getShieldStatus();
    expect(status.activeEvents.length).toBe(2);
    const buses = status.activeEvents.map(e => e.affectedBus);
    expect(buses).toContain('BUS-002');
    expect(buses).toContain('BUS-004');
  });

  it('resets cleanly', () => {
    confirmAlerts([makeMockAlert('BUS-003')]);
    tickHealing();
    
    resetShield();
    const status = getShieldStatus();
    expect(status.active).toBe(true);
    expect(status.activeEvents).toHaveLength(0);
    expect(status.completedEvents).toHaveLength(0);
    expect(isBusIsolated('BUS-003')).toBe(false);
  });
});
