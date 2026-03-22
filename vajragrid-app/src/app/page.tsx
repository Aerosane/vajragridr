'use client';

import React, { useMemo, Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  Swords,
  Activity,
  Radio,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import SystemStatusBar from '@/components/dashboard/SystemStatusBar';
import MetricCards from '@/components/dashboard/MetricCards';
import TelemetryCharts from '@/components/dashboard/TelemetryCharts';
import AlertPanel from '@/components/dashboard/AlertPanel';
import KillChainTimeline from '@/components/dashboard/KillChainTimeline';
import MQTTPacketInspector from '@/components/dashboard/MQTTPacketInspector';
import MitreAttackMatrix from '@/components/dashboard/MitreAttackMatrix';
import ConfidenceRadar from '@/components/dashboard/ConfidenceRadar';
import AttackControlPanel from '@/components/operator/AttackControlPanel';
import HealingTimeline from '@/components/dashboard/HealingTimeline';
import { useSSEGridData } from '@/hooks/useSSEGridData';
import type { GridTelemetry } from '@/lib/types';

const InlineGrid3D = dynamic(() => import('@/components/dashboard/InlineGrid3D'), { ssr: false });

/* ─── Design tokens ────────────────────────────────────────── */
const glass = 'bg-zinc-900/40 backdrop-blur-2xl border border-white/5 shadow-2xl rounded-2xl';

/* ─── Right-Panel Tabs ─────────────────────────────────────── */
const RIGHT_TABS = [
  { id: 'attack', icon: Swords, label: 'Attack' },
  { id: 'shield', icon: Shield, label: 'Shield' },
  { id: 'mqtt', icon: Radio, label: 'MQTT' },
] as const;

type RightTab = (typeof RIGHT_TABS)[number]['id'];

/* ─── Main Page ────────────────────────────────────────────── */
export default function Home() {
  const {
    telemetryHistory,
    systemState,
    alerts,
    simulationState,
    shield,
    liveAttacks,
    killChain,
    mqttPackets,
    connected,
    error,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
    liveInjectAttack,
    liveRemoveAttack,
    liveClearAttacks,
  } = useSSEGridData();

  const [rightTab, setRightTab] = useState<RightTab>('attack');

  const isLiveMode = liveAttacks !== undefined && (
    liveAttacks.length > 0 ||
    (telemetryHistory.size > 0 && !simulationState?.running)
  );

  const latestTelemetry = useMemo<GridTelemetry[]>(() => {
    return Array.from(telemetryHistory.values())
      .map(h => h[h.length - 1])
      .filter(Boolean);
  }, [telemetryHistory]);

  const alertCount = alerts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="h-screen flex flex-col bg-[#09090b] text-white overflow-hidden">
      <SystemStatusBar systemState={systemState} alertCount={alertCount} simulationRunning={simulationState?.running ?? false} />

      {/* Navigation */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900/60 border-b border-white/5 shrink-0">
        <Link href="/grid-3d" className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
          <Zap size={12} />
          3D Command View
        </Link>
        <span className="text-[10px] font-mono text-zinc-600">|</span>
        <span className="text-[10px] font-mono text-zinc-500">Dashboard Home</span>
      </div>

      {error && !connected && (
        <div className="mx-3 mt-2 bg-rose-950/60 border border-rose-800/40 rounded-xl px-4 py-2 text-xs font-mono text-rose-400">
          {error}
        </div>
      )}

      {/* 3-Column Workspace */}
      <div className="flex-1 grid grid-cols-[280px_1fr_320px] gap-3 p-3 min-h-0 overflow-hidden">

        {/* LEFT COLUMN: Metrics & Alerts */}
        <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-0.5 min-h-0">
          <div className={`${glass} p-4`}>
            <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400 mb-3 flex items-center gap-2">
              <Activity size={13} className="text-emerald-500" />
              System Metrics
            </h2>
            <MetricCards systemState={systemState} />
          </div>

          <div className={`${glass} p-0 overflow-hidden`}>
            <KillChainTimeline killChain={killChain ?? null} shield={shield ?? null} attackCount={liveAttacks?.length ?? 0} />
          </div>

          <div className={`${glass} p-0 overflow-hidden flex-1 min-h-[180px]`}>
            <AlertPanel alerts={alerts} />
          </div>
        </div>

        {/* CENTER COLUMN: 3D Grid + Analytics */}
        <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0">
          <div className={`${glass} overflow-hidden relative isolate flex-1 min-h-[380px]`}>
            <div className="absolute top-4 left-5 z-10 flex items-center gap-3 pointer-events-none">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-white flex items-center gap-2">
                <Zap size={14} className="text-cyan-400" />
                Grid Topology
              </h2>
              <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                {latestTelemetry.length}/5 Online
              </span>
            </div>
            <div className="w-full h-full min-h-0 relative isolate z-0">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-mono">Initializing 3D</div>}>
                <InlineGrid3D latestTelemetry={latestTelemetry} alerts={alerts} shield={shield ?? null} />
              </Suspense>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className={`col-span-2 ${glass} p-0 overflow-hidden`}>
              <MitreAttackMatrix alerts={alerts} />
            </div>
            <div className={`col-span-1 ${glass} p-0 overflow-hidden`}>
              <ConfidenceRadar killChain={killChain ?? null} alertConfidence={alerts.length > 0 ? Math.max(...alerts.map(a => a.confidence)) : 0} />
            </div>
          </div>

          <div className={`${glass} p-0 overflow-hidden shrink-0`}>
            <TelemetryCharts telemetryHistory={telemetryHistory} />
          </div>
        </div>

        {/* RIGHT COLUMN: Tabbed Controls */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center gap-1 bg-zinc-900/50 border border-white/5 rounded-xl p-1 mb-3 shrink-0">
            {RIGHT_TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                  rightTab === id
                    ? 'bg-cyan-500/15 text-cyan-400 border-b-2 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            {rightTab === 'shield' && (
              <div className={`${glass} p-0 overflow-hidden`}>
                <HealingTimeline
                  activeEvents={shield?.activeEvents || []}
                  completedEvents={shield?.completedEvents || []}
                />
              </div>
            )}

            {rightTab === 'attack' && (
              <AttackControlPanel
                onAttack={isLiveMode ? liveInjectAttack : injectAttack}
                onRemoveAttack={isLiveMode ? liveRemoveAttack : undefined}
                onClearAttacks={isLiveMode ? liveClearAttacks : undefined}
                onStart={startSimulation}
                onStop={stopSimulation}
                onReset={resetSimulation}
                simulationState={simulationState}
                liveAttacks={liveAttacks}
                isLiveMode={isLiveMode}
              />
            )}

            {rightTab === 'mqtt' && (
              <div className={`${glass} p-0 overflow-hidden`}>
                <MQTTPacketInspector packets={mqttPackets ?? []} liveAttacks={liveAttacks ?? []} />
              </div>
            )}
          </div>

          <div className="shrink-0 pt-3 mt-2 border-t border-white/5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-sm transform rotate-45" />
                <span className="text-[11px] font-black tracking-tight uppercase text-zinc-400">VajraGrid <span className="text-blue-400 font-medium">v1.0</span></span>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-mono ${connected ? 'text-emerald-500' : 'text-rose-500'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {connected ? 'LIVE' : 'OFFLINE'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
