import { describe, it, expect } from 'vitest';
import { generateTelemetry, computeSystemState } from '../DataGenerator';

describe('DataGenerator', () => {
  describe('generateTelemetry', () => {
    it('generates telemetry for all 5 buses', () => {
      const telemetry = generateTelemetry(0);
      expect(telemetry).toHaveLength(5);
      const busIds = telemetry.map(t => t.busId);
      expect(busIds).toContain('BUS-001');
      expect(busIds).toContain('BUS-005');
    });

    it('produces voltages in realistic range (200-260 kV)', () => {
      const telemetry = generateTelemetry(10);
      for (const t of telemetry) {
        expect(t.voltage).toBeGreaterThan(200);
        expect(t.voltage).toBeLessThan(260);
      }
    });

    it('produces frequency near 50 Hz', () => {
      const telemetry = generateTelemetry(10);
      for (const t of telemetry) {
        expect(t.frequency).toBeGreaterThan(49.5);
        expect(t.frequency).toBeLessThan(50.5);
      }
    });

    it('includes line flows for each bus', () => {
      const telemetry = generateTelemetry(5);
      for (const t of telemetry) {
        expect(t.lineFlows).toBeDefined();
        expect(Array.isArray(t.lineFlows)).toBe(true);
      }
    });

    it('includes timestamp and breaker status', () => {
      const telemetry = generateTelemetry(0);
      for (const t of telemetry) {
        expect(t.timestamp).toBeDefined();
        expect(t.breakerStatus).toBe('CLOSED');
      }
    });

    it('produces different values for different ticks', () => {
      const t1 = generateTelemetry(0);
      const t2 = generateTelemetry(100);
      // Different ticks = different load curves = different voltages
      const v1 = t1[0].voltage;
      const v2 = t2[0].voltage;
      expect(v1).not.toBe(v2);
    });
  });

  describe('computeSystemState', () => {
    it('computes system state from telemetry', () => {
      const telemetry = generateTelemetry(10);
      const state = computeSystemState(telemetry);
      expect(state.totalGeneration).toBeGreaterThan(0);
      expect(state.totalLoad).toBeGreaterThan(0);
      expect(state.systemFrequency).toBeGreaterThan(49);
      expect(state.systemFrequency).toBeLessThan(51);
    });

    it('returns correct number of active buses', () => {
      const telemetry = generateTelemetry(10);
      const state = computeSystemState(telemetry);
      expect(state.activeBuses).toBe(5);
    });
  });
});
