'use client';

import React from 'react';
import type { KillChainData } from '@/hooks/useSSEGridData';
import type { ShieldData } from '@/hooks/useSSEGridData';

const LAYERS = [
  { id: 'RULES', label: 'Rules Engine', icon: '📏', color: 'blue' },
  { id: 'PHYSICS', label: 'Physics Validator', icon: '⚛️', color: 'cyan' },
  { id: 'STATISTICAL', label: 'Statistical', icon: '📊', color: 'purple' },
  { id: 'ML', label: 'ML / ONNX', icon: '🧠', color: 'pink' },
];

const SHIELD_PHASES = [
  { id: 'DETECTING', label: 'Detecting', icon: '🔍', color: 'yellow' },
  { id: 'ISOLATING', label: 'Isolating', icon: '🛑', color: 'red' },
  { id: 'REROUTING', label: 'Rerouting', icon: '🔀', color: 'cyan' },
  { id: 'MONITORING', label: 'Monitoring', icon: '👁️', color: 'amber' },
  { id: 'RESTORING', label: 'Restoring', icon: '🔧', color: 'blue' },
  { id: 'RESTORED', label: 'Restored', icon: '✅', color: 'emerald' },
];

const SHIELD_PHASE_COLORS: Record<string, { active: string; past: string }> = {
  DETECTING: { active: 'bg-yellow-500 animate-pulse', past: 'bg-yellow-500/60' },
  ISOLATING: { active: 'bg-red-500 animate-pulse', past: 'bg-red-500/60' },
  REROUTING: { active: 'bg-cyan-500 animate-pulse', past: 'bg-cyan-500/60' },
  MONITORING: { active: 'bg-amber-500 animate-pulse', past: 'bg-amber-500/60' },
  RESTORING: { active: 'bg-blue-500 animate-pulse', past: 'bg-blue-500/60' },
  RESTORED: { active: 'bg-emerald-500 animate-pulse', past: 'bg-emerald-500/60' },
};

interface Props {
  killChain: KillChainData | null;
  shield: ShieldData | null;
  attackCount: number;
}

export default function KillChainTimeline({ killChain, shield, attackCount }: Props) {
  const isHealed = killChain?.healed === true;

  // State 1: Normal — no attacks, no recent heal
  if (attackCount === 0 && !killChain) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-black uppercase tracking-[0.15em] text-slate-300">⚔️ Attack Kill Chain</span>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">NORMAL</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          All systems nominal — inject an attack from the Operator Console to see the kill chain
        </div>
      </div>
    );
  }

  // State 2: Healed — attack was neutralized, show success summary
  if (isHealed) {
    const layers = killChain?.layers || [];
    const triggeredLayers = layers.filter(l => l.triggered);

    return (
      <div className="bg-zinc-900/40 border border-emerald-900/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase tracking-[0.15em] text-slate-300">⚔️ Attack Kill Chain</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✅ THREAT NEUTRALIZED
            </span>
          </div>
        </div>

        {/* Success timeline — all nodes green */}
        <div className="flex items-start gap-1 overflow-x-auto pb-2">
          <div className="flex flex-col items-center min-w-[70px]">
            <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg bg-zinc-800/40 border-slate-600">
              💀
            </div>
            <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase line-through">Attack</span>
            <span className="text-[10px] font-mono text-zinc-400">Neutralized</span>
          </div>

          <div className="flex items-center h-10 text-emerald-600 px-0.5">→</div>

          {LAYERS.map((layer, i) => {
            const data = layers.find(l => l.layer === layer.id);
            const wasTriggered = data?.triggered;
            return (
              <React.Fragment key={layer.id}>
                <div className="flex flex-col items-center min-w-[70px]">
                  <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all duration-500 ${
                    wasTriggered ? 'bg-emerald-500/10 border-emerald-500/60' : 'bg-zinc-800/40 border-slate-700'
                  }`}>
                    {wasTriggered ? '✅' : '—'}
                  </div>
                  <span className={`text-[10px] font-bold mt-1 uppercase ${wasTriggered ? 'text-emerald-400' : 'text-zinc-400'}`}>{layer.label}</span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {wasTriggered ? 'Caught' : 'Clear'}
                  </span>
                </div>
                {i < LAYERS.length - 1 && (
                  <div className="flex items-center h-10 text-emerald-600 px-0.5">→</div>
                )}
              </React.Fragment>
            );
          })}

          <div className="flex items-center h-10 text-emerald-600 px-0.5">→</div>

          <div className="flex flex-col items-center min-w-[70px]">
            <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg bg-emerald-500/20 border-emerald-500 shadow-lg shadow-emerald-500/20">
              🛡️
            </div>
            <span className="text-[10px] font-bold mt-1 uppercase text-emerald-400">VajraShield</span>
            <span className="text-[10px] font-mono text-emerald-500">RESTORED</span>
          </div>
        </div>

        {/* Progress bar — all green */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="flex gap-1">
            {SHIELD_PHASES.map((phase) => (
              <div key={phase.id} className="flex-1 rounded-sm h-1.5 bg-emerald-500/70" title={phase.label} />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-emerald-600">DETECT</span>
            <span className="text-[10px] text-emerald-600">RESTORED ✓</span>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-3 pt-3 border-t border-zinc-800 bg-emerald-950/20 rounded-lg p-2">
          <p className="text-xs text-emerald-400 font-bold">
            🛡️ VajraShield successfully detected, isolated, and restored the grid.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {triggeredLayers.length} detection layer{triggeredLayers.length !== 1 ? 's' : ''} flagged the threat
            ({triggeredLayers.map(l => l.layer).join(' → ')}).
            All breakers restored, power flow normalized.
          </p>
        </div>
      </div>
    );
  }

  // State 3: Active attack in progress
  const shieldPhase = shield?.activeEvents?.[0]?.phase || (shield?.completedEvents?.length ? 'RESTORED' : null);
  const layers = killChain?.layers || [];

  return (
    <div className="bg-zinc-900/40 border border-red-900/50 rounded-xl p-4 animate-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.15em] text-slate-300">⚔️ Attack Kill Chain</span>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
            {attackCount} ACTIVE
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-400">
          {killChain?.alertCount || 0} alerts generated
        </span>
      </div>

      {/* Detection Layers */}
      <div className="flex items-start gap-1 overflow-x-auto pb-2">
        {/* Attack node */}
        <div className="flex flex-col items-center min-w-[70px]">
          <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg bg-red-500/20 border-red-500 shadow-lg shadow-red-500/20">
            💀
          </div>
          <span className="text-[10px] font-bold text-red-400 mt-1 uppercase">Attack</span>
          <span className="text-[10px] font-mono text-zinc-400">{attackCount} vector{attackCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Arrow */}
        <div className="flex items-center h-10 text-zinc-400 px-0.5">→</div>

        {/* Layer nodes */}
        {LAYERS.map((layer, i) => {
          const data = layers.find(l => l.layer === layer.id);
          const triggered = data ? data.triggered : null;
          const bgClass = triggered === null
            ? 'bg-slate-800 border-slate-700'
            : triggered
              ? 'bg-red-500/10 border-red-500/60 shadow-lg shadow-red-500/10'
              : 'bg-emerald-500/10 border-emerald-500/40';
          const textClass = triggered === null
            ? 'text-zinc-400'
            : triggered ? 'text-red-400' : 'text-emerald-400';

          return (
            <React.Fragment key={layer.id}>
              <div className="flex flex-col items-center min-w-[70px]">
                <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all duration-500 ${bgClass}`}>
                  {triggered === null ? '⏳' : triggered ? '🚨' : '✅'}
                </div>
                <span className={`text-[10px] font-bold mt-1 uppercase ${textClass}`}>{layer.label}</span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {data ? (data.triggered ? `${data.count} hit${data.count !== 1 ? 's' : ''}` : 'Clear') : '—'}
                </span>
              </div>
              {i < LAYERS.length - 1 && (
                <div className="flex items-center h-10 text-zinc-400 px-0.5">→</div>
              )}
            </React.Fragment>
          );
        })}

        {/* Arrow to Shield */}
        <div className="flex items-center h-10 text-zinc-400 px-0.5">→</div>

        {/* VajraShield phase */}
        <div className="flex flex-col items-center min-w-[70px]">
          <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all duration-500 ${
            shieldPhase
              ? 'bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20 animate-pulse'
              : 'bg-slate-800 border-slate-700'
          }`}>
            🛡️
          </div>
          <span className={`text-[10px] font-bold mt-1 uppercase ${shieldPhase ? 'text-blue-400' : 'text-zinc-400'}`}>VajraShield</span>
          <span className="text-[10px] font-mono text-zinc-400">{shieldPhase || 'Standby'}</span>
        </div>
      </div>

      {/* Shield phases progress bar */}
      {shieldPhase && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="flex gap-1">
            {SHIELD_PHASES.map((phase) => {
              const phaseIdx = SHIELD_PHASES.findIndex(p => p.id === shieldPhase);
              const thisIdx = SHIELD_PHASES.findIndex(p => p.id === phase.id);
              const isActive = phase.id === shieldPhase;
              const isPast = thisIdx < phaseIdx;
              return (
                <div key={phase.id} className={`flex-1 rounded-sm h-1.5 transition-all duration-700 ${
                  isActive ? (SHIELD_PHASE_COLORS[phase.id]?.active ?? 'bg-slate-500 animate-pulse') :
                  isPast ? (SHIELD_PHASE_COLORS[phase.id]?.past ?? 'bg-slate-500/60') : 'bg-slate-800'
                }`} title={phase.label} />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-zinc-400">DETECT</span>
            <span className="text-[10px] text-zinc-400">RESTORED</span>
          </div>
        </div>
      )}

      {/* Layer details tooltip */}
      {layers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
          {layers.filter(l => l.triggered).map(l => (
            <div key={l.layer} className="flex items-center gap-2 text-xs font-mono">
              <span className="text-red-400 font-bold w-20">{l.layer}</span>
              <span className="text-slate-500">{l.details}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
