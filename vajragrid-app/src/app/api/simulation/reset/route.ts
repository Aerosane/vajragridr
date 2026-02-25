import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { resetPipeline } from '@/lib/detection/pipeline';
import { NextResponse } from 'next/server';

export async function POST() {
  const engine = getSimulationEngine();
  engine.reset();
  resetPipeline();
  return NextResponse.json({ success: true, state: engine.getState() });
}
