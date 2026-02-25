'use client';

import React from 'react';
import { AttackConfig, SimulationState, AttackType } from '@/lib/types';

interface AttackControlPanelProps {
  onAttack: (config: AttackConfig) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  simulationState: SimulationState | null;
}

export default function AttackControlPanel({
  onAttack,
  onStart,
  onStop,
  onReset,
  simulationState,
}: AttackControlPanelProps) {
  const isRunning = simulationState?.running || false;

  const attacks: { label: string; type: AttackType; target?: string; color: string; description: string }[] = [
    {
      label: 'FDI Attack',
      type: 'FDI',
      target: 'BUS-003',
      color: 'hover:bg-red-600/20 hover:border-red-500 hover:text-red-400',
      description: 'False Data Injection on BUS-003 voltage telemetry.',
    },
    {
      label: 'Command Spoof',
      type: 'COMMAND_SPOOF',
      target: 'BUS-003',
      color: 'hover:bg-orange-600/20 hover:border-orange-500 hover:text-orange-400',
      description: 'Unauthorized breaker TRIP command injection.',
    },
    {
      label: 'MaDIoT',
      type: 'MADIOT',
      color: 'hover:bg-purple-600/20 hover:border-purple-500 hover:text-purple-400',
      description: 'Manipulation of Demand via IoT (Coordinated load attack).',
    },
    {
      label: 'Sensor Tamper',
      type: 'SENSOR_TAMPER',
      target: 'BUS-003',
      color: 'hover:bg-amber-600/20 hover:border-amber-500 hover:text-amber-400',
      description: 'Gradual drift injection in frequency sensors.',
    },
    {
      label: 'Meter Attack',
      type: 'METER_ATTACK',
      target: 'BUS-003',
      color: 'hover:bg-yellow-600/20 hover:border-yellow-500 hover:text-yellow-400',
      description: 'Compromise smart meter aggregate at BUS-003.',
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl w-full max-w-md">
      <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Operator Console
        </h2>
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isRunning ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-slate-500/20 text-slate-400 border-slate-500/50'}`}>
          {isRunning ? 'SIMULATION ACTIVE' : 'SIMULATION PAUSED'}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Simulation Controls */}
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

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attack Vectors</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <div className="flex flex-col gap-3">
            {attacks.map((attack) => (
              <button
                key={attack.type}
                onClick={() => onAttack({ type: attack.type, targetBus: attack.target, intensity: 0.8 })}
                disabled={!isRunning}
                className={`flex flex-col items-start p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-left transition-all group ${!isRunning ? 'opacity-50 cursor-not-allowed' : `cursor-pointer ${attack.color}`}`}
              >
                <div className="flex justify-between w-full mb-1">
                  <span className="text-[11px] font-black tracking-wider group-hover:scale-105 transition-transform">{attack.label}</span>
                  {attack.target && <span className="text-[9px] font-mono text-slate-500">{attack.target}</span>}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {attack.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800">
        <div className="flex justify-between items-center text-[9px] font-mono text-slate-600">
          <span>TICK: {simulationState?.tick || 0}</span>
          <span>SPEED: {simulationState?.speed || 1.0}x</span>
          <span>ATTACKS: {simulationState?.activeAttacks.length || 0}</span>
        </div>
      </div>
    </div>
  );
}
