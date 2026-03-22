'use client';

import React, { useMemo, Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import {
  LayoutDashboard,
  Shield,
  Swords,
  Activity,
  Radio,
  Settings,
  FileText,
  Zap,
} from 'lucide-react';
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

/* ─── Glass tokens ─────────────────────────────────────────── */
const glass = 'bg-zinc-900/40 backdrop-blur-2xl border border-white/5 shadow-2xl rounded-2xl';

/* ─── Sidebar Nav ──────────────────────────────────────────── */
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dash' },
  { icon: FileText, label: 'Logs', id: 'logs' },
  { icon: Settings, label: 'Settings', id: 'settings' },
] as const;

function Sidebar() {
  const [active, setActive] = useState('dash');
  return (
    <div className="flex flex-col items-center py-5 gap-1 w-14 bg-zinc-950/80 border-r border-white/5 shrink-0">
      {/* Brand mark */}
      <div className="w-8 h-8 mb-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg transform rotate-45 shadow-[0_0_16px_rgba(59,130,246,0.4)]" />
      {NAV_ITEMS.map(({ icon: Icon, label, id }) => (
        <button
          key={id}
          onClick={() => setActive(id)}
          title={label}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
            active === id
              ? 'bg-blue-500/15 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
              : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
          }`}
        >
          <Icon size={18} strokeWidth={active === id ? 2.2 : 1.5} />
        </button>
      ))}
      {/* Spacer */}
      <div className="flex-1" />
      {/* Connection dot */}
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] mb-2" />
    </div>
  );
}

/* ─── Resize Handle ────────────────────────────────────────── */
function ResizeHandle() {
  return (
    <PanelResizeHandle className="w-1.5 group flex items-center justify-center hover:bg-blue-500/10 transition-colors">
      <div className="w-px h-8 bg-white/10 group-hover:bg-blue-500/40 transition-colors rounded-full" />
    </PanelResizeHandle>
  );
}

/* ─── Right-Panel Tab System ───────────────────────────────── */
const RIGHT_TABS = [
  { id: 'shield', icon: Shield, label: 'Shield' },
  { id: 'attack', icon: Swords, label: 'Attack' },
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
    <div className="h-screen flex bg-[#09090b] text-white overflow-hidden">
      {/* Left Navbar */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <SystemStatusBar systemState={systemState} alertCount={alertCount} simulationRunning={simulationState?.running ?? false} />

        {/* Error banner */}
        {error && !connected && (
          <div className="mx-4 mt-2 bg-rose-950/60 border border-rose-800/40 rounded-xl px-4 py-2 text-xs font-mono text-rose-400">
            ⚠ {error}
          </div>
        )}

        {/* Resizable 3-panel workspace */}
        <div className="flex-1 p-3 min-h-0">
          <PanelGroup orientation="horizontal" className="h-full">
            {/* ─── LEFT PANEL: Metrics & Telemetry ─── */}
            <Panel defaultSize={25} minSize={18} maxSize={35}>
              <div className="h-full flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
                {/* Metric Cards */}
                <div className={`${glass} p-5`}>
                  <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-4 flex items-center gap-2">
                    <Activity size={14} className="text-emerald-500" />
                    System Metrics
                  </h2>
                  <MetricCards systemState={systemState} />
                </div>

                {/* Kill Chain */}
                <div className={`${glass} p-0 overflow-hidden`}>
                  <KillChainTimeline killChain={killChain ?? null} shield={shield ?? null} attackCount={liveAttacks?.length ?? 0} />
                </div>

                {/* Alert Feed */}
                <div className={`${glass} p-0 overflow-hidden flex-1 min-h-[200px]`}>
                  <AlertPanel alerts={alerts} />
                </div>
              </div>
            </Panel>

            <ResizeHandle />

            {/* ─── CENTER PANEL: 3D Grid + Charts ─── */}
            <Panel defaultSize={50} minSize={35}>
              <div className="h-full flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                {/* 3D Topology */}
                <div className={`${glass} overflow-hidden flex-1 min-h-[350px] relative isolate`}>
                  <div className="absolute top-4 left-5 z-10 flex items-center gap-3">
                    <h2 className="text-sm font-black uppercase tracking-[0.12em] text-white flex items-center gap-2">
                      <Zap size={14} className="text-cyan-400" />
                      Grid Topology
                    </h2>
                    <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                      {latestTelemetry.length}/5 Online
                    </span>
                  </div>
                  <div className="w-full h-full overflow-hidden z-0">
                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-mono">Initializing 3D…</div>}>
                      <InlineGrid3D latestTelemetry={latestTelemetry} alerts={alerts} shield={shield ?? null} />
                    </Suspense>
                  </div>
                </div>

                {/* MITRE + Radar */}
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  <div className={`col-span-2 ${glass} p-0 overflow-hidden`}>
                    <MitreAttackMatrix alerts={alerts} />
                  </div>
                  <div className={`col-span-1 ${glass} p-0 overflow-hidden`}>
                    <ConfidenceRadar killChain={killChain ?? null} alertConfidence={alerts.length > 0 ? Math.max(...alerts.map(a => a.confidence)) : 0} />
                  </div>
                </div>

                {/* Charts */}
                <div className={`${glass} p-0 overflow-hidden shrink-0`}>
                  <TelemetryCharts telemetryHistory={telemetryHistory} />
                </div>
              </div>
            </Panel>

            <ResizeHandle />

            {/* ─── RIGHT PANEL: Tabbed Controls ─── */}
            <Panel defaultSize={25} minSize={18} maxSize={35}>
              <div className="h-full flex flex-col">
                {/* Tab Bar */}
                <div className="flex items-center gap-1 bg-zinc-900/50 rounded-xl p-1 mb-3 shrink-0">
                  {RIGHT_TABS.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      onClick={() => setRightTab(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                        rightTab === id
                          ? 'bg-blue-500/15 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.1)]'
                          : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <Icon size={14} />
                      <span className="hidden xl:inline">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                  {rightTab === 'shield' && (
                    <div className="space-y-3">
                      <div className={`${glass} p-0 overflow-hidden`}>
                        <HealingTimeline
                          activeEvents={shield?.activeEvents || []}
                          completedEvents={shield?.completedEvents || []}
                        />
                      </div>
                    </div>
                  )}

                  {rightTab === 'attack' && (
                    <div className="space-y-3">
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
                    </div>
                  )}

                  {rightTab === 'mqtt' && (
                    <div className={`${glass} p-0 overflow-hidden`}>
                      <MQTTPacketInspector packets={mqttPackets ?? []} liveAttacks={liveAttacks ?? []} />
                    </div>
                  )}
                </div>

                {/* Footer */}
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
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  );
}
