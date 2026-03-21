'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import SystemStatusBar from './SystemStatusBar';
import MetricCards from './MetricCards';
import TelemetryCharts from './TelemetryCharts';
import AlertPanel from './AlertPanel';
import GridTopologyMap from './GridTopologyMap';
import KillChainTimeline from './KillChainTimeline';
import MQTTPacketInspector from './MQTTPacketInspector';
import MitreAttackMatrix from './MitreAttackMatrix';
import ConfidenceRadar from './ConfidenceRadar';
import { SystemState, ThreatAlert, GridTelemetry } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';
import type { KillChainData, MQTTPacket, LiveAttack } from '@/hooks/useSSEGridData';

interface CommandCenterProps {
  systemState: SystemState | null;
  alerts: ThreatAlert[];
  telemetryHistory: Map<string, GridTelemetry[]>;
  alertCount: number;
  shield?: ShieldData | null;
  simulationRunning: boolean;
  killChain?: KillChainData | null;
  mqttPackets?: MQTTPacket[];
  liveAttacks?: LiveAttack[];
}

export default function CommandCenter({
  systemState,
  alerts,
  telemetryHistory,
  alertCount,
  shield,
  simulationRunning,
  killChain,
  mqttPackets = [],
  liveAttacks = [],
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
      <SystemStatusBar systemState={systemState} alertCount={alertCount} simulationRunning={simulationRunning} />

      <main className="flex-1 flex flex-col p-3 sm:p-6 gap-4 sm:gap-6 overflow-hidden">
        {/* Metric Cards Row */}
        <div className="w-full">
          <MetricCards systemState={systemState} />
        </div>

        {/* Header with Title and System State */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-2 sm:px-4 gap-2 sm:gap-0">
          <div className="space-y-1">
            <h1 className="text-sm sm:text-xl font-black uppercase tracking-[0.15em] sm:tracking-[0.3em] text-slate-100 flex items-center gap-2 sm:gap-3">
              <span className="w-1 sm:w-1.5 h-4 sm:h-6 bg-blue-600 rounded-full" />
              VajraGrid Command Center
            </h1>
            <div className="flex items-center gap-3 pl-3 sm:pl-4">
              <p className="text-[9px] sm:text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Real-time Critical Infrastructure Security Intelligence
              </p>
              <Link
                href="/grid-3d"
                className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider border bg-indigo-950/50 text-indigo-400 border-indigo-800/50 hover:bg-indigo-900/50 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                3D View
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest bg-slate-900/40 border border-slate-800/50 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-sm flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-400 hidden sm:inline">Security Node:</span>
              <span className="text-emerald-500">Active</span>
            </div>
            <div className="w-px h-3 bg-slate-800 hidden sm:block" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-slate-400 hidden sm:inline">ML Layer:</span>
              <span className="text-blue-500">Analyzing</span>
            </div>
            <div className="w-px h-3 bg-slate-800 hidden sm:block" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-slate-400 hidden sm:inline">VajraShield:</span>
              <span className={shield?.activeEvents?.length ? 'text-cyan-400 animate-pulse' : 'text-emerald-500'}>
                {shield?.activeEvents?.length ? `Healing (${shield.activeEvents.length})` : 'Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Topology, Charts and Alerts */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 min-h-0">
          {/* Main Visualization Column (3/4 width) */}
          <div className="lg:col-span-3 flex flex-col gap-4 sm:gap-6 overflow-y-auto custom-scrollbar sm:pr-1">
            {/* Kill Chain Timeline */}
            <div className="w-full">
              <KillChainTimeline
                killChain={killChain ?? null}
                shield={shield ?? null}
                attackCount={liveAttacks.length}
              />
            </div>

            {/* Real-time Topology Map */}
            <div className="w-full">
              <GridTopologyMap 
                latestTelemetry={latestTelemetry} 
                alerts={alerts}
                shield={shield}
              />
            </div>

            {/* MITRE ATT&CK Matrix + Confidence Radar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
              <div className="md:col-span-2">
                <MitreAttackMatrix alerts={alerts} />
              </div>
              <div className="md:col-span-1">
                <ConfidenceRadar
                  killChain={killChain ?? null}
                  alertConfidence={alerts.length > 0 ? Math.max(...alerts.map(a => a.confidence)) : 0}
                />
              </div>
            </div>
            
            {/* Historical Charts */}
            <div className="w-full pb-4 sm:pb-6">
              <TelemetryCharts telemetryHistory={telemetryHistory} />
            </div>
          </div>

          {/* Right Column: Alerts + MQTT Inspector (1/4 width) */}
          <div className="lg:col-span-1 flex flex-col gap-4 max-h-[50vh] lg:max-h-[80vh] lg:sticky lg:top-16 overflow-y-auto">
            <AlertPanel alerts={alerts} />
            <MQTTPacketInspector packets={mqttPackets} liveAttacks={liveAttacks} />
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="px-3 sm:px-6 py-2 sm:py-2.5 bg-slate-950/80 backdrop-blur-md border-t border-slate-900 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-3 sm:w-4 h-3 sm:h-4 bg-blue-600 rounded-sm transform rotate-45" />
          <span className="text-[10px] sm:text-xs font-black tracking-tighter uppercase">VajraGrid <span className="text-blue-500 font-normal">Enterprise v1.0</span></span>
        </div>
        <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono tracking-widest uppercase hidden sm:block">
          AI-Driven Cyber Defense for Smart Grid Infrastructure
        </div>
      </footer>
    </div>
  );
}
