import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { ensureDetectionPipeline } from '@/lib/detection/pipeline';
import { NextResponse } from 'next/server';

export async function POST() {
  ensureDetectionPipeline();
  const engine = getSimulationEngine();
  engine.start();
  return NextResponse.json({ success: true, state: engine.getState() });
}
