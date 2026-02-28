'use client';

import React from 'react';
import CommandCenter from '@/components/dashboard/CommandCenter';
import AttackControlPanel from '@/components/operator/AttackControlPanel';
import HealingTimeline from '@/components/dashboard/HealingTimeline';
import { usePollingGridData } from '@/hooks/usePollingGridData';

export default function Home() {
  const {
    telemetryHistory,
    systemState,
    alerts,
    simulationState,
    shield,
    connected,
    error,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
  } = usePollingGridData();

  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Connection indicator */}
      <div className={`fixed top-2 right-2 z-50 flex items-center gap-2 sm:gap-3 rounded-full px-2 sm:px-3 py-1 text-xs font-mono`}>
        <a href="/operator" className="text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-wider text-[10px] hidden sm:inline">
          Operator ↗
        </a>
        <div className={`flex items-center gap-2 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 right-4 z-50 lg:hidden w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-lg font-bold"
        aria-label="Toggle controls"
      >
        {sidebarOpen ? '✕' : '⚡'}
      </button>

      {/* Error banner */}
      {error && !connected && (
        <div className="fixed top-10 right-2 z-50 bg-red-900/80 border border-red-700 rounded px-3 py-1.5 text-[10px] font-mono text-red-400 max-w-[90vw]">
          ⚠ {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row">
        {/* Main dashboard */}
        <div className="flex-1 min-w-0">
          <CommandCenter
            systemState={systemState}
            alerts={alerts}
            telemetryHistory={telemetryHistory}
            alertCount={alerts.filter(a => a.status === 'ACTIVE').length}
            shield={shield}
            simulationRunning={simulationState?.running ?? false}
          />
        </div>

        {/* Operator panel (sidebar) — hidden on mobile, toggleable */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <div className={`
          fixed right-0 top-0 h-full z-40 w-80 border-l border-slate-800 bg-slate-950 p-4 overflow-y-auto space-y-4
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          lg:static lg:translate-x-0 lg:max-h-screen
        `}>
          <AttackControlPanel
            onAttack={injectAttack}
            onStart={startSimulation}
            onStop={stopSimulation}
            onReset={resetSimulation}
            simulationState={simulationState}
          />
          <HealingTimeline
            activeEvents={shield?.activeEvents || []}
            completedEvents={shield?.completedEvents || []}
          />
        </div>
      </div>
    </div>
  );
}
