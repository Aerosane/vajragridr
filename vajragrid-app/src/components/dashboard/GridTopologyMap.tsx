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

interface BusNodeData {
  id: string;
  name: string;
  type: BusType;
  telemetry?: GridTelemetry;
  alertSeverity?: 'CRITICAL' | 'MEDIUM' | 'LOW';
}

const BusNode = ({ data }: { data: BusNodeData }) => {
  const { id, name, type, telemetry, alertSeverity } = data;
  
  const voltage = telemetry?.voltage ?? 0;
  const frequency = telemetry?.frequency ?? 0;
  const activePower = telemetry?.activePower ?? 0;
  const breakerStatus = telemetry?.breakerStatus ?? 'CLOSED';

  // Voltage color logic: green if normal 218-242, amber if warning, red if critical
  let voltageColor = 'text-emerald-400';
  if (voltage > 0) {
    if (voltage < 210 || voltage > 250) {
      voltageColor = 'text-red-400';
    } else if (voltage < 218 || voltage > 242) {
      voltageColor = 'text-amber-400';
    }
  } else {
    voltageColor = 'text-slate-500';
  }

  // Node border and glow based on alerts
  const statusClasses = useMemo(() => {
    if (alertSeverity === 'CRITICAL') {
      return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-node-attack';
    }
    if (alertSeverity === 'MEDIUM') {
      return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
    }
    return 'border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]';
  }, [alertSeverity]);

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
          <div className={`w-1.5 h-1.5 rounded-full ${breakerStatus === 'CLOSED' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`} />
          <span className={`text-[10px] font-bold ${breakerStatus === 'CLOSED' ? 'text-emerald-500' : 'text-red-500'}`}>{breakerStatus}</span>
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
  alerts 
}: { 
  latestTelemetry: GridTelemetry[]; 
  alerts: ThreatAlert[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges based on telemetry and alerts
  useEffect(() => {
    // Update nodes with latest telemetry and alert status
    setNodes((nds) =>
      nds.map((node) => {
        const telemetry = latestTelemetry.find((t) => t.busId === node.id);
        const activeAlerts = alerts.filter(
          (a) => a.affectedAssets.includes(node.id) && a.status === 'ACTIVE'
        );
        
        let highestSeverity: 'CRITICAL' | 'MEDIUM' | 'LOW' | undefined;
        if (activeAlerts.some(a => a.severity === 'CRITICAL')) {
          highestSeverity = 'CRITICAL';
        } else if (activeAlerts.some(a => a.severity === 'HIGH' || a.severity === 'MEDIUM')) {
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
          },
        };
      })
    );

    // Update edges based on alerts on connected buses
    setEdges((eds) =>
      eds.map((edge) => {
        const isAffected = alerts.some(
          (a) => 
            a.status === 'ACTIVE' && 
            (a.affectedAssets.includes(edge.source) || a.affectedAssets.includes(edge.target))
        );

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isAffected ? '#ef4444' : '#10b981',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
          animated: true,
        };
      })
    );
  }, [latestTelemetry, alerts, setNodes, setEdges]);

  return (
    <div className="w-full h-full min-h-[550px] bg-slate-950/20 rounded-xl overflow-hidden border border-slate-800/50 relative">
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
