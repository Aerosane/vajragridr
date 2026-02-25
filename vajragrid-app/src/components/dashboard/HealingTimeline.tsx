'use client';

import React from 'react';
import type { HealingEventDTO } from '@/lib/healing/SelfHealingEngine';

const PHASE_CONFIG: Record<string, { color: string; bg: string; glow: string; label: string; icon: string }> = {
  DETECTING:  { color: 'text-yellow-400', bg: 'bg-yellow-500', glow: 'shadow-[0_0_12px_rgba(234,179,8,0.7)]', label: 'Detecting', icon: '🔍' },
  ISOLATING:  { color: 'text-red-400',    bg: 'bg-red-500',    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.7)]', label: 'Isolating', icon: '🛑' },
  REROUTING:  { color: 'text-cyan-400',   bg: 'bg-cyan-500',   glow: 'shadow-[0_0_12px_rgba(6,182,212,0.7)]', label: 'Rerouting', icon: '🔀' },
  MONITORING: { color: 'text-amber-400',  bg: 'bg-amber-500',  glow: 'shadow-[0_0_12px_rgba(245,158,11,0.7)]', label: 'Monitoring', icon: '👁️' },
  RESTORING:  { color: 'text-blue-400',   bg: 'bg-blue-500',   glow: 'shadow-[0_0_12px_rgba(59,130,246,0.7)]', label: 'Restoring', icon: '🔧' },
  RESTORED:   { color: 'text-emerald-400', bg: 'bg-emerald-500', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.7)]', label: 'Restored', icon: '✅' },
};

const PHASES_ORDER = ['DETECTING', 'ISOLATING', 'REROUTING', 'MONITORING', 'RESTORING', 'RESTORED'] as const;

function PhaseProgress({ currentPhase }: { currentPhase: string }) {
  const currentIdx = PHASES_ORDER.indexOf(currentPhase as typeof PHASES_ORDER[number]);

  return (
    <div className="flex items-center gap-0.5 mt-2">
      {PHASES_ORDER.map((phase, i) => {
        const cfg = PHASE_CONFIG[phase];
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        const isFuture = i > currentIdx;

        return (
          <React.Fragment key={phase}>
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                isActive ? `${cfg.bg} ${cfg.glow} animate-pulse scale-125` :
                isDone ? 'bg-emerald-500' :
                isFuture ? 'bg-slate-700' : ''
              }`}
              title={cfg.label}
            />
            {i < PHASES_ORDER.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-[8px] transition-all duration-500 ${
                isDone ? 'bg-emerald-500' :
                isActive ? `${cfg.bg} animate-pulse` :
                'bg-slate-700'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ActiveEvent({ event }: { event: HealingEventDTO }) {
  const cfg = PHASE_CONFIG[event.phase] || PHASE_CONFIG.DETECTING;
  const elapsed = ((event.totalDurationMs ?? 0) / 1000).toFixed(0);
  const latestAction = event.actions[event.actions.length - 1];

  return (
    <div className={`border rounded-lg p-3 bg-slate-900/80 transition-all duration-300 ${
      event.phase === 'ISOLATING' ? 'border-red-500/60' :
      event.phase === 'REROUTING' ? 'border-cyan-500/60' :
      event.phase === 'MONITORING' ? 'border-amber-500/60' :
      'border-slate-700/50'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.icon}</span>
          <div>
            <div className="text-xs font-bold text-slate-200">{event.affectedBus}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
              {cfg.label}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-slate-400">{elapsed}s</div>
        </div>
      </div>

      <PhaseProgress currentPhase={event.phase} />

      {latestAction && (
        <div className="mt-2 text-[10px] text-slate-400 leading-relaxed border-t border-slate-800 pt-1.5">
          <span className={`font-bold ${cfg.color}`}>{latestAction.action}:</span>{' '}
          {latestAction.detail}
        </div>
      )}

      {event.isolatedLines.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {event.isolatedLines.map(l => (
            <span key={l} className="text-[9px] px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/50 font-mono">
              {l} TRIP
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedEvent({ event }: { event: HealingEventDTO }) {
  const duration = ((event.totalDurationMs ?? 0) / 1000).toFixed(0);

  return (
    <div className="border border-emerald-800/30 rounded-lg p-2.5 bg-emerald-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">✅</span>
          <span className="text-xs font-bold text-emerald-400">{event.affectedBus}</span>
        </div>
        <div className="text-[10px] font-mono text-emerald-500">{duration}s heal</div>
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        {event.actions.length} actions • {event.isolatedLines.length} breakers cycled
      </div>
    </div>
  );
}

export default function HealingTimeline({
  activeEvents,
  completedEvents,
}: {
  activeEvents: HealingEventDTO[];
  completedEvents: HealingEventDTO[];
}) {
  const hasActivity = activeEvents.length > 0 || completedEvents.length > 0;

  return (
    <div data-testid="healing-timeline" className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
          activeEvents.length > 0
            ? 'bg-cyan-950 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse'
            : 'bg-slate-800 border border-slate-700'
        }`}>
          ⚡
        </div>
        <div>
          <div className="text-sm font-bold text-slate-100">VajraShield</div>
          <div className={`text-[10px] font-bold uppercase tracking-wider ${
            activeEvents.length > 0 ? 'text-cyan-400' : 'text-emerald-500'
          }`}>
            {activeEvents.length > 0 ? `RESPONDING • ${activeEvents.length} EVENT${activeEvents.length > 1 ? 'S' : ''}` : 'STANDBY'}
          </div>
        </div>
      </div>

      {!hasActivity && (
        <div className="text-center py-4 text-xs text-slate-600">
          <div className="text-lg mb-1">🛡️</div>
          Shield active. No incidents to report.
        </div>
      )}

      {/* Active events */}
      {activeEvents.length > 0 && (
        <div className="space-y-2 mb-3">
          {activeEvents.map(e => (
            <ActiveEvent key={e.id} event={e} />
          ))}
        </div>
      )}

      {/* Completed events */}
      {completedEvents.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Healed ({completedEvents.length})
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
            {completedEvents.slice(0, 5).map(e => (
              <CompletedEvent key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
