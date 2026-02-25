import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { ensureDetectionPipeline, getLatestTelemetry, getAlertHistory, getMLStatus } from '@/lib/detection/pipeline';
import { NextResponse } from 'next/server';

// GET: poll for current state
export async function GET() {
  ensureDetectionPipeline();
  const engine = getSimulationEngine();
  const ml = getMLStatus();

  return NextResponse.json({
    telemetry: getLatestTelemetry(),
    systemState: engine.getState(),
    alerts: getAlertHistory().slice(0, 50),
    simulationState: engine.getState(),
    ml: { ready: ml.ready, anomalyCount: ml.anomalies.filter(a => a.isAnomaly).length },
  });
}
