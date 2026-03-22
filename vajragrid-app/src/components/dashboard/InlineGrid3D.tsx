'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';
import type { ShieldData } from '@/hooks/usePollingGridData';

const V_NOM = 230;

const BUS_POS: Record<string, [number, number, number]> = {
  'BUS-001': [0, 0, 0],
  'BUS-002': [-10, 0, 7],
  'BUS-003': [10, 0, 7],
  'BUS-004': [-8, 0, -9],
  'BUS-005': [8, 0, -9],
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
  const pos = BUS_POS[busId];
  const meta = BUS_META[busId];
  const isAttacked = color === '#ef4444' || color === '#f97316';
  const isHealing = color === '#22d3ee';
  const voltage = telemetry ? telemetry.voltage / V_NOM : 1;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle float
    meshRef.current.position.y = pos[1] + Math.sin(t * 0.8 + pos[0]) * 0.15;
    // Pulse on attack
    if (isAttacked && glowRef.current) {
      const scale = 1.8 + Math.sin(t * 4) * 0.3;
      glowRef.current.scale.setScalar(scale);
    } else if (glowRef.current) {
      glowRef.current.scale.setScalar(1.6);
    }
  });

  return (
    <group position={pos}>
      {/* Glow halo */}
      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={isAttacked ? 0.15 : 0.06} />
      </mesh>

      {/* Core sphere */}
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isAttacked ? 1.5 : isHealing ? 1.2 : 0.4}
          metalness={0.7}
          roughness={0.2}
        />
      </mesh>

      {/* Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[0.8, 1.0, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* Label */}
      <Text
        position={[0, -1.3, 0]}
        fontSize={0.4}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
        font="/fonts/inter-bold.woff"
        outlineWidth={0.02}
        outlineColor="#000"
      >
        {meta.name}
      </Text>
      <Text
        position={[0, -1.7, 0]}
        fontSize={0.28}
        color="#64748b"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {telemetry ? `${telemetry.voltage.toFixed(0)}kV • ${telemetry.frequency.toFixed(1)}Hz` : 'OFFLINE'}
      </Text>
    </group>
  );
}

/* ─── Transmission Line ────────────────────────────────────── */
function TransmissionLine({ lineId, shield, alerts }: { lineId: string; shield: ShieldData | null; alerts: ThreatAlert[] }) {
  const line = TX_LINES.find(l => l.id === lineId)!;
  const from = BUS_POS[line.from];
  const to = BUS_POS[line.to];
  const color = getLineColor(lineId, shield, alerts);
  const isTripped = shield?.trippedBreakers?.includes(lineId);

  const mid = useMemo<[number, number, number]>(() => [
    (from[0] + to[0]) / 2, 0.5, (from[2] + to[2]) / 2,
  ], [from, to]);

  // Use tube geometry instead of <line> to avoid SVG type conflict
  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(...from),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...to),
    ]);
  }, [from, mid, to]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 20, 0.04, 6, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isTripped ? 0.1 : 0.4}
        transparent
        opacity={isTripped ? 0.3 : 0.8}
        metalness={0.6}
        roughness={0.3}
      />
    </mesh>
  );
}

/* ─── Ground Plane ─────────────────────────────────────────── */
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <meshStandardMaterial color="#080d1a" metalness={0.9} roughness={0.8} />
    </mesh>
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
    <Canvas
      camera={{ position: [0, 18, 22], fov: 40 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#060a14']} />
      <fog attach="fog" args={['#060a14', 30, 60]} />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 15, 10]} intensity={0.6} color="#8bb4ff" />
      <pointLight position={[0, 8, 0]} intensity={0.4} color="#3b82f6" />

      <Stars radius={80} depth={40} count={1500} factor={3} fade speed={0.5} />
      <GroundPlane />

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

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={10}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </Canvas>
  );
}
