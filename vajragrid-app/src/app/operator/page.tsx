'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import AttackControlPanel from '@/components/operator/AttackControlPanel';
import HealingTimeline from '@/components/dashboard/HealingTimeline';
import { usePollingGridData } from '@/hooks/usePollingGridData';
import type { AttackType } from '@/lib/types';

const DEMO_SEQUENCE: { type: AttackType; targetBus: string; intensity: number; delay: number; label: string }[] = [
  { type: 'FDI', targetBus: 'BUS-003', intensity: 0.8, delay: 0, label: 'False Data Injection on Shakti Nagar' },
  { type: 'COMMAND_SPOOF', targetBus: 'BUS-003', intensity: 0.9, delay: 15000, label: 'Breaker Command Spoofing (Ukraine 2015)' },
  { type: 'SENSOR_TAMPER', targetBus: 'BUS-004', intensity: 0.6, delay: 30000, label: 'Slow Sensor Drift on Kavach Grid' },
  { type: 'MADIOT', targetBus: 'BUS-005', intensity: 0.7, delay: 45000, label: 'MaDIoT Botnet Load Manipulation' },
  { type: 'METER_ATTACK', targetBus: 'BUS-002', intensity: 0.8, delay: 60000, label: 'Smart Meter Compromise on Vajra Solar' },
];

export default function OperatorPage() {
  const {
    telemetryHistory,
    systemState,
    alerts,
    simulationState,
    shield,
    connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
  } = usePollingGridData();

  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(-1);
  const [demoLog, setDemoLog] = useState<string[]>([]);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const startDemo = useCallback(async () => {
    setDemoRunning(true);
    setDemoStep(0);
    setDemoLog(['[DEMO] Starting automated attack sequence...']);

    // Ensure simulation is running
    await startSimulation();
    setDemoLog(prev => [...prev, '[DEMO] Simulation started. Waiting for baseline...']);

    // Wait 5s for baseline data, then start attacks
    const baselineTimer = setTimeout(() => {
      DEMO_SEQUENCE.forEach((attack, idx) => {
        const timer = setTimeout(() => {
          injectAttack({ type: attack.type, targetBus: attack.targetBus, intensity: attack.intensity });
          setDemoStep(idx);
          setDemoLog(prev => [...prev, `[ATTACK ${idx + 1}/${DEMO_SEQUENCE.length}] ${attack.label} — Intensity ${(attack.intensity * 100).toFixed(0)}%`]);
        }, attack.delay);
        timersRef.current.push(timer);
      });

      // End demo after all attacks
      const endTimer = setTimeout(() => {
        setDemoLog(prev => [...prev, '[DEMO] All attacks injected. Observe detection results.']);
        setDemoRunning(false);
      }, DEMO_SEQUENCE[DEMO_SEQUENCE.length - 1].delay + 5000);
      timersRef.current.push(endTimer);
    }, 5000);
    timersRef.current.push(baselineTimer);
  }, [startSimulation, injectAttack]);

  const stopDemo = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setDemoRunning(false);
    setDemoStep(-1);
    setDemoLog(prev => [...prev, '[DEMO] Stopped by operator.']);
  }, []);

  const latestTelemetry = Array.from(telemetryHistory.values())
    .map(history => history[history.length - 1])
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-blue-600 rounded-sm transform rotate-45" />
          <h1 className="text-lg font-black tracking-tight uppercase">
            VajraGrid <span className="text-blue-500 font-normal text-sm">Operator Console</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider">
            ← Dashboard
          </a>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono ${
            connected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </div>
        </div>
      </header>

      <div className="flex p-6 gap-6">
        {/* Left: Attack Controls */}
        <div className="w-96 flex flex-col gap-6">
          <AttackControlPanel
            onAttack={injectAttack}
            onStart={startSimulation}
            onStop={stopSimulation}
            onReset={() => { resetSimulation(); setDemoLog([]); setDemoStep(-1); }}
            simulationState={simulationState}
          />

          {/* Demo Mode */}
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Demo Mode
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Automated 5-attack sequence with 15s intervals. For hackathon presentation.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={startDemo}
                  disabled={demoRunning}
                  className={`flex-1 px-4 py-2.5 rounded text-xs font-bold border transition-all ${
                    demoRunning
                      ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                      : 'bg-purple-600/20 text-purple-400 border-purple-500/50 hover:bg-purple-600/30'
                  }`}
                >
                  ▶ START DEMO
                </button>
                <button
                  onClick={stopDemo}
                  disabled={!demoRunning}
                  className={`px-4 py-2.5 rounded text-xs font-bold border transition-all ${
                    !demoRunning
                      ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                      : 'bg-red-600/20 text-red-400 border-red-500/50 hover:bg-red-600/30'
                  }`}
                >
                  ■ STOP
                </button>
              </div>

              {/* Demo progress */}
              {demoStep >= 0 && (
                <div className="flex gap-1">
                  {DEMO_SEQUENCE.map((_, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                        idx <= demoStep ? 'bg-purple-500' : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Live Bus Telemetry */}
        <div className="flex-1 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Live Bus Telemetry</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {latestTelemetry.map(t => {
              const isAttacked = simulationState?.activeAttacks.some(a => a.targetBus === t.busId);
              return (
                <div key={t.busId} className={`p-4 bg-slate-900 border rounded-lg transition-all ${
                  isAttacked ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-slate-700'
                }`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-[10px] font-bold text-slate-500">{t.busId}</div>
                      <div className="font-bold text-sm">{t.busId === 'BUS-001' ? 'Indrapura' : t.busId === 'BUS-002' ? 'Vajra Solar' : t.busId === 'BUS-003' ? 'Shakti Nagar' : t.busId === 'BUS-004' ? 'Kavach Grid' : 'Sudarshan Hub'}</div>
                    </div>
                    {isAttacked && (
                      <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded text-[9px] font-bold animate-pulse">
                        UNDER ATTACK
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Voltage</span>
                      <span className={`font-mono font-bold ${t.voltage < 218 || t.voltage > 242 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {t.voltage.toFixed(1)} kV
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Frequency</span>
                      <span className="font-mono text-slate-200">{t.frequency.toFixed(3)} Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Active Power</span>
                      <span className="font-mono text-slate-200">{t.activePower.toFixed(1)} MW</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Breaker</span>
                      <span className={`font-mono font-bold ${t.breakerStatus === 'CLOSED' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.breakerStatus}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Demo Log */}
          {demoLog.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Demo Event Log</h2>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-60 overflow-y-auto custom-scrollbar font-mono text-[11px]">
                {demoLog.map((line, i) => (
                  <div key={i} className={`py-0.5 ${line.includes('ATTACK') ? 'text-red-400' : line.includes('DEMO') ? 'text-purple-400' : 'text-slate-500'}`}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Attacks */}
          {(simulationState?.activeAttacks.length ?? 0) > 0 && (
            <div className="mt-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Active Attack Vectors</h2>
              <div className="flex flex-wrap gap-2">
                {simulationState?.activeAttacks.map((a, i) => (
                  <span key={i} className="px-2 py-1 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold text-red-400">
                    {a.type} → {a.targetBus || 'ALL'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* VajraShield Self-Healing Timeline */}
          <div className="mt-4">
            <HealingTimeline
              activeEvents={shield?.activeEvents || []}
              completedEvents={shield?.completedEvents || []}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
