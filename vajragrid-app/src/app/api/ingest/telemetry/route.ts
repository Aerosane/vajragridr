/**
 * POST /api/ingest/telemetry
 *
 * Secure endpoint to receive real IoT / SCADA / MQTT telemetry data.
 * Accepts a JSON array of telemetry readings and feeds them into the
 * VajraGrid detection pipeline.
 *
 * Authentication: API key via X-API-Key header or ?key= query parameter.
 * Set VAJRAGRID_INGEST_API_KEY in your environment (defaults to "vajragrid-dev-key" for development).
 *
 * Request body:
 *   Array of telemetry objects, or a single telemetry object.
 *   Minimum required field: busId (string)
 *   All other fields are optional and will be filled with sensible defaults.
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/ingest/telemetry \
 *     -H "Content-Type: application/json" \
 *     -H "X-API-Key: vajragrid-dev-key" \
 *     -d '[{"busId":"BUS-003","voltage":228.5,"frequency":49.98,"activePower":-72.3}]'
 *
 * Response:
 *   { "success": true, "accepted": 5, "rejected": 0, "alertCount": 1 }
 */

import { NextResponse } from 'next/server';
import { ingestTelemetry } from '@/lib/ingestion';

const API_KEY = process.env.VAJRAGRID_INGEST_API_KEY || 'vajragrid-dev-key';
const MAX_BATCH_SIZE = 100;

function validateApiKey(req: Request): boolean {
  // Check header first, then query parameter
  const headerKey = req.headers.get('x-api-key');
  if (headerKey === API_KEY) return true;

  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key');
  return queryKey === API_KEY;
}

export async function POST(req: Request) {
  // Auth check
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide a valid X-API-Key header or ?key= query parameter.' },
      { status: 401 }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Normalize to array
  const batch: Record<string, unknown>[] = Array.isArray(body) ? body : [body as Record<string, unknown>];

  if (batch.length === 0) {
    return NextResponse.json({ error: 'Empty telemetry batch' }, { status: 400 });
  }

  if (batch.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch too large. Maximum ${MAX_BATCH_SIZE} readings per request.` },
      { status: 413 }
    );
  }

  // Ingest into pipeline
  const result = ingestTelemetry(batch);

  return NextResponse.json({
    success: true,
    accepted: result.accepted,
    rejected: result.rejected,
    alertCount: result.alerts.length,
    alerts: result.alerts.slice(0, 10).map(a => ({
      id: a.id,
      severity: a.severity,
      category: a.threatCategory,
      title: a.title,
    })),
  });
}
