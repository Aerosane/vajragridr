'use client';

import React, { useState, useEffect } from 'react';
import { SystemState } from '@/lib/types';

interface SystemStatusBarProps {
  systemState: SystemState | null;
  alertCount: number;
}

export default function SystemStatusBar({ systemState, alertCount }: SystemStatusBarProps) {
  const [uptime, setUptime] = useState(0);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    let uptimeInterval: NodeJS.Timeout | undefined;
    if (systemState) {
      uptimeInterval = setInterval(() => {
        setUptime((prev) => prev + 1);
      }, 1000);
    } else {
      setUptime(0);
    }
    
    return () => {
      clearInterval(clockInterval);
      if (uptimeInterval) clearInterval(uptimeInterval);
    };
  }, [systemState]);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NOMINAL':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'ALERT':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'EMERGENCY':
        return 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse';
      case 'BLACKOUT':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-900 text-slate-500 border-slate-800';
    }
  };

  const freq = systemState?.systemFrequency || 0;
  const freqColor = freq > 50.05 || freq < 49.95 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div data-testid="status-bar" className="flex items-center justify-between px-6 py-2.5 bg-[#0a0e1a]/80 backdrop-blur-md border-b border-slate-800 text-slate-100 sticky top-0 z-40">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">VajraGrid Ops</span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">System Status:</span>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-black tracking-wider ${getStatusColor(systemState?.systemStatus || 'OFFLINE')}`}>
            {systemState?.systemStatus || 'OFFLINE'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Uptime:</span>
          <span className="text-xs font-mono font-bold text-slate-300">{formatUptime(uptime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full border border-slate-800/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grid Frequency:</span>
          <span className={`text-xs font-mono font-black ${freqColor}`}>
            {freq.toFixed(3)} <span className="text-[10px] font-normal opacity-60">Hz</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Threats:</span>
          <span className={`text-xs font-black ${alertCount > 0 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>
            {alertCount.toString().padStart(2, '0')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SCADA:</span>
          <span className="text-xs font-black text-blue-400">
            {systemState?.activeBuses || 0}/5 <span className="text-[10px] font-normal text-slate-500">ONLINE</span>
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex flex-col items-end">
          <div className="text-xs font-mono font-bold text-slate-300">
            {currentTime ? currentTime.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
          </div>
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter">
            {currentTime ? currentTime.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '---'}
          </div>
        </div>
      </div>
    </div>
  );
}
