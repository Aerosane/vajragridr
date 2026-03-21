'use client';

import React from 'react';
import { ThreatAlert } from '@/lib/types';
import ExplainableAlertCard from './ExplainableAlertCard';

interface AlertPanelProps {
  alerts: ThreatAlert[];
}

export default function AlertPanel({ alerts }: AlertPanelProps) {
  const sortedAlerts = [...alerts].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, 20);

  return (
    <div data-testid="alert-panel" className="flex flex-col h-full max-h-[80vh] bg-slate-900/95 border border-slate-700 rounded-lg overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Threat Intelligence Feed
        </h2>
        <span className="text-[10px] font-mono text-slate-500 uppercase">Live SCADA Scan · Click to Explain</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {sortedAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 italic text-sm">
            <p>No threats detected.</p>
            <p className="text-[10px] uppercase mt-1">System nominal</p>
          </div>
        ) : (
          sortedAlerts.map((alert, idx) => (
            <ExplainableAlertCard key={`${alert.id}-${idx}`} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
}
