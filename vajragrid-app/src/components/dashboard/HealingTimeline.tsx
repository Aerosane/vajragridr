'use client';

import React, { useState } from 'react';
import type { HealingEventDTO } from '@/lib/healing/SelfHealingEngine';

const PHASE_CONFIG: Record<string, { color: string; bg: string; glow: string; label: string; icon: string }> = {
  DETECTING:  { color: 'text-yellow-400', bg: 'bg-yellow-500', glow: 'shadow-[0_0_12px_rgba(234,179,8,0.7)]', label: 'Detecting', icon: '🔍' },
  ISOLATING:  { color: 'text-red-400',    bg: 'bg-red-500',    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.7)]', label: 'Isolating', icon: '🛑' },
  REROUTING:  { color: 'text-cyan-400',   bg: 'bg-cyan-500',   glow: 'shadow-[0_0_12px_rgba(6,182,212,0.7)]', label: 'Rerouting', icon: '🔀' },
  MONITORING: { color: 'text-amber-400',  bg: 'bg-amber-500',  glow: 'shadow-[0_0_12px_rgba(245,158,11,0.7)]', label: 'Monitoring', icon: '👁' },
  RESTORING:  { color: 'text-blue-400',   bg: 'bg-blue-500',   glow: 'shadow-[0_0_12px_rgba(59,130,246,0.7)]', label: 'Restoring', icon: '🔧' },
  RESTORED:   { color: 'text-emerald-400', bg: 'bg-emerald-500', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.7)]', label: 'Restored', icon: 'Done' },
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
                isFuture ? 'bg-zinc-700' : ''
              }`}
              title={cfg.label}
            />
            {i < PHASES_ORDER.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-[8px] transition-all duration-500 ${
                isDone ? 'bg-emerald-500' :
                isActive ? `${cfg.bg} animate-pulse` :
                'bg-zinc-700'
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
    <div className={`border rounded-lg p-3 bg-zinc-900/80 transition-all duration-300 ${
      event.phase === 'ISOLATING' ? 'border-red-500/60' :
      event.phase === 'REROUTING' ? 'border-cyan-500/60' :
      event.phase === 'MONITORING' ? 'border-amber-500/60' :
      'border-zinc-700/50'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">{cfg.icon}</span>
          <div>
            <div className="text-xs font-bold text-zinc-200">{event.affectedBus}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
              {cfg.label}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-zinc-400">{elapsed}s</div>
        </div>
      </div>

      <PhaseProgress currentPhase={event.phase} />

      {latestAction && (
        <div className="mt-2 text-[10px] text-zinc-400 leading-relaxed border-t border-zinc-800 pt-1.5">
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

function CompletedEvent({ event, isExpanded, onToggle }: { event: HealingEventDTO; isExpanded: boolean; onToggle: () => void }) {
  const duration = ((event.totalDurationMs ?? 0) / 1000).toFixed(1);
  const startTime = event.actions[0] ? new Date(event.actions[0].timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--';

  return (
    <div
      onClick={onToggle}
      className={`border rounded-lg transition-all duration-200 cursor-pointer ${
        isExpanded
          ? 'border-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-500/5'
          : 'border-emerald-800/30 bg-emerald-950/20 hover:border-emerald-500/30 hover:bg-emerald-950/25'
      }`}
    >
      {/* Summary row — always visible */}
      <div className="flex items-center justify-between p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm">&#x2705;</span>
          <span className="text-xs font-bold text-emerald-400">{event.affectedBus}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-emerald-500">{duration}s</span>
          <svg className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-emerald-800/30 pt-2 space-y-2">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
              <div className="text-xs font-mono font-bold text-white tabular-nums">{duration}s</div>
              <div className="text-[10px] text-zinc-500 uppercase">Duration</div>
            </div>
            <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
              <div className="text-xs font-mono font-bold text-white tabular-nums">{event.actions.length}</div>
              <div className="text-[10px] text-zinc-500 uppercase">Actions</div>
            </div>
            <div className="bg-zinc-900/60 rounded-lg p-2 text-center">
              <div className="text-xs font-mono font-bold text-white tabular-nums">{event.isolatedLines.length}</div>
              <div className="text-[10px] text-zinc-500 uppercase">Breakers</div>
            </div>
          </div>

          {/* Phase progress */}
          <PhaseProgress currentPhase="RESTORED" />

          {/* Isolated lines */}
          {event.isolatedLines.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Breakers Cycled</div>
              <div className="flex flex-wrap gap-1">
                {event.isolatedLines.map(l => (
                  <span key={l} className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/40 font-mono">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action timeline */}
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Healing Actions</div>
            <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
              {event.actions.map((a, i) => {
                const ts = new Date(a.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 0 });
                return (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className="text-zinc-600 font-mono shrink-0 w-[60px]">{ts}</span>
                    <span className="text-emerald-400 font-bold shrink-0">{a.action}</span>
                    <span className="text-zinc-400">{a.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-zinc-600 font-mono">
            Started at {startTime}
          </div>
        </div>
      )}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasActivity = activeEvents.length > 0 || completedEvents.length > 0;

  return (
    <div data-testid="healing-timeline" className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
          activeEvents.length > 0
            ? 'bg-cyan-950 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse'
            : 'bg-zinc-800 border border-zinc-700'
        }`}>
          &#x26A1;
        </div>
        <div>
          <div className="text-sm font-bold text-zinc-100">VajraShield</div>
          <div className={`text-[10px] font-bold uppercase tracking-wider ${
            activeEvents.length > 0 ? 'text-cyan-400' : 'text-emerald-500'
          }`}>
            {activeEvents.length > 0 ? `RESPONDING - ${activeEvents.length} EVENT${activeEvents.length > 1 ? 'S' : ''}` : 'STANDBY'}
          </div>
        </div>
      </div>

      {!hasActivity && (
        <div className="text-center py-4 text-xs text-zinc-600">
          <div className="text-lg mb-1">&#x1F6E1;</div>
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

      {/* Completed events — clickable */}
      {completedEvents.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
            Healed ({completedEvents.length}) — click for details
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
            {completedEvents.slice(0, 10).map(e => (
              <CompletedEvent
                key={e.id}
                event={e}
                isExpanded={expandedId === e.id}
                onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
