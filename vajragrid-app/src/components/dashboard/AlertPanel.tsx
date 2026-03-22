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
    <div data-testid="alert-panel" className="flex flex-col h-full max-h-[80vh] bg-transparent overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex justify-between items-center">
        <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white flex items-center gap-2.5">
          <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Threat Feed
        </h2>
        <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Click to Explain</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
        {sortedAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-12">
            <svg className="w-10 h-10 text-emerald-500/30 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="text-sm text-slate-500 font-semibold">No threats detected</p>
            <p className="text-xs text-slate-600 uppercase mt-1 tracking-wider">System nominal</p>
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
