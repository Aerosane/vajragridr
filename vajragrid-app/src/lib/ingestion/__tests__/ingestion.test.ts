import { describe, it, expect, beforeEach } from 'vitest';
import { ingestTelemetry, getIngestionStatus, resetIngestion, normalizeRawTelemetry } from '../IngestionEngine';
import { generatePlaceholderBatch } from '../PlaceholderDataSource';

describe('IngestionEngine', () => {
  beforeEach(() => {
    resetIngestion();
  });

  describe('normalizeRawTelemetry', () => {
    it('rejects payloads without busId', () => {
      expect(normalizeRawTelemetry({ voltage: 230 })).toBeNull();
      expect(normalizeRawTelemetry({})).toBeNull();
    });

    it('normalizes a minimal payload with defaults', () => {
      const result = normalizeRawTelemetry({ busId: 'BUS-001' });
      expect(result).not.toBeNull();
      expect(result!.busId).toBe('BUS-001');
      expect(result!.voltage).toBe(230); // default
      expect(result!.frequency).toBe(50.0); // default
      expect(result!.breakerStatus).toBe('CLOSED');
      expect(result!.dataQuality).toBe('GOOD');
      expect(result!.source).toBe('RTU');
    });

    it('normalizes a full IoT payload', () => {
      const result = normalizeRawTelemetry({
        busId: 'BUS-003',
        voltage: 228.5,
        frequency: 49.98,
        activePower: -72.3,
        reactivePower: -15.2,
        current: 185.4,
        powerFactor: 0.92,
        phaseAngle: -12.5,
        breakerStatus: 'CLOSED',
        source: 'PMU',
        dataQuality: 'GOOD',
      });
      expect(result).not.toBeNull();
      expect(result!.voltage).toBe(228.5);
      expect(result!.frequency).toBe(49.98);
      expect(result!.activePower).toBe(-72.3);
      expect(result!.source).toBe('PMU');
    });

    it('handles string numbers from IoT sensors', () => {
      const result = normalizeRawTelemetry({
        busId: 'BUS-002',
        voltage: '229.1',
        frequency: '50.02',
      });
      expect(result!.voltage).toBe(229.1);
      expect(result!.frequency).toBe(50.02);
    });

    it('normalizes invalid enum values to defaults', () => {
      const result = normalizeRawTelemetry({
        busId: 'BUS-001',
        breakerStatus: 'INVALID',
        dataQuality: 'UNKNOWN',
        source: 'INVALID',
      });
      expect(result!.breakerStatus).toBe('CLOSED');
      expect(result!.dataQuality).toBe('GOOD');
      expect(result!.source).toBe('RTU');
    });
  });

  describe('ingestTelemetry', () => {
    it('accepts valid telemetry batch', () => {
      const batch = [
        { busId: 'BUS-001', voltage: 230, frequency: 50.0, activePower: 120 },
        { busId: 'BUS-003', voltage: 228, frequency: 49.98, activePower: -72 },
      ];
      const result = ingestTelemetry(batch);
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(0);
    });

    it('rejects invalid entries and accepts valid ones', () => {
      const batch = [
        { busId: 'BUS-001', voltage: 230 }, // valid
        { voltage: 230 }, // no busId — rejected
        { busId: 'BUS-003' }, // valid with defaults
      ];
      const result = ingestTelemetry(batch);
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(1);
    });

    it('returns empty result for all-invalid batch', () => {
      const result = ingestTelemetry([{ invalid: true }, {}]);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(2);
    });

    it('updates ingestion status', () => {
      const batch = [{ busId: 'BUS-001', voltage: 230 }];
      ingestTelemetry(batch);
      const status = getIngestionStatus();
      expect(status.active).toBe(true);
      expect(status.dataSource).toBe('LIVE');
      expect(status.ingestedCount).toBe(1);
      expect(status.lastIngestTime).not.toBeNull();
    });

    it('accumulates ingested count across calls', () => {
      ingestTelemetry([{ busId: 'BUS-001' }]);
      ingestTelemetry([{ busId: 'BUS-002' }, { busId: 'BUS-003' }]);
      expect(getIngestionStatus().ingestedCount).toBe(3);
    });
  });

  describe('PlaceholderDataSource', () => {
    it('generates a batch for all 5 buses', () => {
      const batch = generatePlaceholderBatch();
      expect(batch.length).toBe(5);
      expect(batch.every(b => typeof b.busId === 'string')).toBe(true);
    });

    it('generates valid telemetry that normalizes successfully', () => {
      const batch = generatePlaceholderBatch();
      for (const raw of batch) {
        const normalized = normalizeRawTelemetry(raw as Record<string, unknown>);
        expect(normalized).not.toBeNull();
        expect(normalized!.voltage).toBeGreaterThan(200);
        expect(normalized!.voltage).toBeLessThan(260);
        expect(normalized!.frequency).toBeGreaterThan(49.9);
        expect(normalized!.frequency).toBeLessThan(50.1);
      }
    });

    it('placeholder data ingests successfully through the full pipeline', () => {
      const batch = generatePlaceholderBatch();
      const result = ingestTelemetry(batch as Record<string, unknown>[]);
      expect(result.accepted).toBe(5);
      expect(result.rejected).toBe(0);
    });
  });

  describe('resetIngestion', () => {
    it('clears all state', () => {
      ingestTelemetry([{ busId: 'BUS-001' }]);
      resetIngestion();
      const status = getIngestionStatus();
      expect(status.active).toBe(false);
      expect(status.dataSource).toBe('SIMULATION');
      expect(status.ingestedCount).toBe(0);
      expect(status.lastIngestTime).toBeNull();
    });
  });
});
