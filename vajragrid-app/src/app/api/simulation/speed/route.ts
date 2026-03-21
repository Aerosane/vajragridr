import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  let body: { speed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const speed = body.speed;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.1 || speed > 10) {
    return NextResponse.json({ error: 'Speed must be a finite number between 0.1 and 10' }, { status: 422 });
  }

  const engine = getSimulationEngine();
  engine.setSpeed(speed);
  return NextResponse.json({ success: true, state: engine.getState() });
}
