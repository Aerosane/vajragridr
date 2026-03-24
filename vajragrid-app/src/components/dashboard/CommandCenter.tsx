'use client';

import React, { useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import SystemStatusBar from './SystemStatusBar';
import MetricCards from './MetricCards';
import TelemetryCharts from './TelemetryCharts';
import AlertPanel from './AlertPanel';
import KillChainTimeline from './KillChainTimeline';
import MQTTPacketInspector from './MQTTPacketInspector';
import MitreAttackMatrix from './MitreAttackMatrix';
import ConfidenceRadar from './ConfidenceRadar';
import { SystemState, ThreatAlert, GridTelemetry } from '@/lib/types';
import type { ShieldData } from '@/hooks/useSSEGridData';
import type { KillChainData, MQTTPacket, LiveAttack } from '@/hooks/useSSEGridData';

const InlineGrid3D = dynamic(() => import('./InlineGrid3D'), { ssr: false });

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

const glass = 'bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] shadow-2xl rounded-2xl';

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
  const latestTelemetry = useMemo(() => {
    return Array.from(telemetryHistory.values())
      .map(history => history[history.length - 1])
      .filter(Boolean);
  }, [telemetryHistory]);

  return (
    <div className="flex flex-col min-h-screen bg-[#060a14] text-slate-100">
      <SystemStatusBar systemState={systemState} alertCount={alertCount} simulationRunning={simulationRunning} />

      <main className="flex-1 flex flex-col px-4 sm:px-8 py-5 gap-5 sm:gap-7 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1.5">
            <h1 className="text-lg sm:text-2xl font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
              <span className="w-1.5 h-7 rounded-full bg-gradient-to-b from-blue-500 to-cyan-500" />
              VajraGrid Command Center
            </h1>
            <div className="flex items-center gap-4 pl-5">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-[0.15em]">
                Real-time Critical Infrastructure Security Intelligence
              </p>
              <Link
                href="/grid-3d"
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border bg-indigo-950/40 text-indigo-400 border-indigo-500/20 hover:bg-indigo-900/40 hover:border-indigo-400/40 transition-all flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Full 3D View
              </Link>
            </div>
          </div>
          <div className={`flex items-center gap-4 text-xs font-bold uppercase tracking-widest ${glass} px-5 py-2.5 rounded-full`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-slate-400">Security:</span>
              <span className="text-emerald-400">Active</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">ML:</span>
              <span className="text-blue-400">Analyzing</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Shield:</span>
              <span className={shield?.activeEvents?.length ? 'text-cyan-400 animate-pulse' : 'text-emerald-400'}>
                {shield?.activeEvents?.length ? `Healing (${shield.activeEvents.length})` : 'Standby'}
              </span>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <MetricCards systemState={systemState} />

        {/* Main Grid: 12-column */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
          {/* Left — 8/12 */}
          <div className="lg:col-span-8 flex flex-col gap-5 overflow-y-auto custom-scrollbar pr-1">
            <div className={`${glass} p-0 overflow-hidden`}>
              <KillChainTimeline killChain={killChain ?? null} shield={shield ?? null} attackCount={liveAttacks.length} />
            </div>

            {/* 3D Grid */}
            <div className={`${glass} overflow-hidden`}>
              <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
                  Grid Topology — Live
                </h2>
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  {latestTelemetry.length}/5 Nodes Active
                </span>
              </div>
              <div className="h-[420px] w-full">
                <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-slate-600 text-sm font-mono">Loading 3D Grid...</div>}>
                  <InlineGrid3D latestTelemetry={latestTelemetry} alerts={alerts} shield={shield ?? null} />
                </Suspense>
              </div>
            </div>

            {/* MITRE + Radar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className={`md:col-span-2 ${glass} p-0 overflow-hidden`}>
                <MitreAttackMatrix alerts={alerts} />
              </div>
              <div className={`md:col-span-1 ${glass} p-0 overflow-hidden`}>
                <ConfidenceRadar killChain={killChain ?? null} alertConfidence={alerts.length > 0 ? Math.max(...alerts.map(a => a.confidence)) : 0} />
              </div>
            </div>

            {/* Charts */}
            <div className={`${glass} p-0 overflow-hidden`}>
              <TelemetryCharts telemetryHistory={telemetryHistory} />
            </div>
          </div>

          {/* Right — 4/12 */}
          <div className="lg:col-span-4 flex flex-col gap-5 max-h-[50vh] lg:max-h-[85vh] lg:sticky lg:top-16 overflow-y-auto custom-scrollbar">
            <div className={`${glass} p-0 overflow-hidden flex-1 min-h-0`}>
              <AlertPanel alerts={alerts} />
            </div>
            <div className={`${glass} p-0 overflow-hidden`}>
              <MQTTPacketInspector packets={mqttPackets} liveAttacks={liveAttacks} />
            </div>
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-8 py-3 bg-[#060a14]/90 backdrop-blur-xl border-t border-white/[0.04] flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-sm transform rotate-45" />
          <span className="text-sm font-black tracking-tight uppercase">VajraGrid <span className="text-blue-400 font-medium">Enterprise v1.0</span></span>
        </div>
        <div className="text-xs text-slate-600 font-mono tracking-widest uppercase hidden sm:block">
          AI-Driven Cyber Defense for Smart Grid Infrastructure
        </div>
      </footer>
    </div>
  );
}
