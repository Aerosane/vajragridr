'use client';

import React from 'react';
import { ThreatAlert } from '@/lib/types';

interface AlertPanelProps {
  alerts: ThreatAlert[];
}

export default function AlertPanel({ alerts }: AlertPanelProps) {
  const sortedAlerts = [...alerts].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, 50);

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'LOW':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  const getRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-700 rounded-lg overflow-hidden shadow-2xl">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Threat Intelligence Feed
        </h2>
        <span className="text-[10px] font-mono text-slate-500 uppercase">Live SCADA Scan</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {sortedAlerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 italic text-sm">
            <p>No threats detected.</p>
            <p className="text-[10px] uppercase mt-1">System nominal</p>
          </div>
        ) : (
          sortedAlerts.map((alert) => (
            <div key={alert.id} className="p-3 bg-slate-950/40 border border-slate-800 rounded hover:border-slate-600 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${getSeverityStyle(alert.severity)}`}>
                  {alert.severity}
                </span>
                <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
                  {getRelativeTime(alert.timestamp)}
                </span>
              </div>
              
              <h3 className="text-xs font-bold text-slate-100 mb-1 uppercase tracking-wide">
                {alert.title}
              </h3>
              
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Affected: <span className="text-slate-200">{alert.affectedAssets.join(', ')}</span></span>
                  <span className="text-blue-400 font-mono">CONF: {(alert.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed line-clamp-2 italic">
                  {alert.description}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
