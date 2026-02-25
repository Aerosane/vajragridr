import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { speed } = await req.json();
  const engine = getSimulationEngine();
  engine.setSpeed(speed);
  return NextResponse.json({ success: true, state: engine.getState() });
}
