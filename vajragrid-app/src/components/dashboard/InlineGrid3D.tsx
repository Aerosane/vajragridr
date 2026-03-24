'use client';

import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars, Line, Grid, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';
import type { ShieldData } from '@/hooks/useSSEGridData';

const BUS_POS: Record<string, [number, number, number]> = {
  'BUS-001': [0, 0, 0],
  'BUS-002': [-12, 0, 8],
  'BUS-003': [12, 0, 8],
  'BUS-004': [-10, 0, -10],
  'BUS-005': [10, 0, -10],
};

const BUS_META: Record<string, { name: string; type: string; short: string }> = {
  'BUS-001': { name: 'Indrapura', type: 'Generator', short: 'GEN' },
  'BUS-002': { name: 'Vajra Solar', type: 'Solar Farm', short: 'SOL' },
  'BUS-003': { name: 'Shakti Nagar', type: 'Load Center', short: 'LOAD' },
  'BUS-004': { name: 'Kavach Grid', type: 'Load Center', short: 'LOAD' },
  'BUS-005': { name: 'Sudarshan', type: 'Load Center', short: 'LOAD' },
};

const TX_LINES = [
  { id: 'TL-01', from: 'BUS-001', to: 'BUS-003' },
  { id: 'TL-02', from: 'BUS-001', to: 'BUS-002' },
  { id: 'TL-03', from: 'BUS-002', to: 'BUS-004' },
  { id: 'TL-04', from: 'BUS-003', to: 'BUS-005' },
  { id: 'TL-05', from: 'BUS-004', to: 'BUS-005' },
  { id: 'TL-06', from: 'BUS-002', to: 'BUS-003' },
];

/* ─── Helpers ──────────────────────────────────────────────── */
function getNodeStatus(busId: string, alerts: ThreatAlert[], shield: ShieldData | null): { color: string; label: string } {
  if (shield?.isolatedBuses?.includes(busId)) return { color: '#f97316', label: 'ISOLATED' };
  if (shield?.activeEvents?.find(e => e.affectedBus === busId)) return { color: '#22d3ee', label: 'HEALING' };
  const a = alerts.filter(x => x.affectedAssets.includes(busId) && x.status === 'ACTIVE');
  if (a.some(x => x.severity === 'CRITICAL')) return { color: '#ef4444', label: 'CRITICAL' };
  if (a.some(x => x.severity === 'HIGH')) return { color: '#f97316', label: 'ALERT' };
  if (a.some(x => x.severity === 'MEDIUM')) return { color: '#eab308', label: 'WARNING' };
  return { color: '#3b82f6', label: 'NOMINAL' };
}

function getLineColor(lineId: string, shield: ShieldData | null, alerts: ThreatAlert[]): string {
  if (shield?.trippedBreakers?.includes(lineId)) return '#f97316';
  if (shield?.reroutedLines?.includes(lineId)) return '#22d3ee';
  const l = TX_LINES.find(x => x.id === lineId);
  if (l && alerts.some(a => a.status === 'ACTIVE' && (a.affectedAssets.includes(l.from) || a.affectedAssets.includes(l.to)))) return '#ef4444';
  return '#1e40af';
}

const STATUS_DOT: Record<string, string> = {
  NOMINAL: 'bg-blue-500',
  WARNING: 'bg-amber-500',
  ALERT: 'bg-orange-500',
  CRITICAL: 'bg-red-500 animate-pulse',
  ISOLATED: 'bg-orange-500 animate-pulse',
  HEALING: 'bg-cyan-500 animate-pulse',
};

/* ─── Substation Node ──────────────────────────────────────── */
interface NodeProps {
  busId: string;
  telemetry?: GridTelemetry;
  status: { color: string; label: string };
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (busId: string) => void;
}

function SubstationNode({ busId, telemetry, status, isSelected, isDimmed, onSelect }: NodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const pos = BUS_POS[busId];
  const meta = BUS_META[busId];
  const isAttacked = status.label === 'CRITICAL' || status.label === 'ALERT' || status.label === 'ISOLATED';
  const isHealing = status.label === 'HEALING';
  const targetScale = hovered || isSelected ? 1.15 : isDimmed ? 0.85 : 1.0;

  useFrame(({ clock }) => {
    if (!meshRef.current || !groupRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = pos[1] + Math.sin(t * 0.8 + pos[0]) * 0.15;
    const s = groupRef.current.scale.x;
    groupRef.current.scale.setScalar(THREE.MathUtils.lerp(s, targetScale, 0.08));
    if (glowRef.current) {
      const gs = isAttacked ? 2.0 + Math.sin(t * 4) * 0.4 : 1.8;
      glowRef.current.scale.setScalar(gs);
    }
    if (ringRef.current) ringRef.current.rotation.z = t * 0.3;
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  }, []);
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(busId);
  }, [busId, onSelect]);

  const loadPct = telemetry ? Math.min(100, Math.abs(telemetry.activePower) / 30 * 100) : 0;

  return (
    <group ref={groupRef} position={pos}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshBasicMaterial color={status.color} transparent opacity={(isAttacked ? 0.18 : 0.06) * (isDimmed ? 0.4 : 1)} />
      </mesh>

      <mesh
        ref={meshRef}
        castShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial
          color={status.color}
          emissive={status.color}
          emissiveIntensity={isAttacked ? 2.0 : isHealing ? 1.5 : hovered ? 1.0 : 0.6}
          metalness={0.8}
          roughness={0.15}
          transparent={isDimmed}
          opacity={isDimmed ? 0.4 : 1}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 48]} />
        <meshBasicMaterial color={status.color} transparent opacity={(isAttacked ? 0.4 : 0.15) * (isDimmed ? 0.3 : 1)} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 1.35, 64]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}

      <Html position={[0, 1.8, 0]} center distanceFactor={20} style={{ pointerEvents: 'none', transition: 'all 0.3s ease', userSelect: 'none' }}>
        {hovered ? (
          <div className="bg-zinc-900/85 backdrop-blur-lg border border-zinc-600/60 rounded-lg p-3 w-52 shadow-2xl" style={{ pointerEvents: 'none' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono font-black text-zinc-200 tracking-wider">{busId}</span>
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status.label] || 'bg-zinc-500'}`} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-[10px] text-zinc-500 uppercase tracking-wider">Type</span><span className="text-[10px] font-mono text-zinc-300">{meta.type}</span></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-500 uppercase tracking-wider">Status</span><span className={`text-[10px] font-mono font-bold ${status.label === 'NOMINAL' ? 'text-blue-400' : status.label === 'HEALING' ? 'text-cyan-400' : 'text-red-400'}`}>{status.label}</span></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-500 uppercase tracking-wider">Load</span><span className="text-[10px] font-mono text-zinc-300 tabular-nums">{loadPct.toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-[10px] text-zinc-500 uppercase tracking-wider">Voltage</span><span className="text-[10px] font-mono text-zinc-300 tabular-nums">{telemetry ? `${telemetry.voltage.toFixed(1)} kV` : '---'}</span></div>
              <div className="h-[3px] w-full bg-zinc-800 rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500" style={{ width: `${loadPct}%` }} />
              </div>
            </div>
            <div className="text-[9px] text-zinc-600 text-center mt-2 tracking-wider">Click to inspect</div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-zinc-900/70 backdrop-blur-md border border-zinc-700/40 rounded-md px-2 py-1 shadow-lg" style={{ pointerEvents: 'none' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status.label] || 'bg-zinc-500'}`} />
            <span className="text-[10px] font-mono font-bold text-zinc-400 tracking-wider">{meta.short}</span>
          </div>
        )}
      </Html>
    </group>
  );
}

/* ─── Transmission Line ────────────────────────────────────── */
function TransmissionLine({ lineId, shield, alerts, dimmed }: { lineId: string; shield: ShieldData | null; alerts: ThreatAlert[]; dimmed: boolean }) {
  const line = TX_LINES.find(l => l.id === lineId)!;
  const from = BUS_POS[line.from];
  const to = BUS_POS[line.to];
  const color = getLineColor(lineId, shield, alerts);
  const isTripped = shield?.trippedBreakers?.includes(lineId);

  const points = useMemo<[number, number, number][]>(() => {
    const midY = 0.6;
    return [from, [(from[0] + to[0]) / 2, midY, (from[2] + to[2]) / 2], to];
  }, [from, to]);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={isTripped ? 1 : 2.5}
      transparent
      opacity={(isTripped ? 0.2 : 0.6) * (dimmed ? 0.25 : 1)}
      toneMapped={false}
    />
  );
}

/* ─── Node Inspector Panel (2D overlay) ────────────────────── */
function NodeInspector({ busId, telemetry, status, alerts, onClose }: {
  busId: string;
  telemetry?: GridTelemetry;
  status: { color: string; label: string };
  alerts: ThreatAlert[];
  onClose: () => void;
}) {
  const meta = BUS_META[busId];
  const busAlerts = alerts.filter(a => a.affectedAssets.includes(busId) && a.status === 'ACTIVE');
  const temp = telemetry ? 35 + Math.abs(telemetry.activePower) * 0.5 + (telemetry.voltage - 230) * 0.1 : 0;

  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Voltage', value: telemetry ? `${telemetry.voltage.toFixed(2)} kV` : '---' },
    { label: 'Frequency', value: telemetry ? `${telemetry.frequency.toFixed(3)} Hz` : '---',
      color: telemetry && (telemetry.frequency < 49.9 || telemetry.frequency > 50.1) ? 'text-amber-400' : undefined },
    { label: 'Active Power', value: telemetry ? `${telemetry.activePower.toFixed(2)} MW` : '---' },
    { label: 'Reactive Power', value: telemetry ? `${telemetry.reactivePower.toFixed(2)} MVAR` : '---' },
    { label: 'Current', value: telemetry ? `${telemetry.current.toFixed(1)} A` : '---' },
    { label: 'Power Factor', value: telemetry ? telemetry.powerFactor.toFixed(3) : '---' },
    { label: 'Phase Angle', value: telemetry ? `${telemetry.phaseAngle.toFixed(2)}°` : '---' },
    { label: 'Xfmr Temp', value: telemetry ? `${temp.toFixed(1)} °C` : '---',
      color: temp > 60 ? 'text-red-400' : temp > 50 ? 'text-amber-400' : undefined },
  ];

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 z-50 flex flex-col">
      <div className="bg-zinc-950/92 backdrop-blur-2xl border border-zinc-700/60 shadow-2xl rounded-2xl overflow-y-auto custom-scrollbar flex-1">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color, boxShadow: `0 0 10px ${status.color}50` }} />
            <div>
              <div className="text-sm font-black text-white tracking-wide">{meta.name}</div>
              <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">{busId} · {meta.type}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.08] transition-all">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Status */}
        <div className="px-5 py-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider ${
            status.label === 'NOMINAL' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
            status.label === 'HEALING' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
            'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </div>
        </div>

        {/* Telemetry */}
        <div className="px-5 pb-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">Live Telemetry</div>
          <div className="space-y-1">
            {rows.map(r => (
              <div key={r.label} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                <span className="text-xs text-slate-500 uppercase tracking-wider">{r.label}</span>
                <span className={`text-xs font-mono font-bold tabular-nums ${r.color || 'text-slate-200'}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        <div className="px-5 py-3 border-t border-white/[0.04]">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">Recent Anomalies ({busAlerts.length})</div>
          {busAlerts.length === 0 ? (
            <div className="text-xs text-slate-600 italic py-2">No active anomalies</div>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
              {busAlerts.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 px-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${a.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div>
                    <div className="text-xs font-bold text-slate-300">{a.title}</div>
                    <div className="text-[11px] font-mono text-slate-600">{new Date(a.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Line flows */}
        {telemetry && telemetry.lineFlows.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.04]">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">Line Flows</div>
            <div className="space-y-1">
              {telemetry.lineFlows.map((lf, i) => (
                <div key={i} className="flex justify-between items-center py-1 px-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                  <span className="text-xs font-mono text-slate-500">{lf.lineId}</span>
                  <span className="text-xs font-mono text-slate-300 tabular-nums">{lf.activePowerFlow.toFixed(2)} MW</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────── */
interface Props {
  latestTelemetry: GridTelemetry[];
  alerts: ThreatAlert[];
  shield: ShieldData | null;
}

export default function InlineGrid3D({ latestTelemetry, alerts, shield }: Props) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // Force dispose WebGL context on unmount to free GPU for /grid-3d page
  useEffect(() => {
    return () => {
      if (glRef.current) {
        glRef.current.dispose();
        glRef.current.forceContextLoss();
        glRef.current = null;
      }
    };
  }, []);

  const telMap = useMemo(() => {
    const m = new Map<string, GridTelemetry>();
    for (const t of latestTelemetry) m.set(t.busId, t);
    return m;
  }, [latestTelemetry]);

  const statusMap = useMemo(() => {
    const m = new Map<string, { color: string; label: string }>();
    for (const busId of Object.keys(BUS_POS)) m.set(busId, getNodeStatus(busId, alerts, shield));
    return m;
  }, [alerts, shield]);

  const handleSelect = useCallback((busId: string) => {
    setSelectedNode(prev => prev === busId ? null : busId);
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const connectedLines = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set(TX_LINES.filter(l => l.from === selectedNode || l.to === selectedNode).map(l => l.id));
  }, [selectedNode]);

  return (
    <div className="relative w-full h-full min-h-[350px] rounded-xl overflow-hidden isolate">
      <Canvas
        camera={{ position: [0, 40, 70], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
        dpr={[1, 1.5]}
        onPointerMissed={handleCanvasClick}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.setClearColor('#09090b');
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
          canvas.addEventListener('webglcontextrestored', () => { gl.setClearColor('#09090b'); }, false);
        }}
        fallback={<div className="w-full h-full flex items-center justify-center bg-[#09090b]"><div className="text-zinc-500 text-sm">WebGL required</div></div>}
      >
        <color attach="background" args={['#09090b']} />
        <fog attach="fog" args={['#09090b', 40, 80]} />

        <ambientLight intensity={0.2} />
        <directionalLight color="#0ea5e9" position={[10, 10, 10]} intensity={1.5} />
        <pointLight position={[0, 12, 0]} intensity={0.5} color="#3b82f6" distance={40} />
        <pointLight position={[-10, 6, -10]} intensity={0.3} color="#8b5cf6" distance={30} />

        <Stars radius={100} depth={50} count={1200} factor={3} fade speed={0.3} />

        <Grid
          position={[0, -2.5, 0]}
          args={[60, 60]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#1e293b"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#334155"
          fadeDistance={50}
          fadeStrength={1.2}
          infiniteGrid
        />

        {TX_LINES.map(l => (
          <TransmissionLine key={l.id} lineId={l.id} shield={shield} alerts={alerts} dimmed={!!selectedNode && !connectedLines.has(l.id)} />
        ))}

        {Object.keys(BUS_POS).map(busId => (
          <SubstationNode
            key={busId}
            busId={busId}
            telemetry={telMap.get(busId)}
            status={statusMap.get(busId)!}
            isSelected={selectedNode === busId}
            isDimmed={!!selectedNode && selectedNode !== busId}
            onSelect={handleSelect}
          />
        ))}

        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur intensity={1.2} resolutionScale={0.5} />
        </EffectComposer>

        <OrbitControls enablePan={false} enableZoom={true} minDistance={15} maxDistance={50} maxPolarAngle={Math.PI / 2.2} autoRotate={!selectedNode} autoRotateSpeed={0.4} />
      </Canvas>

      {selectedNode && (
        <NodeInspector
          busId={selectedNode}
          telemetry={telMap.get(selectedNode)}
          status={statusMap.get(selectedNode) ?? { color: '#3b82f6', label: 'NOMINAL' }}
          alerts={alerts}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
