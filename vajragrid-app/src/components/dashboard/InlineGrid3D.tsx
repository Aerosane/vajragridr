'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Line, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';

const BUS_POS: Record<string, [number, number, number]> = {
  'BUS-001': [0, 0, 0],
  'BUS-002': [-12, 0, 8],
  'BUS-003': [12, 0, 8],
  'BUS-004': [-10, 0, -10],
  'BUS-005': [10, 0, -10],
};

const BUS_META: Record<string, { name: string; short: string }> = {
  'BUS-001': { name: 'Indrapura', short: 'GEN' },
  'BUS-002': { name: 'Vajra Solar', short: 'SOL' },
  'BUS-003': { name: 'Shakti Nagar', short: 'LOAD' },
  'BUS-004': { name: 'Kavach Grid', short: 'LOAD' },
  'BUS-005': { name: 'Sudarshan', short: 'LOAD' },
};

const TX_LINES = [
  { id: 'TL-01', from: 'BUS-001', to: 'BUS-003' },
  { id: 'TL-02', from: 'BUS-001', to: 'BUS-002' },
  { id: 'TL-03', from: 'BUS-002', to: 'BUS-004' },
  { id: 'TL-04', from: 'BUS-003', to: 'BUS-005' },
  { id: 'TL-05', from: 'BUS-004', to: 'BUS-005' },
  { id: 'TL-06', from: 'BUS-002', to: 'BUS-003' },
];

function getNodeColor(busId: string, alerts: ThreatAlert[], shield: ShieldData | null): string {
  if (shield?.isolatedBuses?.includes(busId)) return '#f97316';
  if (shield?.activeEvents?.find(e => e.affectedBus === busId)) return '#22d3ee';
  const a = alerts.filter(x => x.affectedAssets.includes(busId) && x.status === 'ACTIVE');
  if (a.some(x => x.severity === 'CRITICAL')) return '#ef4444';
  if (a.some(x => x.severity === 'HIGH')) return '#f97316';
  if (a.some(x => x.severity === 'MEDIUM')) return '#eab308';
  return '#3b82f6';
}

function getLineColor(lineId: string, shield: ShieldData | null, alerts: ThreatAlert[]): string {
  if (shield?.trippedBreakers?.includes(lineId)) return '#f97316';
  if (shield?.reroutedLines?.includes(lineId)) return '#22d3ee';
  const l = TX_LINES.find(x => x.id === lineId);
  if (l && alerts.some(a => a.status === 'ACTIVE' && (a.affectedAssets.includes(l.from) || a.affectedAssets.includes(l.to)))) return '#ef4444';
  return '#1e40af';
}

/* ─── Substation Node (Glowing Sphere) ─────────────────────── */
function SubstationNode({ busId, telemetry, color }: { busId: string; telemetry?: GridTelemetry; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pos = BUS_POS[busId];
  const meta = BUS_META[busId];
  const isAttacked = color === '#ef4444' || color === '#f97316';
  const isHealing = color === '#22d3ee';

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = pos[1] + Math.sin(t * 0.8 + pos[0]) * 0.15;
    if (glowRef.current) {
      const scale = isAttacked ? 2.0 + Math.sin(t * 4) * 0.4 : 1.8;
      glowRef.current.scale.setScalar(scale);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.3;
    }
  });

  return (
    <group position={pos}>
      {/* Outer glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={isAttacked ? 0.18 : 0.06} />
      </mesh>

      {/* Core sphere */}
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isAttacked ? 2.0 : isHealing ? 1.5 : 0.6}
          metalness={0.8}
          roughness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* Rotating ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isAttacked ? 0.4 : 0.15}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, -1.5, 0]}
        fontSize={0.45}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.025}
        outlineColor="#000"
      >
        {meta.name}
      </Text>
      <Text
        position={[0, -2.0, 0]}
        fontSize={0.3}
        color="#64748b"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.015}
        outlineColor="#000"
      >
        {telemetry ? `${telemetry.voltage.toFixed(0)}kV · ${telemetry.frequency.toFixed(1)}Hz` : 'OFFLINE'}
      </Text>
    </group>
  );
}

/* ─── Transmission Line (drei Line with glow) ─────────────── */
function TransmissionLine({ lineId, shield, alerts }: { lineId: string; shield: ShieldData | null; alerts: ThreatAlert[] }) {
  const line = TX_LINES.find(l => l.id === lineId)!;
  const from = BUS_POS[line.from];
  const to = BUS_POS[line.to];
  const color = getLineColor(lineId, shield, alerts);
  const isTripped = shield?.trippedBreakers?.includes(lineId);

  const points = useMemo<[number, number, number][]>(() => {
    const midY = 0.6;
    return [
      from,
      [(from[0] + to[0]) / 2, midY, (from[2] + to[2]) / 2],
      to,
    ];
  }, [from, to]);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={isTripped ? 1 : 2.5}
      transparent
      opacity={isTripped ? 0.2 : 0.6}
      toneMapped={false}
    />
  );
}

/* ─── Main Component ───────────────────────────────────────── */
interface Props {
  latestTelemetry: GridTelemetry[];
  alerts: ThreatAlert[];
  shield: ShieldData | null;
}

export default function InlineGrid3D({ latestTelemetry, alerts, shield }: Props) {
  const telMap = useMemo(() => {
    const m = new Map<string, GridTelemetry>();
    for (const t of latestTelemetry) m.set(t.busId, t);
    return m;
  }, [latestTelemetry]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden">
      <Canvas
        camera={{ position: [0, 50, 100], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#060a14']} />
        <fog attach="fog" args={['#060a14', 40, 80]} />

        {/* Lighting */}
        <ambientLight intensity={0.2} />
        <directionalLight color="#0ea5e9" position={[10, 10, 10]} intensity={1.5} />
        <pointLight position={[0, 12, 0]} intensity={0.5} color="#3b82f6" distance={40} />
        <pointLight position={[-10, 6, -10]} intensity={0.3} color="#8b5cf6" distance={30} />

        <Stars radius={100} depth={50} count={2000} factor={3} fade speed={0.3} />

        {/* High-tech floor grid */}
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

        {/* Transmission lines */}
        {TX_LINES.map(l => (
          <TransmissionLine key={l.id} lineId={l.id} shield={shield} alerts={alerts} />
        ))}

        {/* Bus nodes */}
        {Object.keys(BUS_POS).map(busId => (
          <SubstationNode
            key={busId}
            busId={busId}
            telemetry={telMap.get(busId)}
            color={getNodeColor(busId, alerts, shield)}
          />
        ))}

        {/* Postprocessing: Bloom glow */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            mipmapBlur
            intensity={1.5}
          />
        </EffectComposer>

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={15}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate
          autoRotateSpeed={0.4}
        />
      </Canvas>
    </div>
  );
}
