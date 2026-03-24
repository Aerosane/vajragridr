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

  // Live mode only when there are actual MQTT-ingested attacks
  const isLiveMode = liveAttacks.length > 0;

  const latestTelemetry = useMemo<GridTelemetry[]>(() => {
    return Array.from(telemetryHistory.values())
      .map(h => h[h.length - 1])
      .filter(Boolean);
  }, [telemetryHistory]);

  const alertCount = alerts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-white overflow-hidden">
      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-2 bg-zinc-900/60 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-sm transform rotate-45" />
            <span className="text-sm font-black tracking-tight uppercase text-white">VajraGrid</span>
          </div>
          <span className="text-xs font-mono text-zinc-600">|</span>
          <Link href="/grid-3d" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
            <Zap size={12} />
            3D Command View
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <SystemStatusBar systemState={systemState} alertCount={alertCount} simulationRunning={simulationState?.running ?? false} />
          <div className={`flex items-center gap-1.5 text-xs font-mono ${connected ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {error && !connected && (
        <div className="mx-6 mt-3 bg-rose-950/60 border border-rose-800/40 rounded-xl px-4 py-2 text-xs font-mono text-rose-400 shrink-0">
          {error}
        </div>
      )}

      {/* ─── 12-Column Grid Workspace ─────────────────────────── */}
      <div className="flex-1 min-h-0 p-4 grid grid-cols-12 gap-4 overflow-hidden">

        {/* ── LEFT PANEL (col 1-3): Metrics + Kill Chain + Alerts ── */}
        <div className="col-span-3 h-full flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
          <div className={`${glass} p-5 flex-shrink-0`}>
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-4 flex items-center gap-2">
              <Activity size={14} className="text-emerald-500" />
              System Metrics
            </h2>
            <MetricCards systemState={systemState} />
          </div>

          <div className={`${glass} p-0 overflow-hidden flex-shrink-0`}>
            <KillChainTimeline killChain={killChain ?? null} shield={shield ?? null} attackCount={liveAttacks?.length ?? 0} />
          </div>

          <div className={`${glass} p-0 overflow-hidden flex-1 min-h-[200px]`}>
            <AlertPanel alerts={alerts} />
          </div>
        </div>

        {/* ── CENTER PANEL (col 4-9): 3D Topology + Analytics ── */}
        <div className="col-span-6 h-full flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* 3D Map — locked to fill available space */}
          <div className={`${glass} relative isolate flex-1 min-h-[300px] overflow-hidden`}>
            <div className="absolute top-4 left-5 z-10 flex items-center gap-3 pointer-events-none">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-white flex items-center gap-2">
                <Zap size={14} className="text-cyan-400" />
                Grid Topology
              </h2>
              <span className="text-xs font-mono text-zinc-500 tabular-nums">
                {latestTelemetry.length}/5 Online
              </span>
            </div>
            <div className="absolute inset-0 w-full h-full z-0">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-mono">Initializing 3D Engine...</div>}>
                <InlineGrid3D latestTelemetry={latestTelemetry} alerts={alerts} shield={shield ?? null} />
              </Suspense>
            </div>
          </div>

          {/* Analytics row */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
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

        {/* ── RIGHT PANEL (col 10-12): Tabbed Controls ── */}
        <div className="col-span-3 h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar pl-1">
          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-zinc-900/50 border border-white/5 rounded-xl p-1 shrink-0">
            {RIGHT_TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  rightTab === id
                    ? 'bg-cyan-500/15 text-cyan-400 border-b-2 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 space-y-4">
            {rightTab === 'shield' && (
              <div className={`${glass} p-0 overflow-hidden h-full flex flex-col`}>
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
              <div className={`${glass} p-0 overflow-hidden h-full flex flex-col`}>
                <MQTTPacketInspector packets={mqttPackets ?? []} liveAttacks={liveAttacks ?? []} />
              </div>
            )}
          </div>

          {/* Footer badge */}
          <div className="shrink-0 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black tracking-tight uppercase text-zinc-400">VajraGrid <span className="text-blue-400 font-medium">v1.0</span></span>
              <span className="text-xs font-mono text-zinc-600">{new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
