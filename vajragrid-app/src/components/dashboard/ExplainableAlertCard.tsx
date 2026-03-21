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

const SEVERITY_COLORS = {
  CRITICAL: 'text-red-400 bg-red-500/20 border-red-500/50',
  HIGH: 'text-orange-400 bg-orange-500/20 border-orange-500/50',
  MEDIUM: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50',
  LOW: 'text-blue-400 bg-blue-500/20 border-blue-500/50',
};

const LAYER_BADGES: Record<string, { color: string; label: string }> = {
  RULES: { color: 'bg-blue-500/30 text-blue-300', label: 'Rules' },
  PHYSICS: { color: 'bg-cyan-500/30 text-cyan-300', label: 'Physics' },
  STATISTICAL: { color: 'bg-purple-500/30 text-purple-300', label: 'Statistical' },
  ML: { color: 'bg-pink-500/30 text-pink-300', label: 'ML/ONNX' },
};

interface Props {
  alert: ThreatAlert;
}

export default function ExplainableAlertCard({ alert }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sevColors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.MEDIUM;

  // Extract MITRE tactic ID
  const mitreTacticId = alert.mitreTactic?.match(/T\d{4}|TA\d{4}/)?.[0] || '';
  const mitreTactic = MITRE_TACTIC_MAP[mitreTacticId];

  return (
    <div className={`border rounded-lg transition-all ${expanded ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        {/* Severity badge */}
        <div className={`px-1.5 py-0.5 rounded border text-[9px] font-black shrink-0 ${sevColors}`}>
          {alert.severity}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-slate-200 truncate">{alert.title}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {alert.detectionLayers.map(layer => (
              <span key={layer} className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${LAYER_BADGES[layer]?.color || 'bg-slate-700 text-slate-400'}`}>
                {LAYER_BADGES[layer]?.label || layer}
              </span>
            ))}
            <span className="text-[9px] font-mono text-slate-600">
              {(alert.confidence * 100).toFixed(0)}% conf
            </span>
          </div>
        </div>

        <span className="text-slate-600 text-xs shrink-0">{expanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded detail — Explainability */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-700/50 pt-3">
          {/* Description */}
          <p className="text-[10px] text-slate-400 leading-relaxed">{alert.description}</p>

          {/* Why it triggered — Indicators */}
          <div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Why VajraGrid flagged this:</div>
            <div className="space-y-1.5">
              {alert.indicators.map((ind, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-950/50 rounded px-2 py-1.5">
                  <span className="text-[9px] font-mono font-bold text-slate-400 w-24 shrink-0">{ind.parameter}</span>
                  <span className="text-[9px] font-mono text-slate-600">{ind.busId}</span>
                  <span className="text-[9px] font-mono text-red-400 ml-auto">{ind.deviation}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MITRE ATT&CK */}
          {mitreTactic && (
            <div className="flex items-center gap-2 bg-slate-950/50 rounded px-2 py-1.5">
              <span className="text-[9px] font-bold text-slate-500">MITRE ICS:</span>
              <span className="text-[9px] font-mono text-amber-400">{mitreTactic.id}</span>
              <span className="text-[9px] text-slate-400">{mitreTactic.name}</span>
            </div>
          )}

          {/* Affected Assets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold text-slate-500">Assets:</span>
            {alert.affectedAssets.map(a => (
              <span key={a} className="text-[9px] font-mono bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">
                {a}
              </span>
            ))}
          </div>

          {/* Recommendation */}
          <div className="bg-blue-950/30 border border-blue-800/30 rounded px-2 py-1.5">
            <span className="text-[9px] font-bold text-blue-400">↳ </span>
            <span className="text-[9px] text-blue-300/80">{alert.recommendation}</span>
          </div>

          {/* Timestamp */}
          <div className="text-[8px] font-mono text-slate-700 text-right">
            {new Date(alert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
