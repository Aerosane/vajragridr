'use client';

import React, { useMemo } from 'react';
import SystemStatusBar from './SystemStatusBar';
import MetricCards from './MetricCards';
import TelemetryCharts from './TelemetryCharts';
import AlertPanel from './AlertPanel';
import GridTopologyMap from './GridTopologyMap';
import { SystemState, ThreatAlert, GridTelemetry } from '@/lib/types';

interface CommandCenterProps {
  systemState: SystemState | null;
  alerts: ThreatAlert[];
  telemetryHistory: Map<string, GridTelemetry[]>;
  alertCount: number;
}

export default function CommandCenter({
  systemState,
  alerts,
  telemetryHistory,
  alertCount,
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

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Metric Cards Row */}
        <MetricCards systemState={systemState} />

        {/* Main Content Grid: Topology, Charts and Alerts */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {/* Main Visualization Column (2/3 width) */}
          <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
            {/* Real-time Topology Map */}
            <div className="w-full">
              <GridTopologyMap 
                latestTelemetry={latestTelemetry} 
                alerts={alerts} 
              />
            </div>
            
            {/* Historical Charts */}
            <TelemetryCharts telemetryHistory={telemetryHistory} />
          </div>

          {/* Alert Panel Column (1/3 width) */}
          <div className="lg:col-span-1 h-full min-h-[400px]">
            <AlertPanel alerts={alerts} />
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="px-6 py-2 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-600 rounded-sm transform rotate-45" />
          <span className="text-xs font-black tracking-tighter uppercase">VajraGrid <span className="text-blue-500 font-normal">v1.0.4-HACKATHON</span></span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
          AI-Driven Cyber Defense for Smart Grid Infrastructure
        </div>
      </footer>
    </div>
  );
}
