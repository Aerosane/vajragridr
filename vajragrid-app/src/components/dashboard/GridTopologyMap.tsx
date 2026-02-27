'use client';

import React, { useMemo, useEffect } from 'react';
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

import { GridTelemetry, ThreatAlert, BusType } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';

interface BusNodeData {
  id: string;
  name: string;
  type: BusType;
  telemetry?: GridTelemetry;
  alertSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  healingPhase?: string;
  isIsolated?: boolean;
}

const BusNode = ({ data }: { data: BusNodeData }) => {
  const { id, name, type, telemetry, alertSeverity, healingPhase, isIsolated } = data;
  
  const voltage = telemetry?.voltage ?? 0;
  const frequency = telemetry?.frequency ?? 0;
  const activePower = telemetry?.activePower ?? 0;
  const breakerStatus = telemetry?.breakerStatus ?? 'CLOSED';

  // Voltage color logic: green if normal 218-242, amber if warning, red if critical
  let voltageColor = 'text-emerald-400';
  if (isIsolated) {
    voltageColor = 'text-slate-600';
  } else if (voltage > 0) {
    if (voltage < 210 || voltage > 250) {
      voltageColor = 'text-red-400';
    } else if (voltage < 218 || voltage > 242) {
      voltageColor = 'text-amber-400';
    }
  } else {
    voltageColor = 'text-slate-500';
  }

  // Node border and glow — healing phases override alert styling
  const statusClasses = useMemo(() => {
    if (healingPhase === 'RESTORED') {
      return 'border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.6)] animate-shield-healed';
    }
    if (healingPhase === 'ISOLATING' || healingPhase === 'REROUTING') {
      return 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.5)] animate-pulse';
    }
    if (healingPhase === 'MONITORING' || healingPhase === 'RESTORING') {
      return 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]';
    }
    if (isIsolated) {
      return 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.5)] opacity-60';
    }
    if (alertSeverity === 'CRITICAL') {
      return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-node-attack';
    }
    if (alertSeverity === 'HIGH') {
      return 'border-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.5)]';
    }
    if (alertSeverity === 'MEDIUM') {
      return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
    }
    return 'border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]';
  }, [alertSeverity, healingPhase, isIsolated]);

  return (
    <div className={`bg-slate-900 border-2 rounded-lg p-3 min-w-[180px] text-slate-100 transition-all duration-500 ${statusClasses}`}>
      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
      <Handle type="source" position={Position.Left} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-slate-700 border-none opacity-0" />

      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[10px] font-bold text-slate-500 leading-none uppercase tracking-tighter">{id}</div>
          <div className="font-bold text-sm truncate max-w-[110px]">{name}</div>
        </div>
        <div className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${type === 'PQ_LOAD' ? 'bg-blue-950 text-blue-400 border border-blue-800/50' : 'bg-amber-950 text-amber-400 border border-amber-800/50'}`}>
          {type === 'PQ_LOAD' ? 'LOAD' : type === 'SLACK' ? 'GRID' : 'GEN'}
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
          <span className="text-slate-200 font-mono">{activePower.toFixed(1)} MW</span>
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
              <div className={`w-1.5 h-1.5 rounded-full ${breakerStatus === 'CLOSED' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`} />
              <span className={`text-[10px] font-bold ${breakerStatus === 'CLOSED' ? 'text-emerald-500' : 'text-red-500'}`}>{breakerStatus}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

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

  // Update nodes and edges based on telemetry, alerts, and shield state
  useEffect(() => {
    const isolatedBuses = new Set(shield?.isolatedBuses || []);
    const activeHealingMap = new Map<string, string>(); // busId → phase
    for (const evt of (shield?.activeEvents || [])) {
      activeHealingMap.set(evt.affectedBus, evt.phase);
    }
    // Show RESTORED briefly for recently completed events
    for (const evt of (shield?.completedEvents || []).slice(0, 3)) {
      const elapsed = Date.now() - new Date(evt.lastUpdate).getTime();
      if (elapsed < 5000 && !activeHealingMap.has(evt.affectedBus)) {
        activeHealingMap.set(evt.affectedBus, 'RESTORED');
      }
    }

    // Update nodes with latest telemetry, alert status, and healing state
    setNodes((nds) =>
      nds.map((node) => {
        const telemetry = latestTelemetry.find((t) => t.busId === node.id);
        const activeAlerts = alerts.filter(
          (a) => a.affectedAssets.includes(node.id) && a.status === 'ACTIVE'
        );
        
        let highestSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
        if (activeAlerts.some(a => a.severity === 'CRITICAL')) {
          highestSeverity = 'CRITICAL';
        } else if (activeAlerts.some(a => a.severity === 'HIGH')) {
          highestSeverity = 'HIGH';
        } else if (activeAlerts.some(a => a.severity === 'MEDIUM')) {
          highestSeverity = 'MEDIUM';
        } else if (activeAlerts.length > 0) {
          highestSeverity = 'LOW';
        }

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
      })
    );

    // Update edges based on alerts and shield state
    const trippedBreakers = new Set(shield?.trippedBreakers || []);
    const reroutedLines = new Set(shield?.reroutedLines || []);

    setEdges((eds) =>
      eds.map((edge) => {
        const isTripped = trippedBreakers.has(edge.id);
        const isRerouted = reroutedLines.has(edge.id);
        const isAffected = !isTripped && !isRerouted && alerts.some(
          (a) => 
            a.status === 'ACTIVE' && 
            (a.affectedAssets.includes(edge.source) || a.affectedAssets.includes(edge.target))
        );

        let stroke = '#10b981'; // green normal
        let strokeWidth = 2;
        let animated = true;
        let strokeDasharray = '5 5';

        if (isTripped) {
          stroke = '#f97316';    // orange for tripped
          strokeWidth = 3;
          animated = false;       // no animation = no power flow
          strokeDasharray = '3 8'; // wider gaps = disconnected
        } else if (isRerouted) {
          stroke = '#06b6d4';    // cyan for rerouted power
          strokeWidth = 4;       // thicker = carrying extra load
          animated = true;
          strokeDasharray = '2 2'; // fast animation
        } else if (isAffected) {
          stroke = '#ef4444';
        }

        return {
          ...edge,
          style: { stroke, strokeWidth, strokeDasharray },
          animated,
        };
      })
    );
  }, [latestTelemetry, alerts, shield, setNodes, setEdges]);

  return (
    <div data-testid="grid-topology" className="w-full h-full min-h-[550px] bg-slate-950/20 rounded-xl overflow-hidden border border-slate-800/50 relative">
      <div className="absolute top-4 left-4 z-10">
        <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold tracking-wider">
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        className="bg-transparent"
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background color="#1e293b" gap={25} size={1} />
        <Controls showInteractive={false} className="!bg-slate-900 !border-slate-700 !fill-slate-400" />
      </ReactFlow>
    </div>
  );
}
