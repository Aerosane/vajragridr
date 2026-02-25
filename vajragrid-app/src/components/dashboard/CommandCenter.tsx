'use client';

import React, { useMemo } from 'react';
import SystemStatusBar from './SystemStatusBar';
import MetricCards from './MetricCards';
import TelemetryCharts from './TelemetryCharts';
import AlertPanel from './AlertPanel';
import GridTopologyMap from './GridTopologyMap';
import { SystemState, ThreatAlert, GridTelemetry } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';

interface CommandCenterProps {
  systemState: SystemState | null;
  alerts: ThreatAlert[];
  telemetryHistory: Map<string, GridTelemetry[]>;
  alertCount: number;
  shield?: ShieldData | null;
}

export default function CommandCenter({
  systemState,
  alerts,
  telemetryHistory,
  alertCount,
  shield,
}: CommandCenterProps) {
  // Extract latest telemetry for each bus
  const latestTelemetry = useMemo(() => {
    return Array.from(telemetryHistory.values())
      .map(history => history[history.length - 1])
      .filter(Boolean);
  }, [telemetryHistory]);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0e1a] text-slate-100">
      {/* Top Status Bar - Full Width */}
      <SystemStatusBar systemState={systemState} alertCount={alertCount} />

      <main className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
        {/* Metric Cards Row */}
        <div className="w-full">
          <MetricCards systemState={systemState} />
        </div>

        {/* Header with Title and System State */}
        <div className="flex justify-between items-center px-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black uppercase tracking-[0.3em] text-slate-100 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-blue-600 rounded-full" />
              VajraGrid Command Center
            </h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-4">
              Real-time Critical Infrastructure Security Intelligence
            </p>
          </div>
          
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest bg-slate-900/40 border border-slate-800/50 px-4 py-2 rounded-full backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-400">Security Node:</span>
              <span className="text-emerald-500">Active</span>
            </div>
            <div className="w-px h-3 bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">ML Layer:</span>
              <span className="text-blue-500">Analyzing</span>
            </div>
            <div className="w-px h-3 bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">VajraShield:</span>
              <span className={shield?.activeEvents?.length ? 'text-cyan-400 animate-pulse' : 'text-emerald-500'}>
                {shield?.activeEvents?.length ? `Healing (${shield.activeEvents.length})` : 'Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Topology, Charts and Alerts */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
          {/* Main Visualization Column (3/4 width) */}
          <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1">
            {/* Real-time Topology Map */}
            <div className="w-full">
              <GridTopologyMap 
                latestTelemetry={latestTelemetry} 
                alerts={alerts}
                shield={shield}
              />
            </div>
            
            {/* Historical Charts */}
            <div className="w-full pb-6">
              <TelemetryCharts telemetryHistory={telemetryHistory} />
            </div>
          </div>

          {/* Alert Panel Column (1/4 width) */}
          <div className="lg:col-span-1 max-h-[80vh] sticky top-16">
            <AlertPanel alerts={alerts} />
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="px-6 py-2.5 bg-slate-950/80 backdrop-blur-md border-t border-slate-900 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-600 rounded-sm transform rotate-45" />
          <span className="text-xs font-black tracking-tighter uppercase">VajraGrid <span className="text-blue-500 font-normal">Enterprise v1.0</span></span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
          AI-Driven Cyber Defense for Smart Grid Infrastructure
        </div>
      </footer>
    </div>
  );
}
