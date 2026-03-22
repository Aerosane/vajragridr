'use client';

import React, { useState } from 'react';
import type { ThreatAlert } from '@/lib/types';

const MITRE_TACTIC_MAP: Record<string, { id: string; name: string }> = {
  'T0830': { id: 'T0830', name: 'Man-in-the-Middle' },
  'T0859': { id: 'T0859', name: 'Valid Accounts' },
  'T0831': { id: 'T0831', name: 'Data of Physical Processes' },
  'T0839': { id: 'T0839', name: 'Modify Parameter' },
  'T0816': { id: 'T0816', name: 'Device/Data Deletion' },
  'TA0040': { id: 'TA0040', name: 'Impact' },
};

const SEV_BORDER: Record<string, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-orange-500',
  MEDIUM: 'border-l-amber-500',
  LOW: 'border-l-blue-500',
};

const SEV_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const LAYER_BADGES: Record<string, { color: string; label: string }> = {
  RULES: { color: 'bg-blue-500/20 text-blue-300 border border-blue-500/20', label: 'Rules' },
  PHYSICS: { color: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20', label: 'Physics' },
  STATISTICAL: { color: 'bg-purple-500/20 text-purple-300 border border-purple-500/20', label: 'Stats' },
  ML: { color: 'bg-pink-500/20 text-pink-300 border border-pink-500/20', label: 'ML/ONNX' },
};

interface Props {
  alert: ThreatAlert;
}

export default function ExplainableAlertCard({ alert }: Props) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = SEV_BORDER[alert.severity] || SEV_BORDER.MEDIUM;
  const badgeColor = SEV_BADGE[alert.severity] || SEV_BADGE.MEDIUM;
  const mitreTacticId = alert.mitreTactic?.match(/T\d{4}|TA\d{4}/)?.[0] || '';
  const mitreTactic = MITRE_TACTIC_MAP[mitreTacticId];

  return (
    <div className={`border-l-[3px] ${borderColor} rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all duration-300 ${expanded ? 'bg-white/[0.04] border-white/[0.08]' : ''}`}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-4 flex items-start gap-3">
        <div className={`px-2 py-0.5 rounded-lg border text-[10px] font-black shrink-0 ${badgeColor}`}>
          {alert.severity}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-200 truncate">{alert.title}</div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {alert.detectionLayers.map(layer => (
              <span key={layer} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${LAYER_BADGES[layer]?.color || 'bg-slate-700 text-slate-400'}`}>
                {LAYER_BADGES[layer]?.label || layer}
              </span>
            ))}
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {(alert.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-600 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.05] pt-3">
          <p className="text-xs text-slate-400 leading-relaxed">{alert.description}</p>

          {/* Indicators */}
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Detection Indicators</div>
            <div className="space-y-1.5">
              {alert.indicators.map((ind, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.04]">
                  <span className="text-xs font-mono font-bold text-slate-400 w-24 shrink-0">{ind.parameter}</span>
                  <span className="text-xs font-mono text-slate-600">{ind.busId}</span>
                  <span className="text-xs font-mono text-red-400 ml-auto font-bold">{ind.deviation}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MITRE */}
          {mitreTactic && (
            <div className="flex items-center gap-3 bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-500/10">
              <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-xs font-bold text-slate-500">MITRE ICS:</span>
              <span className="text-xs font-mono font-bold text-amber-400">{mitreTactic.id}</span>
              <span className="text-xs text-slate-400">{mitreTactic.name}</span>
            </div>
          )}

          {/* Assets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Affected:</span>
            {alert.affectedAssets.map(a => (
              <span key={a} className="text-xs font-mono bg-red-500/8 text-red-400 px-2 py-0.5 rounded-lg border border-red-500/15">
                {a}
              </span>
            ))}
          </div>

          {/* Recommendation */}
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2">
            <span className="text-xs font-bold text-blue-400">↳ </span>
            <span className="text-xs text-blue-300/80">{alert.recommendation}</span>
          </div>

          <div className="text-[10px] font-mono text-slate-700 text-right tabular-nums">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
