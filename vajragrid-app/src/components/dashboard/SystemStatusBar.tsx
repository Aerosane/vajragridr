'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SystemState } from '@/lib/types';

interface SystemStatusBarProps {
  systemState: SystemState | null;
  alertCount: number;
  simulationRunning: boolean;
}

export default function SystemStatusBar({ systemState, alertCount, simulationRunning }: SystemStatusBarProps) {
  const [uptime, setUptime] = useState(0);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use actual simulation running state, not systemState presence
  const isRunning = simulationRunning;

  // Clock — runs once on mount
  useEffect(() => {
    clockRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  // Uptime counter — starts/stops based on running state
  useEffect(() => {
    if (isRunning) {
      uptimeRef.current = setInterval(() => {
        setUptime((prev) => prev + 1);
      }, 1000);
      return () => { if (uptimeRef.current) clearInterval(uptimeRef.current); };
    }
    return undefined;
  }, [isRunning]);

  // Reset uptime when simulation stops
  const [prevRunning, setPrevRunning] = useState(false);
  if (prevRunning && !isRunning) {
    setUptime(0);
  }
  if (prevRunning !== isRunning) {
    setPrevRunning(isRunning);
  }

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
    <div data-testid="status-bar" className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 bg-zinc-950/90 backdrop-blur-2xl border-b border-white/5 text-zinc-100 sticky top-0 z-40 gap-2 sm:gap-0">
      <div className="flex items-center gap-4 sm:gap-8 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
          <span className="text-xs font-black uppercase tracking-[0.25em] bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">VajraGrid Ops</span>
        </div>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:inline">Status:</span>
          <span className={`px-2.5 py-1 rounded-lg border text-xs font-black tracking-wider ${getStatusColor(isRunning ? (systemState?.systemStatus || 'NOMINAL') : 'OFFLINE')}`}>
            {isRunning ? (systemState?.systemStatus || 'NOMINAL') : 'OFFLINE'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 hidden sm:inline">Uptime:</span>
          <span className="text-sm font-mono font-bold text-slate-300 tabular-nums">{formatUptime(uptime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-8 flex-wrap">
        <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-full border border-white/[0.06]">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:inline">Freq:</span>
          <span className={`text-sm font-mono font-black tabular-nums ${freqColor}`}>
            {freq.toFixed(3)} <span className="text-xs font-normal opacity-50">Hz</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:inline">Threats:</span>
          <span className={`text-sm font-black tabular-nums ${alertCount > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
            {alertCount.toString().padStart(2, '0')}
          </span>
        </div>

        <div className="flex items-center gap-2 hidden sm:flex">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">SCADA:</span>
          <span className="text-sm font-black text-blue-400 tabular-nums">
            {systemState?.activeBuses || 0}/5
          </span>
        </div>

        <div className="h-5 w-px bg-white/10 hidden md:block" />

        <div className="flex flex-col items-end hidden md:flex">
          <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">
            {currentTime ? currentTime.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
          </div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            {currentTime ? currentTime.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '---'}
          </div>
        </div>
      </div>
    </div>
  );
}
