import { NextRequest, NextResponse } from 'next/server';
import {
  injectAttackOverlay,
  removeAttackOverlay,
  clearAllAttacks,
  getActiveAttacks,
} from '@/lib/ingestion/IngestionEngine';
import type { AttackType } from '@/lib/types';

const VALID_TYPES: AttackType[] = ['FDI', 'COMMAND_SPOOF', 'MADIOT', 'SENSOR_TAMPER', 'METER_ATTACK'];

/** POST — Inject an attack overlay on live telemetry */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, targetBus, intensity } = body as {
      type?: string;
      targetBus?: string;
      intensity?: number;
    };

    if (!type || !VALID_TYPES.includes(type as AttackType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const attack = injectAttackOverlay(
      type as AttackType,
      targetBus || (type === 'MADIOT' ? 'SYSTEM' : 'BUS-003'),
      intensity ?? 0.8
    );

    return NextResponse.json({
      success: true,
      attack,
      activeAttacks: getActiveAttacks(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** DELETE — Remove a specific attack or clear all */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, targetBus, clearAll } = body as {
      type?: string;
      targetBus?: string;
      clearAll?: boolean;
    };

    if (clearAll) {
      const count = clearAllAttacks();
      return NextResponse.json({ success: true, cleared: count, activeAttacks: [] });
    }

    if (!type || !VALID_TYPES.includes(type as AttackType)) {
      return NextResponse.json(
        { error: `Provide type to remove, or clearAll: true` },
        { status: 400 }
      );
    }

    const removed = removeAttackOverlay(type as AttackType, targetBus);
    return NextResponse.json({
      success: removed,
      activeAttacks: getActiveAttacks(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** GET — List active attack overlays */
export async function GET() {
  return NextResponse.json({ activeAttacks: getActiveAttacks() });
}
