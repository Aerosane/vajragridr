import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { NextResponse } from 'next/server';

export async function POST() {
  const engine = getSimulationEngine();
  engine.stop();
  return NextResponse.json({ success: true, state: engine.getState() });
}
