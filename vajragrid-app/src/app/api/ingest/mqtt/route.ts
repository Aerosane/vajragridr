/**
 * POST /api/ingest/mqtt — Start/stop the embedded MQTT bridge
 * GET  /api/ingest/mqtt — Get MQTT bridge status
 *
 * POST body: { "action": "start" | "stop" }
 */

import { NextResponse } from 'next/server';
import { startMQTTBridge, stopMQTTBridge, getMQTTStatus } from '@/lib/ingestion/MQTTBridge';

export async function GET() {
  return NextResponse.json(getMQTTStatus());
}

export async function POST(req: Request) {
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;

  if (action === 'start') {
    try {
      const result = await startMQTTBridge();
      return NextResponse.json({ success: true, ...result, status: getMQTTStatus() });
    } catch (err) {
      return NextResponse.json({ error: `Failed to start MQTT bridge: ${err}` }, { status: 500 });
    }
  }

  if (action === 'stop') {
    await stopMQTTBridge();
    return NextResponse.json({ success: true, status: getMQTTStatus() });
  }

  return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 422 });
}
