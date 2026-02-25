import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { ensureDetectionPipeline, getLatestTelemetry, getAlertHistory, getMLStatus, getShieldStatus } from '@/lib/detection/pipeline';
import { NextResponse } from 'next/server';
import type { SystemState, GridTelemetry } from '@/lib/types';

function deriveSystemState(telemetry: GridTelemetry[]): SystemState | null {
  if (!telemetry || telemetry.length === 0) return null;
  const activeBuses = telemetry.filter(t => t.breakerStatus !== 'TRIP' && t.voltage > 10).length;
  const totalGen = telemetry.reduce((s, t) => s + Math.max(0, t.activePower), 0);
  const totalLoad = telemetry.reduce((s, t) => s + Math.abs(Math.min(0, t.activePower)), 0) || totalGen * 0.95;
  const avgFreq = telemetry.reduce((s, t) => s + t.frequency, 0) / telemetry.length;
  const balance = totalLoad > 0 ? totalGen / totalLoad : 1;
  const losses = Math.max(0, totalGen - totalLoad);

  let status: SystemState['systemStatus'] = 'NOMINAL';
  if (activeBuses === 0) status = 'BLACKOUT';
  else if (avgFreq < 49.5 || avgFreq > 50.5 || activeBuses < 3) status = 'EMERGENCY';
  else if (avgFreq < 49.9 || avgFreq > 50.1 || Math.abs(1 - balance) > 0.1) status = 'ALERT';

  return {
    timestamp: new Date().toISOString(),
    totalGeneration: totalGen,
    totalLoad,
    totalLosses: losses,
    systemFrequency: avgFreq,
    generationLoadBalance: balance,
    activeBuses,
    activeLines: telemetry.length,
    systemStatus: status,
  };
}

// GET: poll for current state
export async function GET() {
  ensureDetectionPipeline();
  const engine = getSimulationEngine();
  const telemetry = getLatestTelemetry();
  const ml = getMLStatus();
  const shield = getShieldStatus();

  return NextResponse.json({
    telemetry,
    systemState: deriveSystemState(telemetry),
    alerts: getAlertHistory().slice(0, 50),
    simulationState: engine.getState(),
    ml: { ready: ml.ready, anomalyCount: ml.anomalies.filter(a => a.isAnomaly).length },
    shield,
  });
}
