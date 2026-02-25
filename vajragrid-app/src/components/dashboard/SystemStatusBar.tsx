'use client';

import React, { useState, useEffect } from 'react';
import { SystemState } from '@/lib/types';

interface SystemStatusBarProps {
  systemState: SystemState | null;
  alertCount: number;
}

export default function SystemStatusBar({ systemState, alertCount }: SystemStatusBarProps) {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (systemState) {
      interval = setInterval(() => {
        setUptime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [!!systemState]);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NOMINAL':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'ALERT':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'EMERGENCY':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'BLACKOUT':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-900/950 border-b border-slate-700 text-slate-100">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">System Status:</span>
          <span className={`px-2 py-0.5 rounded border text-xs font-bold ${getStatusColor(systemState?.systemStatus || 'OFFLINE')}`}>
            {systemState?.systemStatus || 'OFFLINE'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Uptime:</span>
          <span className="text-sm font-mono">{formatUptime(uptime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Threats:</span>
          <span className={`text-sm font-bold ${alertCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {alertCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">SCADA Feeds:</span>
          <span className="text-sm font-bold text-blue-400">
            {systemState?.activeBuses || 0} / 5 ONLINE
          </span>
        </div>

        <div className="text-xs font-mono text-slate-500">
          {systemState?.timestamp ? new Date(systemState.timestamp).toLocaleTimeString() : '--:--:--'}
        </div>
      </div>
    </div>
  );
}
