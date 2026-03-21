'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GridTelemetry, ThreatAlert, BusType, LineFlow } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';

// ─── Constants ─────────────────────────────────────────────────

const BUS_META: Record<string, { name: string; type: BusType }> = {
  'BUS-001': { name: 'Indrapura', type: 'SLACK' },
  'BUS-002': { name: 'Vajra Solar', type: 'PV_GEN' },
  'BUS-003': { name: 'Shakti Nagar', type: 'PQ_LOAD' },
  'BUS-004': { name: 'Kavach Grid', type: 'PQ_LOAD' },
  'BUS-005': { name: 'Sudarshan Hub', type: 'PQ_LOAD' },
};

const TYPE_ICONS: Record<BusType, string> = {
  SLACK: '⚡',
  PV_GEN: '☀️',
  PQ_LOAD: '🏭',
};

const TYPE_LABELS: Record<BusType, string> = {
  SLACK: 'GENERATOR',
  PV_GEN: 'SOLAR',
  PQ_LOAD: 'LOAD',
};

const TYPE_BADGE_CLASSES: Record<BusType, string> = {
  PQ_LOAD: 'bg-blue-950 text-blue-400 border border-blue-800/50',
  SLACK: 'bg-amber-950 text-amber-400 border border-amber-800/50',
  PV_GEN: 'bg-emerald-950 text-emerald-400 border border-emerald-800/50',
};

// ─── Types ─────────────────────────────────────────────────────

interface BusNodeData {
  id: string;
  name: string;
  type: BusType;
  telemetry?: GridTelemetry;
  alertSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  healingPhase?: string;
  isIsolated?: boolean;
  [key: string]: unknown;
}

// ─── Helper: get bus overall status ────────────────────────────

function getBusStatus(
  busId: string,
  alerts: ThreatAlert[],
  shield?: ShieldData | null,
): { label: string; color: string; dotColor: string } {
  const isIsolated = shield?.isolatedBuses?.includes(busId);
  const healingEvent = shield?.activeEvents?.find((e) => e.affectedBus === busId);
  const active = alerts.filter((a) => a.affectedAssets.includes(busId) && a.status === 'ACTIVE');
  const hasCritical = active.some((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');

  if (isIsolated) return { label: 'ISOLATED', color: 'text-orange-400', dotColor: 'bg-orange-500' };
  if (healingEvent) return { label: 'HEALING', color: 'text-cyan-400', dotColor: 'bg-cyan-400' };
  if (hasCritical) return { label: 'UNDER ATTACK', color: 'text-red-400', dotColor: 'bg-red-500' };
  if (active.length > 0) return { label: 'WARNING', color: 'text-amber-400', dotColor: 'bg-amber-500' };
  return { label: 'NOMINAL', color: 'text-emerald-400', dotColor: 'bg-emerald-500' };
}

// ─── Enhanced BusNode Component ────────────────────────────────

const BusNode = ({ data, selected }: { data: BusNodeData; selected?: boolean }) => {
  const { id, name, type, telemetry, alertSeverity, healingPhase, isIsolated } = data;

  const voltage = telemetry?.voltage ?? 0;
  const frequency = telemetry?.frequency ?? 0;
  const activePower = telemetry?.activePower ?? 0;
  const breakerStatus = telemetry?.breakerStatus ?? 'CLOSED';

  let voltageColor = 'text-emerald-400';
  if (isIsolated) {
    voltageColor = 'text-slate-600';
  } else if (voltage > 0) {
    if (voltage < 210 || voltage > 250) voltageColor = 'text-red-400';
    else if (voltage < 218 || voltage > 242) voltageColor = 'text-amber-400';
  } else {
    voltageColor = 'text-slate-500';
  }

  const statusClasses = useMemo(() => {
    if (healingPhase === 'RESTORED')
      return 'border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.6)] animate-shield-healed';
    if (healingPhase === 'ISOLATING' || healingPhase === 'REROUTING')
      return 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.5)]';
    if (healingPhase === 'MONITORING' || healingPhase === 'RESTORING')
      return 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]';
    if (isIsolated)
      return 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)] opacity-60';
    if (alertSeverity === 'CRITICAL')
      return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-node-attack';
    if (alertSeverity === 'HIGH')
      return 'border-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.5)]';
    if (alertSeverity === 'MEDIUM')
      return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
    return 'border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]';
  }, [alertSeverity, healingPhase, isIsolated]);

  const selectedClasses = selected
    ? 'ring-2 ring-blue-500/60 shadow-[0_0_30px_rgba(59,130,246,0.25)] !border-blue-500/60'
    : '';

  const isHealing =
    healingPhase === 'ISOLATING' || healingPhase === 'REROUTING' || healingPhase === 'MONITORING' || healingPhase === 'RESTORING';

  const powerDirection = activePower > 0.5 ? '↑' : activePower < -0.5 ? '↓' : '→';

  return (
    <div className="relative">
      {/* Healing cyan ring overlay */}
      {isHealing && (
        <div className="absolute -inset-1.5 rounded-xl border-2 border-cyan-400/40 animate-healing-ring pointer-events-none" />
      )}
      {/* Attack pulsing ring overlay */}
      {alertSeverity === 'CRITICAL' && !isHealing && (
        <div className="absolute -inset-1.5 rounded-xl border-2 border-red-500/30 animate-pulse pointer-events-none" />
      )}
      <div
        className={`bg-slate-900 border-2 rounded-lg p-3 min-w-[180px] text-slate-100 bus-node-interactive ${statusClasses} ${selectedClasses}`}
      >
        {/* Handles */}
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
        <Handle type="source" position={Position.Left} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
        <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />

        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-lg leading-none" role="img" aria-label={TYPE_LABELS[type]}>
              {TYPE_ICONS[type]}
            </span>
            <div>
              <div className="text-[10px] font-bold text-slate-500 leading-none uppercase tracking-tighter">{id}</div>
              <div className="font-bold text-sm truncate max-w-[100px]">{name}</div>
            </div>
          </div>
          <div className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${TYPE_BADGE_CLASSES[type]}`}>
            {TYPE_LABELS[type]}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Voltage</span>
            <span className={`font-mono font-bold ${voltageColor}`}>{voltage.toFixed(1)} kV</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Frequency</span>
            <span className="text-slate-200 font-mono">{frequency.toFixed(2)} Hz</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Power</span>
            <span className="text-slate-200 font-mono">
              <span className={activePower > 0.5 ? 'text-emerald-400' : activePower < -0.5 ? 'text-blue-400' : 'text-slate-400'}>
                {powerDirection}
              </span>{' '}
              {Math.abs(activePower).toFixed(1)} MW
            </span>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-800/50 flex items-center justify-between">
          <div className="text-[9px] text-slate-500 uppercase font-bold">Status</div>
          <div className="flex items-center gap-1.5">
            {healingPhase && healingPhase !== 'RESTORED' ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
                <span className="text-[10px] font-bold text-cyan-400">SHIELD</span>
              </>
            ) : (
              <>
                <div
                  className={`w-1.5 h-1.5 rounded-full ${breakerStatus === 'CLOSED' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}
                />
                <span className={`text-[10px] font-bold ${breakerStatus === 'CLOSED' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {breakerStatus}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Bus Detail Panel ──────────────────────────────────────────

function DeviationBar({ value, nominal, warnPct = 5, critPct = 10 }: {
  value: number; nominal: number; warnPct?: number; critPct?: number;
}){
  const pct = nominal > 0 ? ((value - nominal) / nominal) * 100 : 0;
  const absPct = Math.abs(pct);
  const barColor = absPct > critPct ? 'bg-red-500' : absPct > warnPct ? 'bg-amber-500' : 'bg-emerald-500';
  const barWidth = Math.min(100, absPct * 5);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
          <div
            className={`absolute top-0 bottom-0 ${barColor} rounded-full transition-all duration-500`}
            style={{
              left: pct >= 0 ? '50%' : `${50 - barWidth / 2}%`,
              width: `${barWidth / 2}%`,
            }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500 w-12 text-right">
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function MeasurementCard({ label, value, unit, children }: {
  label: string; value: string; unit: string; children?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/30">
      <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-mono font-bold text-slate-100">{value}</span>
        <span className="text-[10px] text-slate-500">{unit}</span>
      </div>
      {children}
    </div>
  );
}

function BusDetailPanel({
  busId,
  latestTelemetry,
  alerts,
  shield,
  onClose,
}: {
  busId: string;
  latestTelemetry: GridTelemetry[];
  alerts: ThreatAlert[];
  shield?: ShieldData | null;
  onClose: () => void;
}) {
  const meta = BUS_META[busId];
  const telemetry = latestTelemetry.find((t) => t.busId === busId);
  const busAlerts = alerts.filter((a) => a.affectedAssets.includes(busId) && a.status === 'ACTIVE');
  const healingEvents = shield?.activeEvents?.filter((e) => e.affectedBus === busId) || [];
  const status = getBusStatus(busId, alerts, shield);

  // Refresh "X s ago" timestamps without calling Date.now() during render
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!meta) return null;

  const v = telemetry?.voltage ?? 0;
  const f = telemetry?.frequency ?? 0;
  const ap = telemetry?.activePower ?? 0;
  const rp = telemetry?.reactivePower ?? 0;
  const cur = telemetry?.current ?? 0;
  const pf = telemetry?.powerFactor ?? 0;
  const pa = telemetry?.phaseAngle ?? 0;
  const tt = telemetry?.transformerTemp ?? 0;
  const bs = telemetry?.breakerStatus ?? 'CLOSED';
  const dq = telemetry?.dataQuality ?? 'GOOD';
  const ds = telemetry?.source ?? 'PMU';
  const mc = telemetry?.meterCount ?? 0;
  const mcon = telemetry?.meterConsumption ?? 0;

  const tempColor = tt > 80 ? 'text-red-400' : tt > 65 ? 'text-amber-400' : 'text-emerald-400';
  const tempBg = tt > 80 ? 'bg-red-500' : tt > 65 ? 'bg-amber-500' : 'bg-emerald-500';

  const breakerColor = bs === 'CLOSED' ? 'text-emerald-400' : bs === 'TRIP' ? 'text-red-400 animate-pulse' : 'text-amber-400';
  const dqColor = dq === 'GOOD' ? 'text-emerald-400' : dq === 'SUSPECT' ? 'text-amber-400' : 'text-red-400';

  const sevColors: Record<string, string> = {
    CRITICAL: 'bg-red-900/60 text-red-400 border-red-800/50',
    HIGH: 'bg-orange-900/60 text-orange-400 border-orange-800/50',
    MEDIUM: 'bg-amber-900/60 text-amber-400 border-amber-800/50',
    LOW: 'bg-blue-900/60 text-blue-400 border-blue-800/50',
  };

  return (
    <div
      className="absolute top-0 right-0 bottom-0 w-[370px] z-30 bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 overflow-y-auto custom-scrollbar animate-slide-in-right"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50"
      >
        ✕
      </button>

      <div className="p-4 space-y-4">
        {/* Header */}
        <div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{busId}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">{TYPE_ICONS[meta.type]}</span>
            <div>
              <h2 className="text-lg font-black text-slate-100 tracking-tight">{meta.name}</h2>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${TYPE_BADGE_CLASSES[meta.type]}`}>
                {TYPE_LABELS[meta.type]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2.5 h-2.5 rounded-full ${status.dotColor} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
            <span className={`text-sm font-black uppercase tracking-wider ${status.color}`}>{status.label}</span>
          </div>
        </div>

        {/* Electrical Measurements */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <div className="w-1 h-3 bg-blue-600 rounded-full" />
            Electrical Measurements
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MeasurementCard label="Voltage" value={v.toFixed(1)} unit="kV">
              <DeviationBar value={v} nominal={230} />
            </MeasurementCard>
            <MeasurementCard label="Frequency" value={f.toFixed(3)} unit="Hz">
              <DeviationBar value={f} nominal={50} warnPct={0.1} critPct={0.5} />
            </MeasurementCard>
            <MeasurementCard label="Active Power" value={Math.abs(ap).toFixed(1)} unit="MW">
              <div className="mt-1 flex items-center gap-1">
                <span className={`text-xs font-bold ${ap > 0.5 ? 'text-emerald-400' : ap < -0.5 ? 'text-blue-400' : 'text-slate-500'}`}>
                  {ap > 0.5 ? '↑ Generating' : ap < -0.5 ? '↓ Consuming' : '→ Balanced'}
                </span>
              </div>
            </MeasurementCard>
            <MeasurementCard label="Reactive Power" value={rp.toFixed(1)} unit="MVAR" />
            <MeasurementCard label="Current" value={cur.toFixed(1)} unit="A" />
            <MeasurementCard label="Power Factor" value={pf.toFixed(3)} unit="">
              <div className="mt-1 flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${i < Math.round(pf * 5) ? (pf > 0.9 ? 'bg-emerald-500' : pf > 0.7 ? 'bg-amber-500' : 'bg-red-500') : 'bg-slate-700'}`}
                  />
                ))}
              </div>
            </MeasurementCard>
          </div>
          <div className="mt-2">
            <MeasurementCard label="Phase Angle" value={pa.toFixed(1)} unit="°" />
          </div>
        </div>

        {/* Equipment Status */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <div className="w-1 h-3 bg-amber-600 rounded-full" />
            Equipment Status
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/30">
              <span className="text-xs text-slate-400">Transformer Temp</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${tempBg}`} />
                <span className={`text-xs font-mono font-bold ${tempColor}`}>{tt.toFixed(1)} °C</span>
              </div>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/30">
              <span className="text-xs text-slate-400">Breaker Status</span>
              <span className={`text-xs font-mono font-bold ${breakerColor}`}>{bs}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/30">
              <span className="text-xs text-slate-400">Data Quality</span>
              <span className={`text-xs font-mono font-bold ${dqColor}`}>{dq}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/30">
              <span className="text-xs text-slate-400">Data Source</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-950 text-indigo-400 border border-indigo-800/50">
                {ds}
              </span>
            </div>
          </div>
        </div>

        {/* Smart Meters */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <div className="w-1 h-3 bg-emerald-600 rounded-full" />
            Smart Meters
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MeasurementCard label="Meter Count" value={mc.toLocaleString()} unit="" />
            <MeasurementCard label="Consumption" value={mcon.toFixed(1)} unit="MWh" />
          </div>
        </div>

        {/* Active Alerts */}
        {busAlerts.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <div className="w-1 h-3 bg-red-600 rounded-full" />
              Active Alerts ({busAlerts.length})
            </div>
            <div className="space-y-1.5">
              {busAlerts.map((a) => (
                <div key={a.id} className={`rounded-lg px-3 py-2 border text-xs ${sevColors[a.severity] ?? sevColors.LOW}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-[9px] uppercase tracking-wider">{a.severity}</span>
                    <span className="text-[9px] text-slate-500">
                      {Math.round((now - new Date(a.timestamp).getTime()) / 1000)}s ago
                    </span>
                  </div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{a.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shield Events */}
        {healingEvents.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <div className="w-1 h-3 bg-cyan-600 rounded-full" />
              Shield Events ({healingEvents.length})
            </div>
            <div className="space-y-1.5">
              {healingEvents.map((evt) => {
                const lastAction = evt.actions[evt.actions.length - 1];
                return (
                  <div key={evt.id} className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="font-bold text-cyan-400 uppercase tracking-wider">{evt.phase}</span>
                      <span className="text-[9px] text-slate-500 ml-auto">
                        {(evt.totalDurationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    {lastAction && (
                      <div className="text-cyan-300/70 text-[10px]">{lastAction.action}</div>
                    )}
                    {evt.isolatedLines.length > 0 && (
                      <div className="text-[9px] text-slate-500 mt-1">
                        Isolated: {evt.isolatedLines.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edge Detail Panel ─────────────────────────────────────────

function EdgeDetailPanel({
  edgeId,
  edge,
  lineFlowMap,
  shield,
  onClose,
}: {
  edgeId: string;
  edge: Edge;
  lineFlowMap: Map<string, LineFlow>;
  shield?: ShieldData | null;
  onClose: () => void;
}) {
  const fromMeta = BUS_META[edge.source];
  const toMeta = BUS_META[edge.target];
  const flow = lineFlowMap.get(edgeId);
  const isTripped = shield?.trippedBreakers?.includes(edgeId);
  const isRerouted = shield?.reroutedLines?.includes(edgeId);

  const statusLabel = isTripped ? 'TRIPPED' : isRerouted ? 'REROUTED' : 'NORMAL';
  const statusColor = isTripped ? 'text-orange-400' : isRerouted ? 'text-cyan-400' : 'text-emerald-400';
  const statusDot = isTripped ? 'bg-orange-500' : isRerouted ? 'bg-cyan-400' : 'bg-emerald-500';

  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-[320px] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl animate-fade-scale-in"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/50 text-xs"
      >
        ✕
      </button>

      <div className="p-4 space-y-3">
        <div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{edgeId}</div>
          <div className="text-sm font-bold text-slate-100 mt-1">Transmission Line</div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="bg-slate-800/80 rounded-lg px-2.5 py-1.5 border border-slate-700/30 flex-1 text-center">
            <div className="text-[9px] text-slate-500 uppercase">From</div>
            <div className="font-bold text-slate-200">{fromMeta?.name ?? edge.source}</div>
          </div>
          <div className="text-slate-600 font-bold">→</div>
          <div className="bg-slate-800/80 rounded-lg px-2.5 py-1.5 border border-slate-700/30 flex-1 text-center">
            <div className="text-[9px] text-slate-500 uppercase">To</div>
            <div className="font-bold text-slate-200">{toMeta?.name ?? edge.target}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusDot} ${isTripped ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>{statusLabel}</span>
          {isTripped && (
            <span className="text-[9px] text-slate-500 ml-auto">Breaker: {edgeId}</span>
          )}
        </div>

        {flow && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/30">
              <div className="text-[9px] text-slate-500 uppercase font-bold">Power Flow</div>
              <div className="text-sm font-mono font-bold text-slate-100">{flow.activePowerFlow.toFixed(1)} <span className="text-[10px] text-slate-500">MW</span></div>
            </div>
            <div className="bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/30">
              <div className="text-[9px] text-slate-500 uppercase font-bold">Current</div>
              <div className="text-sm font-mono font-bold text-slate-100">{flow.current.toFixed(1)} <span className="text-[10px] text-slate-500">A</span></div>
            </div>
            <div className="bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/30">
              <div className="text-[9px] text-slate-500 uppercase font-bold">Loading</div>
              <div className="text-sm font-mono font-bold text-slate-100">{flow.loadingPercent.toFixed(0)}<span className="text-[10px] text-slate-500">%</span></div>
              <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${flow.loadingPercent > 80 ? 'bg-red-500' : flow.loadingPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, flow.loadingPercent)}%` }}
                />
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/30">
              <div className="text-[9px] text-slate-500 uppercase font-bold">Losses</div>
              <div className="text-sm font-mono font-bold text-slate-100">{flow.losses.toFixed(2)} <span className="text-[10px] text-slate-500">MW</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── React Flow Setup ──────────────────────────────────────────

const nodeTypes = {
  busNode: BusNode,
};

const initialNodes: Node[] = [
  { id: 'BUS-001', type: 'busNode', position: { x: 400, y: 50 }, data: { id: 'BUS-001', name: 'Indrapura', type: 'SLACK' } },
  { id: 'BUS-002', type: 'busNode', position: { x: 100, y: 200 }, data: { id: 'BUS-002', name: 'Vajra Solar', type: 'PV_GEN' } },
  { id: 'BUS-003', type: 'busNode', position: { x: 700, y: 200 }, data: { id: 'BUS-003', name: 'Shakti Nagar', type: 'PQ_LOAD' } },
  { id: 'BUS-004', type: 'busNode', position: { x: 200, y: 420 }, data: { id: 'BUS-004', name: 'Kavach Grid', type: 'PQ_LOAD' } },
  { id: 'BUS-005', type: 'busNode', position: { x: 600, y: 420 }, data: { id: 'BUS-005', name: 'Sudarshan Hub', type: 'PQ_LOAD' } },
];

const initialEdges: Edge[] = [
  { id: 'TL-01', source: 'BUS-001', target: 'BUS-003', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
  { id: 'TL-02', source: 'BUS-001', target: 'BUS-002', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
  { id: 'TL-03', source: 'BUS-002', target: 'BUS-004', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
  { id: 'TL-04', source: 'BUS-003', target: 'BUS-005', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
  { id: 'TL-05', source: 'BUS-004', target: 'BUS-005', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
  { id: 'TL-06', source: 'BUS-002', target: 'BUS-003', animated: true, style: { strokeDasharray: '5 5', stroke: '#10b981', strokeWidth: 2 } },
];

// ─── Main Component ────────────────────────────────────────────

export default function GridTopologyMap({
  latestTelemetry,
  alerts,
  shield,
}: {
  latestTelemetry: GridTelemetry[];
  alerts: ThreatAlert[];
  shield?: ShieldData | null;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Build a map of lineId → LineFlow from all telemetry
  const lineFlowMap = useMemo(() => {
    const map = new Map<string, LineFlow>();
    for (const t of latestTelemetry) {
      for (const lf of t.lineFlows) {
        map.set(lf.lineId, lf);
      }
    }
    return map;
  }, [latestTelemetry]);

  // Click handlers
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedBusId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedBusId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedBusId(null);
    setSelectedEdgeId(null);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedBusId(null);
    setSelectedEdgeId(null);
  }, []);

  // Update nodes and edges based on telemetry, alerts, and shield state
  useEffect(() => {
    const isolatedBuses = new Set(shield?.isolatedBuses || []);
    const activeHealingMap = new Map<string, string>();
    for (const evt of shield?.activeEvents || []) {
      activeHealingMap.set(evt.affectedBus, evt.phase);
    }
    for (const evt of (shield?.completedEvents || []).slice(0, 3)) {
      const elapsed = Date.now() - new Date(evt.lastUpdate).getTime();
      if (elapsed < 5000 && !activeHealingMap.has(evt.affectedBus)) {
        activeHealingMap.set(evt.affectedBus, 'RESTORED');
      }
    }

    setNodes((nds) =>
      nds.map((node) => {
        const telemetry = latestTelemetry.find((t) => t.busId === node.id);
        const activeAlerts = alerts.filter(
          (a) => a.affectedAssets.includes(node.id) && a.status === 'ACTIVE',
        );

        let highestSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
        if (activeAlerts.some((a) => a.severity === 'CRITICAL')) highestSeverity = 'CRITICAL';
        else if (activeAlerts.some((a) => a.severity === 'HIGH')) highestSeverity = 'HIGH';
        else if (activeAlerts.some((a) => a.severity === 'MEDIUM')) highestSeverity = 'MEDIUM';
        else if (activeAlerts.length > 0) highestSeverity = 'LOW';

        return {
          ...node,
          data: {
            ...node.data,
            telemetry,
            alertSeverity: highestSeverity,
            healingPhase: activeHealingMap.get(node.id),
            isIsolated: isolatedBuses.has(node.id),
          },
        };
      }),
    );

    // Update edges with status, labels, and dynamic stroke width
    const trippedBreakers = new Set(shield?.trippedBreakers || []);
    const reroutedLines = new Set(shield?.reroutedLines || []);

    setEdges((eds) =>
      eds.map((edge) => {
        const isTripped = trippedBreakers.has(edge.id);
        const isRerouted = reroutedLines.has(edge.id);
        const isAffected =
          !isTripped &&
          !isRerouted &&
          alerts.some(
            (a) =>
              a.status === 'ACTIVE' &&
              (a.affectedAssets.includes(edge.source) || a.affectedAssets.includes(edge.target)),
          );

        let stroke = '#10b981';
        let strokeWidth = 2;
        let animated = true;
        let strokeDasharray = '5 5';

        // Compute flow-based thickness
        const flow = lineFlowMap.get(edge.id);
        const flowMW = flow ? Math.abs(flow.activePowerFlow) : 0;
        const flowBasedWidth = Math.max(2, Math.min(6, flowMW / 15));

        if (isTripped) {
          stroke = '#f97316';
          strokeWidth = 3;
          animated = false;
          strokeDasharray = '3 8';
        } else if (isRerouted) {
          stroke = '#06b6d4';
          strokeWidth = Math.max(4, flowBasedWidth);
          animated = true;
          strokeDasharray = '2 2';
        } else if (isAffected) {
          stroke = '#ef4444';
          strokeWidth = flowBasedWidth;
        } else {
          strokeWidth = flowBasedWidth;
        }

        // Edge label showing power flow
        const label = flowMW > 0 ? `${flowMW.toFixed(1)} MW` : '';

        return {
          ...edge,
          style: { stroke, strokeWidth, strokeDasharray },
          animated,
          label,
          labelStyle: { fill: '#94a3b8', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' },
          labelBgStyle: { fill: '#0f172a', stroke: '#334155', strokeWidth: 0.5, opacity: 0.9 },
          labelBgPadding: [3, 6] as [number, number],
          labelBgBorderRadius: 4,
          labelShowBg: true,
          interactionWidth: 20,
        };
      }),
    );
  }, [latestTelemetry, alerts, shield, lineFlowMap, setNodes, setEdges]);

  // Find the selected edge object for the detail panel
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;

  return (
    <div
      data-testid="grid-topology"
      className="w-full h-full min-h-[300px] sm:min-h-[550px] bg-slate-950/20 rounded-xl overflow-hidden border border-slate-800/50 relative"
    >
      {/* Status Legend */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10">
        <div className="flex items-center gap-2 sm:gap-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] uppercase font-bold tracking-wider flex-wrap">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            Nominal
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
            Warning
          </div>
          <div className="flex items-center gap-1.5 text-red-400">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
            Critical
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400">
            <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]" />
            Shield
          </div>
          <div className="flex items-center gap-1.5 text-orange-400">
            <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.5)]" />
            Isolated
          </div>
        </div>
      </div>

      {/* Interaction hint */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10">
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-700/30 px-2 py-1 rounded text-[9px] text-slate-500 uppercase tracking-wider font-mono">
          Click node to inspect
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        className="bg-transparent"
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="#1e293b" gap={25} size={1} />
        <Controls showInteractive={false} className="!bg-slate-900 !border-slate-700 !fill-slate-400" />
      </ReactFlow>

      {/* Bus Detail Panel */}
      {selectedBusId && (
        <BusDetailPanel
          busId={selectedBusId}
          latestTelemetry={latestTelemetry}
          alerts={alerts}
          shield={shield}
          onClose={closePanel}
        />
      )}

      {/* Edge Detail Panel */}
      {selectedEdge && selectedEdgeId && (
        <EdgeDetailPanel
          edgeId={selectedEdgeId}
          edge={selectedEdge}
          lineFlowMap={lineFlowMap}
          shield={shield}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
