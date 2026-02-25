import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { NextResponse } from 'next/server';
import type { AttackConfig } from '@/lib/types';

export async function POST(req: Request) {
  const engine = getSimulationEngine();
  const config: AttackConfig = await req.json();
  engine.injectAttack(config);
  return NextResponse.json({ success: true, state: engine.getState() });
}
