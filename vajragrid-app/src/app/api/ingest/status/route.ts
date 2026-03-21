/**
 * GET /api/ingest/status
 *
 * Returns the current status of the ingestion pipeline:
 * - Whether live data ingestion is active
 * - Count of ingested records
 * - Last ingest time
 * - Current telemetry snapshot
 * - Time-series store stats
 * - Recent errors
 */

import { NextResponse } from 'next/server';
import { getIngestionStatus } from '@/lib/ingestion';
import { getTelemetryStore } from '@/lib/ingestion';

export async function GET() {
  try {
    const status = getIngestionStatus();
    const store = getTelemetryStore();
    const storeStats = store.getStats();

    return NextResponse.json({
      ingestion: {
        active: status.active,
        dataSource: status.dataSource,
        ingestedCount: status.ingestedCount,
        lastIngestTime: status.lastIngestTime,
        tickCount: status.tickCount,
        errors: status.errors,
      },
      store: storeStats,
      detection: {
        mlReady: status.mlReady,
        mlAnomalyCount: status.mlAnomalies.filter(a => a.isAnomaly).length,
        alertCount: status.alertHistory.length,
        recentAlerts: status.alertHistory.slice(0, 5).map(a => ({
          id: a.id,
          severity: a.severity,
          title: a.title,
          timestamp: a.timestamp,
        })),
      },
      shield: status.shield,
    });
  } catch (err) {
    console.error('[VajraGrid] Ingestion status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
