import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { ensureDetectionPipeline, getLatestTelemetry, getAlertHistory } from '@/lib/detection/pipeline';
import { NextResponse } from 'next/server';

// GET: poll for current state
export async function GET() {
  ensureDetectionPipeline();
  const engine = getSimulationEngine();

  return NextResponse.json({
    telemetry: getLatestTelemetry(),
    systemState: engine.getState(),
    alerts: getAlertHistory().slice(0, 50),
    simulationState: engine.getState(),
  });
}
