'use client';

import React, { useState } from 'react';
import { AttackConfig, SimulationState, AttackType } from '@/lib/types';
import type { LiveAttack } from '@/hooks/useSSEGridData';

interface AttackControlPanelProps {
  onAttack: (config: AttackConfig) => void;
  onRemoveAttack?: (type: AttackType, targetBus?: string) => void;
  onClearAttacks?: () => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  simulationState: SimulationState | null;
  liveAttacks?: LiveAttack[];
  isLiveMode?: boolean;
}

const BUS_OPTIONS = ['BUS-001', 'BUS-002', 'BUS-003', 'BUS-004', 'BUS-005'];

const ATTACK_DEFS: {
  label: string;
  type: AttackType;
  defaultTarget: string;
  icon: string;
  color: string;
  activeColor: string;
  description: string;
  targetable: boolean;
}[] = [
  {
    label: 'FDI Attack',
    type: 'FDI',
    defaultTarget: 'BUS-003',
    icon: '💉',
    color: 'hover:bg-red-600/20 hover:border-red-500 hover:text-red-400',
    activeColor: 'bg-red-600/30 border-red-500 text-red-400 ring-1 ring-red-500/50',
    description: 'False Data Injection — spoofs voltage & phase angle readings.',
    targetable: true,
  },
  {
    label: 'Command Spoof',
    type: 'COMMAND_SPOOF',
    defaultTarget: 'BUS-003',
    icon: '⚡',
    color: 'hover:bg-orange-600/20 hover:border-orange-500 hover:text-orange-400',
    activeColor: 'bg-orange-600/30 border-orange-500 text-orange-400 ring-1 ring-orange-500/50',
    description: 'Unauthorized breaker TRIP command (BlackEnergy pattern).',
    targetable: true,
  },
  {
    label: 'MaDIoT',
    type: 'MADIOT',
    defaultTarget: 'SYSTEM',
    icon: '🌊',
    color: 'hover:bg-purple-600/20 hover:border-purple-500 hover:text-purple-400',
    activeColor: 'bg-purple-600/30 border-purple-500 text-purple-400 ring-1 ring-purple-500/50',
    description: 'Coordinated IoT botnet load manipulation (system-wide).',
    targetable: false,
  },
  {
    label: 'Sensor Tamper',
    type: 'SENSOR_TAMPER',
    defaultTarget: 'BUS-003',
    icon: '🔧',
    color: 'hover:bg-amber-600/20 hover:border-amber-500 hover:text-amber-400',
    activeColor: 'bg-amber-600/30 border-amber-500 text-amber-400 ring-1 ring-amber-500/50',
    description: 'Slow drift injection — stealthy calibration attack.',
    targetable: true,
  },
  {
    label: 'Meter Attack',
    type: 'METER_ATTACK',
    defaultTarget: 'BUS-003',
    icon: '📊',
    color: 'hover:bg-yellow-600/20 hover:border-yellow-500 hover:text-yellow-400',
    activeColor: 'bg-yellow-600/30 border-yellow-500 text-yellow-400 ring-1 ring-yellow-500/50',
    description: 'Smart meter aggregate compromise — revenue fraud.',
    targetable: true,
  },
];

export default function AttackControlPanel({
  onAttack,
  onRemoveAttack,
  onClearAttacks,
  onStart,
  onStop,
  onReset,
  simulationState,
  liveAttacks = [],
  isLiveMode = false,
}: AttackControlPanelProps) {
  const isRunning = isLiveMode || (simulationState?.running ?? false);
  const [selectedBuses, setSelectedBuses] = useState<Set<string>>(new Set(['BUS-003']));
  const [intensity, setIntensity] = useState(0.8);

  const toggleBus = (bus: string) => {
    setSelectedBuses(prev => {
      const next = new Set(prev);
      if (next.has(bus)) { next.delete(bus); } else { next.add(bus); }
      // Ensure at least one bus is selected
      if (next.size === 0) next.add(bus);
      return next;
    });
  };

  const isAttackActive = (type: AttackType) =>
    isLiveMode
      ? liveAttacks.some(a => a.type === type)
      : (simulationState?.activeAttacks ?? []).some((a: AttackConfig) => a.type === type);

  const handleAttack = (attack: typeof ATTACK_DEFS[number]) => {
    if (isAttackActive(attack.type) && onRemoveAttack) {
      // Remove all instances of this attack type
      for (const bus of selectedBuses) {
        onRemoveAttack(attack.type, attack.targetable ? bus : undefined);
      }
    } else {
      // Inject on ALL selected buses
      if (attack.targetable) {
        for (const bus of selectedBuses) {
          onAttack({ type: attack.type, targetBus: bus, intensity });
        }
      } else {
        onAttack({ type: attack.type, intensity });
      }
    }
  };

  const activeCount = isLiveMode
    ? liveAttacks.length
    : (simulationState?.activeAttacks?.length ?? 0);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl w-full">
      {/* Header */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-700 bg-slate-800/50 flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Operator Console
        </h2>
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
          isLiveMode
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
            : isRunning
              ? 'bg-green-500/20 text-green-400 border-green-500/50'
              : 'bg-slate-500/20 text-slate-400 border-slate-500/50'
        }`}>
          {isLiveMode ? '🔴 LIVE MQTT' : isRunning ? 'SIMULATION ACTIVE' : 'SIMULATION PAUSED'}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Mode-dependent controls */}
        {!isLiveMode && (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={onStart}
              disabled={isRunning}
              className={`px-3 py-2 rounded text-[10px] font-bold border transition-all ${isRunning ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed' : 'bg-green-600/20 text-green-400 border-green-500/50 hover:bg-green-600/30'}`}
            >
              START
            </button>
            <button
              onClick={onStop}
              disabled={!isRunning}
              className={`px-3 py-2 rounded text-[10px] font-bold border transition-all ${!isRunning ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed' : 'bg-red-600/20 text-red-400 border-red-500/50 hover:bg-red-600/30'}`}
            >
              STOP
            </button>
            <button
              onClick={onReset}
              className="px-3 py-2 bg-slate-800 text-slate-300 border border-slate-600 rounded text-[10px] font-bold hover:bg-slate-700 transition-all"
            >
              RESET
            </button>
          </div>
        )}

        {/* Target Buses (multi-select) + Intensity */}
        <div className="space-y-3">
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Target Buses</label>
            <div className="flex gap-1.5 flex-wrap">
              {BUS_OPTIONS.map(bus => (
                <button
                  key={bus}
                  onClick={() => toggleBus(bus)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition-all ${
                    selectedBuses.has(bus)
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500/60'
                      : 'bg-slate-950 text-slate-500 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {bus.replace('BUS-', 'B')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Intensity: {(intensity * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={intensity}
              onChange={e => setIntensity(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Attack Vectors */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attack Vectors</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <div className="flex flex-col gap-3">
            {ATTACK_DEFS.map((attack) => {
              const active = isAttackActive(attack.type);
              return (
                <button
                  key={attack.type}
                  onClick={() => handleAttack(attack)}
                  disabled={!isRunning}
                  className={`flex flex-col items-start p-3 border rounded-lg text-left transition-all group ${
                    !isRunning
                      ? 'bg-slate-950/50 border-slate-800 opacity-50 cursor-not-allowed'
                      : active
                        ? `${attack.activeColor} animate-pulse cursor-pointer`
                        : `bg-slate-950/50 border-slate-800 cursor-pointer ${attack.color}`
                  }`}
                >
                  <div className="flex justify-between w-full mb-1">
                    <span className="text-[11px] font-black tracking-wider group-hover:scale-105 transition-transform flex items-center gap-1.5">
                      <span>{attack.icon}</span>
                      {attack.label}
                      {active && (
                        <span className="ml-1 text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-300 uppercase">
                          Active — Click to Stop
                        </span>
                      )}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      {attack.targetable ? [...selectedBuses].map(b => b.replace('BUS-', 'B')).join(', ') : 'SYSTEM'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    {attack.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clear all attacks button */}
        {activeCount > 0 && onClearAttacks && (
          <button
            onClick={onClearAttacks}
            className="w-full px-3 py-2 bg-red-900/40 text-red-400 border border-red-700/50 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-red-900/60 transition-all"
          >
            ✕ Clear All Attacks ({activeCount} active)
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 sm:px-6 py-2 sm:py-3 bg-slate-950/50 border-t border-slate-800">
        <div className="flex justify-between items-center text-[9px] font-mono text-slate-600">
          {isLiveMode ? (
            <>
              <span>MODE: LIVE MQTT</span>
              <span>TARGET: {[...selectedBuses].map(b => b.replace('BUS-', 'B')).join(', ')}</span>
              <span className={activeCount > 0 ? 'text-red-400' : ''}>
                ATTACKS: {activeCount}
              </span>
            </>
          ) : (
            <>
              <span>TICK: {simulationState?.tick || 0}</span>
              <span>SPEED: {simulationState?.speed || 1.0}x</span>
              <span className={activeCount > 0 ? 'text-red-400' : ''}>
                ATTACKS: {activeCount}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
