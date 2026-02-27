'use client';

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

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Connection indicator */}
      <div className={`fixed top-2 right-2 z-50 flex items-center gap-3 rounded-full px-3 py-1 text-xs font-mono`}>
        <a href="/operator" className="text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-wider text-[10px]">
          Operator ↗
        </a>
        <div className={`flex items-center gap-2 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* Error banner */}
      {error && !connected && (
        <div className="fixed top-10 right-2 z-50 bg-red-900/80 border border-red-700 rounded px-3 py-1.5 text-[10px] font-mono text-red-400">
          ⚠ {error}
        </div>
      )}

      <div className="flex">
        {/* Main dashboard */}
        <div className="flex-1">
          <CommandCenter
            systemState={systemState}
            alerts={alerts}
            telemetryHistory={telemetryHistory}
            alertCount={alerts.filter(a => a.status === 'ACTIVE').length}
            shield={shield}
            simulationRunning={simulationState?.running ?? false}
          />
        </div>

        {/* Operator panel (sidebar) */}
        <div className="w-80 border-l border-slate-800 bg-slate-950 p-4 overflow-y-auto max-h-screen space-y-4">
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
