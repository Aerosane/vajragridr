'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSSEGridData } from '@/hooks/useSSEGridData';

const Grid3DVisualization = dynamic(
  () => import('@/components/3d/Grid3DVisualization'),
  { ssr: false, loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#09090b]">
      <div className="text-zinc-500 font-mono text-sm animate-pulse">Initializing 3D Engine...</div>
    </div>
  )}
);

export default function Grid3DPage() {
  const {
    telemetryHistory,
    alerts,
    shield,
    simulationState,
    connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
  } = useSSEGridData();

  const latestTelemetry = useMemo(() => {
    return Array.from(telemetryHistory.values())
      .map(history => history[history.length - 1])
      .filter(Boolean);
  }, [telemetryHistory]);

  const isRunning = simulationState?.running ?? false;
  const tick = simulationState?.tick ?? 0;
  const attackCount = simulationState?.activeAttacks?.length ?? 0;

  // Auto-start simulation when visiting 3D view
  const autoStarted = useRef(false);
  useEffect(() => {
    if (connected && !isRunning && !autoStarted.current) {
      autoStarted.current = true;
      startSimulation();
    }
  }, [connected, isRunning, startSimulation]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-slate-100 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/60 backdrop-blur-md border-b border-white/5 z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-xs font-black tracking-tighter uppercase hover:text-blue-400 transition-colors">
            <div className="w-3 h-3 bg-blue-600 rounded-sm transform rotate-45" />
            VajraGrid
          </Link>
          <div className="w-px h-4 bg-zinc-700" />
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">3D Command View</span>
          <div className="w-px h-4 bg-zinc-700" />
          <div className={`flex items-center gap-1.5 text-xs font-bold uppercase ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-mono text-zinc-500 mr-3">
            <span>TICK: {tick}</span>
            <span className="mx-1">•</span>
            <span>ATTACKS: {attackCount}</span>
          </div>

          <button
            onClick={() => isRunning ? stopSimulation() : startSimulation()}
            className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border transition-all ${
              isRunning
                ? 'bg-red-950/50 text-red-400 border-red-800/50 hover:bg-red-900/50'
                : 'bg-emerald-950/50 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/50'
            }`}
          >
            {isRunning ? 'Stop' : 'Start'}
          </button>

          <button
            onClick={resetSimulation}
            className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-zinc-700/50 transition-all"
          >
            Reset
          </button>

          <div className="w-px h-4 bg-zinc-700 mx-1" />

          {/* Quick attack buttons */}
          <button
            onClick={() => injectAttack({ type: 'FDI', targetBus: 'BUS-003', intensity: 0.7 })}
            disabled={!isRunning}
            className="px-2 py-1 rounded text-xs font-bold uppercase border bg-red-950/30 text-red-400 border-red-900/30 hover:bg-red-900/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            FDI
          </button>
          <button
            onClick={() => injectAttack({ type: 'COMMAND_SPOOF', targetBus: 'BUS-003', intensity: 0.8 })}
            disabled={!isRunning}
            className="px-2 py-1 rounded text-xs font-bold uppercase border bg-orange-950/30 text-orange-400 border-orange-900/30 hover:bg-orange-900/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Spoof
          </button>
          <button
            onClick={() => injectAttack({ type: 'MADIOT', targetBus: 'BUS-003', intensity: 0.6 })}
            disabled={!isRunning}
            className="px-2 py-1 rounded text-xs font-bold uppercase border bg-purple-950/30 text-purple-400 border-purple-900/30 hover:bg-purple-900/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            MaDIoT
          </button>

          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <Link
            href="/"
            className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-blue-950/50 text-blue-400 border-blue-800/50 hover:bg-blue-900/50 transition-all"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* 3D Canvas — fills remaining space */}
      <div className="flex-1 min-h-0 w-full">
        <Grid3DVisualization
          latestTelemetry={latestTelemetry}
          alerts={alerts}
          shield={shield}
        />
      </div>
    </div>
  );
}
