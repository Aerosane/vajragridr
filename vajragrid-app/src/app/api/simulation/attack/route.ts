import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { NextResponse } from 'next/server';
import type { AttackConfig, AttackType } from '@/lib/types';

const VALID_ATTACK_TYPES: AttackType[] = ['FDI', 'COMMAND_SPOOF', 'MADIOT', 'SENSOR_TAMPER', 'METER_ATTACK'];

export async function POST(req: Request) {
  let config: AttackConfig;
  try {
    config = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!config.type || !VALID_ATTACK_TYPES.includes(config.type)) {
    return NextResponse.json({ error: `Invalid attack type. Must be one of: ${VALID_ATTACK_TYPES.join(', ')}` }, { status: 422 });
  }

  if (config.intensity !== undefined && (typeof config.intensity !== 'number' || config.intensity < 0 || config.intensity > 1)) {
    return NextResponse.json({ error: 'Intensity must be a number between 0 and 1' }, { status: 422 });
  }

  const engine = getSimulationEngine();
  engine.injectAttack(config);
  return NextResponse.json({ success: true, state: engine.getState() });
}
