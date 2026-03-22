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
  description: string;
  targetable: boolean;
  gradient: string;
  activeGradient: string;
  iconPath: string;
}[] = [
  {
    label: 'FDI Attack',
    type: 'FDI',
    defaultTarget: 'BUS-003',
    gradient: 'from-red-500/10 to-transparent hover:from-red-500/20',
    activeGradient: 'from-red-500/25 to-red-500/5',
    iconPath: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    description: 'False Data Injection — spoofs voltage & phase angle readings.',
    targetable: true,
  },
  {
    label: 'Command Spoof',
    type: 'COMMAND_SPOOF',
    defaultTarget: 'BUS-003',
    gradient: 'from-orange-500/10 to-transparent hover:from-orange-500/20',
    activeGradient: 'from-orange-500/25 to-orange-500/5',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
    description: 'Unauthorized breaker TRIP command (BlackEnergy pattern).',
    targetable: true,
  },
  {
    label: 'MaDIoT',
    type: 'MADIOT',
    defaultTarget: 'SYSTEM',
    gradient: 'from-purple-500/10 to-transparent hover:from-purple-500/20',
    activeGradient: 'from-purple-500/25 to-purple-500/5',
    iconPath: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    description: 'Coordinated IoT botnet load manipulation (system-wide).',
    targetable: false,
  },
  {
    label: 'Sensor Tamper',
    type: 'SENSOR_TAMPER',
    defaultTarget: 'BUS-003',
    gradient: 'from-amber-500/10 to-transparent hover:from-amber-500/20',
    activeGradient: 'from-amber-500/25 to-amber-500/5',
    iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    description: 'Slow drift injection — stealthy calibration attack.',
    targetable: true,
  },
  {
    label: 'Meter Attack',
    type: 'METER_ATTACK',
    defaultTarget: 'BUS-003',
    gradient: 'from-yellow-500/10 to-transparent hover:from-yellow-500/20',
    activeGradient: 'from-yellow-500/25 to-yellow-500/5',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
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
      for (const bus of selectedBuses) {
        onRemoveAttack(attack.type, attack.targetable ? bus : undefined);
      }
    } else {
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
    <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl w-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white flex items-center gap-2.5">
          <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Operator Console
        </h2>
        <div className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
          isLiveMode
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : isRunning
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
        }`}>
          {isLiveMode ? '● LIVE MQTT' : isRunning ? 'ACTIVE' : 'STANDBY'}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Simulation controls (non-live) */}
        {!isLiveMode && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'START', onClick: onStart, disabled: isRunning, color: 'emerald' },
              { label: 'STOP', onClick: onStop, disabled: !isRunning, color: 'red' },
              { label: 'RESET', onClick: onReset, disabled: false, color: 'slate' },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                disabled={btn.disabled}
                className={`px-3 py-2.5 rounded-xl text-xs font-black tracking-wider border transition-all duration-300 ${
                  btn.disabled
                    ? 'bg-white/[0.02] text-slate-700 border-white/[0.04] cursor-not-allowed'
                    : btn.color === 'emerald'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40'
                      : btn.color === 'red'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40'
                        : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Target Selection + Intensity */}
        <div className="space-y-4 p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] block mb-2.5">Target Substations</label>
            <div className="flex gap-2 flex-wrap">
              {BUS_OPTIONS.map(bus => (
                <button
                  key={bus}
                  onClick={() => toggleBus(bus)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all duration-300 ${
                    selectedBuses.has(bus)
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'bg-white/[0.02] text-slate-600 border-white/[0.05] hover:border-white/[0.12] hover:text-slate-400'
                  }`}
                >
                  {bus}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">Intensity</label>
              <span className="text-sm font-mono font-black tabular-nums bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                {(intensity * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={intensity}
              onChange={e => setIntensity(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/[0.06] rounded-full appearance-none cursor-pointer accent-cyan-500
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(6,182,212,0.5)]"
            />
          </div>
        </div>

        {/* Attack Vectors */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Attack Vectors</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          </div>

          <div className="flex flex-col gap-2.5">
            {ATTACK_DEFS.map((attack) => {
              const active = isAttackActive(attack.type);
              return (
                <button
                  key={attack.type}
                  onClick={() => handleAttack(attack)}
                  disabled={!isRunning}
                  className={`relative flex items-start gap-3.5 p-4 rounded-xl border text-left transition-all duration-300 group overflow-hidden ${
                    !isRunning
                      ? 'bg-white/[0.01] border-white/[0.03] opacity-40 cursor-not-allowed'
                      : active
                        ? `bg-gradient-to-r ${attack.activeGradient} border-white/[0.12] shadow-lg`
                        : `bg-gradient-to-r ${attack.gradient} border-white/[0.05] hover:border-white/[0.12]`
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ${
                    active ? 'bg-white/[0.1]' : 'bg-white/[0.03] group-hover:bg-white/[0.06]'
                  }`}>
                    <svg className={`w-4 h-4 transition-colors duration-300 ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={attack.iconPath} />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-bold tracking-wide transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {attack.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {active && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white/80 uppercase tracking-wider">
                            Active
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-600">
                          {attack.targetable ? [...selectedBuses].map(b => b.replace('BUS-', 'S')).join(' ') : 'SYS'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{attack.description}</p>
                  </div>

                  {/* Active glow bar */}
                  {active && (
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-400 via-blue-500 to-purple-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clear all */}
        {activeCount > 0 && onClearAttacks && (
          <button
            onClick={onClearAttacks}
            className="w-full px-4 py-3 rounded-xl text-xs font-black uppercase tracking-[0.15em] border transition-all duration-300 bg-red-500/8 text-red-400 border-red-500/15 hover:bg-red-500/15 hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]"
          >
            Neutralize All ({activeCount} active)
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-white/[0.01] border-t border-white/[0.04]">
        <div className="flex justify-between items-center text-[10px] font-mono text-slate-700 tabular-nums">
          {isLiveMode ? (
            <>
              <span>MODE LIVE</span>
              <span>TGT {[...selectedBuses].map(b => b.replace('BUS-', 'S')).join(' ')}</span>
              <span className={activeCount > 0 ? 'text-red-400 font-bold' : ''}>
                ATK {activeCount}
              </span>
            </>
          ) : (
            <>
              <span>TICK {simulationState?.tick || 0}</span>
              <span>SPD {simulationState?.speed || 1.0}×</span>
              <span className={activeCount > 0 ? 'text-red-400 font-bold' : ''}>
                ATK {activeCount}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
