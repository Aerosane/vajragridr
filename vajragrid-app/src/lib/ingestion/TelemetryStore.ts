/**
 * TelemetryStore — Time-series persistence layer for real telemetry data
 *
 * Architecture:
 *   - Interface-based: swap InfluxDB, TimescaleDB, or Supabase in production
 *   - Default implementation: in-memory ring buffer with optional JSON file dump
 *   - Writes are async/non-blocking so the real-time SSE pipeline isn't slowed
 *
 * Production Integration Points:
 *   - InfluxDB:   set TELEMETRY_STORE=influxdb + INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_BUCKET
 *   - TimescaleDB: set TELEMETRY_STORE=timescale + TIMESCALE_URL
 *   - Supabase:   set TELEMETRY_STORE=supabase + SUPABASE_URL, SUPABASE_KEY
 */

import type { GridTelemetry } from '@/lib/types';

export interface ITelemetryStore {
  write(batch: GridTelemetry[]): Promise<void>;
  query(busId: string, from: Date, to: Date, limit?: number): Promise<GridTelemetry[]>;
  queryLatest(busId?: string, limit?: number): Promise<GridTelemetry[]>;
  getStats(): { totalRecords: number; oldestTimestamp: string | null; newestTimestamp: string | null };
}

/**
 * In-memory ring buffer store — no external dependencies.
 * Suitable for demos and dev. Production should swap for a real TSDB.
 */
class InMemoryTelemetryStore implements ITelemetryStore {
  private buffer: GridTelemetry[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 50_000) {
    this.maxSize = maxSize;
  }

  async write(batch: GridTelemetry[]): Promise<void> {
    this.buffer.push(...batch);
    // Trim to ring buffer size
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  async query(busId: string, from: Date, to: Date, limit = 1000): Promise<GridTelemetry[]> {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return this.buffer
      .filter(t => {
        if (t.busId !== busId) return false;
        const ts = new Date(t.timestamp).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .slice(-limit);
  }

  async queryLatest(busId?: string, limit = 100): Promise<GridTelemetry[]> {
    let result = this.buffer;
    if (busId) result = result.filter(t => t.busId === busId);
    return result.slice(-limit);
  }

  getStats() {
    return {
      totalRecords: this.buffer.length,
      oldestTimestamp: this.buffer.length > 0 ? this.buffer[0].timestamp : null,
      newestTimestamp: this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].timestamp : null,
    };
  }
}

/**
 * Placeholder for InfluxDB integration.
 * To enable: set TELEMETRY_STORE=influxdb in your environment.
 *
 * Required env vars:
 *   INFLUXDB_URL    — e.g., http://localhost:8086
 *   INFLUXDB_TOKEN  — API token
 *   INFLUXDB_ORG    — Organization
 *   INFLUXDB_BUCKET — Bucket name (e.g., "vajragrid_telemetry")
 *
 * Install: pnpm add @influxdata/influxdb-client
 */
class InfluxDBTelemetryStore implements ITelemetryStore {
  // In production, replace with actual InfluxDB client:
  // import { InfluxDB, Point } from '@influxdata/influxdb-client';
  private fallback = new InMemoryTelemetryStore();

  async write(batch: GridTelemetry[]): Promise<void> {
    // Production implementation would do:
    // const writeApi = influxDB.getWriteApi(org, bucket);
    // for (const t of batch) {
    //   const point = new Point('grid_telemetry')
    //     .tag('busId', t.busId)
    //     .tag('source', t.source)
    //     .floatField('voltage', t.voltage)
    //     .floatField('frequency', t.frequency)
    //     .floatField('activePower', t.activePower)
    //     .floatField('reactivePower', t.reactivePower)
    //     .floatField('current', t.current)
    //     .floatField('powerFactor', t.powerFactor)
    //     .floatField('phaseAngle', t.phaseAngle)
    //     .floatField('transformerTemp', t.transformerTemp)
    //     .stringField('breakerStatus', t.breakerStatus)
    //     .intField('meterCount', t.meterCount)
    //     .floatField('meterConsumption', t.meterConsumption)
    //     .timestamp(new Date(t.timestamp));
    //   writeApi.writePoint(point);
    // }
    // await writeApi.close();
    console.log(`[InfluxDB] Would write ${batch.length} points — using in-memory fallback`);
    return this.fallback.write(batch);
  }

  async query(busId: string, from: Date, to: Date, limit?: number): Promise<GridTelemetry[]> {
    return this.fallback.query(busId, from, to, limit);
  }

  async queryLatest(busId?: string, limit?: number): Promise<GridTelemetry[]> {
    return this.fallback.queryLatest(busId, limit);
  }

  getStats() { return this.fallback.getStats(); }
}

/**
 * Placeholder for TimescaleDB integration.
 * To enable: set TELEMETRY_STORE=timescale in your environment.
 *
 * Required env vars:
 *   TIMESCALE_URL — PostgreSQL connection string
 *
 * Install: pnpm add pg
 *
 * Schema:
 *   CREATE TABLE grid_telemetry (
 *     time        TIMESTAMPTZ NOT NULL,
 *     bus_id      TEXT NOT NULL,
 *     voltage     DOUBLE PRECISION,
 *     frequency   DOUBLE PRECISION,
 *     active_power DOUBLE PRECISION,
 *     reactive_power DOUBLE PRECISION,
 *     current     DOUBLE PRECISION,
 *     power_factor DOUBLE PRECISION,
 *     phase_angle DOUBLE PRECISION,
 *     breaker_status TEXT,
 *     source      TEXT
 *   );
 *   SELECT create_hypertable('grid_telemetry', 'time');
 */
class TimescaleDBTelemetryStore implements ITelemetryStore {
  private fallback = new InMemoryTelemetryStore();

  async write(batch: GridTelemetry[]): Promise<void> {
    console.log(`[TimescaleDB] Would write ${batch.length} rows — using in-memory fallback`);
    return this.fallback.write(batch);
  }

  async query(busId: string, from: Date, to: Date, limit?: number): Promise<GridTelemetry[]> {
    return this.fallback.query(busId, from, to, limit);
  }

  async queryLatest(busId?: string, limit?: number): Promise<GridTelemetry[]> {
    return this.fallback.queryLatest(busId, limit);
  }

  getStats() { return this.fallback.getStats(); }
}

// ─── Factory ─────────────────────────────────────────────────────────

const storeG = globalThis as unknown as { __vajraTelemetryStore?: ITelemetryStore };

export function getTelemetryStore(): ITelemetryStore {
  if (!storeG.__vajraTelemetryStore) {
    const backend = process.env.TELEMETRY_STORE || 'memory';
    switch (backend) {
      case 'influxdb':
        storeG.__vajraTelemetryStore = new InfluxDBTelemetryStore();
        break;
      case 'timescale':
        storeG.__vajraTelemetryStore = new TimescaleDBTelemetryStore();
        break;
      default:
        storeG.__vajraTelemetryStore = new InMemoryTelemetryStore();
    }
    console.log(`[TelemetryStore] Using backend: ${backend}`);
  }
  return storeG.__vajraTelemetryStore;
}
