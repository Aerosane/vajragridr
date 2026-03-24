'use client';

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, OrbitControls, Stars, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';
import type { ShieldData } from '@/hooks/useSSEGridData';

const V_NOM = 230;
const F_NOM = 50;

const BUS_POS: Record<string, [number, number, number]> = {
  'BUS-001': [0, 0, 0],
  'BUS-002': [-16, 0, 10],
  'BUS-003': [16, 0, 10],
  'BUS-004': [-13, 0, -14],
  'BUS-005': [13, 0, -14],
};

const BUS_META: Record<string, { name: string; type: string }> = {
  'BUS-001': { name: 'Indrapura', type: 'SLACK' },
  'BUS-002': { name: 'Vajra Solar', type: 'PV_GEN' },
  'BUS-003': { name: 'Shakti Nagar', type: 'PQ_LOAD' },
  'BUS-004': { name: 'Kavach Grid', type: 'PQ_LOAD' },
  'BUS-005': { name: 'Sudarshan Hub', type: 'PQ_LOAD' },
};

const TX_LINES = [
  { id: 'TL-01', from: 'BUS-001', to: 'BUS-003' },
  { id: 'TL-02', from: 'BUS-001', to: 'BUS-002' },
  { id: 'TL-03', from: 'BUS-002', to: 'BUS-004' },
  { id: 'TL-04', from: 'BUS-003', to: 'BUS-005' },
  { id: 'TL-05', from: 'BUS-004', to: 'BUS-005' },
  { id: 'TL-06', from: 'BUS-002', to: 'BUS-003' },
];

function busColor(id: string, alerts: ThreatAlert[], shield: ShieldData | null): string {
  if (shield?.isolatedBuses?.includes(id)) return '#f97316';
  if (shield?.activeEvents?.find(e => e.affectedBus === id)) return '#22d3ee';
  const a = alerts.filter(x => x.affectedAssets.includes(id) && x.status === 'ACTIVE');
  if (a.some(x => x.severity === 'CRITICAL')) return '#ef4444';
  if (a.some(x => x.severity === 'HIGH')) return '#f97316';
  if (a.some(x => x.severity === 'MEDIUM')) return '#eab308';
  return '#22c55e';
}

function lineColor(id: string, shield: ShieldData | null, alerts: ThreatAlert[]): string {
  if (shield?.trippedBreakers?.includes(id)) return '#f97316';
  if (shield?.reroutedLines?.includes(id)) return '#22d3ee';
  const l = TX_LINES.find(x => x.id === id);
  if (l && alerts.some(a => a.status === 'ACTIVE' && (a.affectedAssets.includes(l.from) || a.affectedAssets.includes(l.to)))) return '#ef4444';
  return '#22c55e';
}

function vI(v: number) { return Math.min(v / V_NOM, 2); }

// ═══════════════════════════════════════════════════════════════
// Concrete foundation pad with status glow ring
// ═══════════════════════════════════════════════════════════════
function FoundationPad({ color, width = 6, depth = 5 }: { color: string; width?: number; depth?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Gentle pulse on the glow ring
    const pulse = 0.12 + Math.sin(clock.getElapsedTime() * 2) * 0.06;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = pulse;
  });
  const radius = Math.max(width, depth) * 0.55;
  return (
    <group>
      {/* Concrete slab */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.1} roughness={0.95} />
      </mesh>
      {/* Pulsing status glow ring on ground */}
      <mesh ref={ref} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.15, radius, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Edge curb */}
      {[
        [0, 0.15, depth / 2 + 0.05, width, 0.08, 0.1],
        [0, 0.15, -(depth / 2 + 0.05), width, 0.08, 0.1],
        [width / 2 + 0.05, 0.15, 0, 0.1, 0.08, depth],
        [-(width / 2 + 0.05), 0.15, 0, 0.1, 0.08, depth],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.1} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Animated steam plume — particles rise, expand, and fade
// ═══════════════════════════════════════════════════════════════
function SteamPlume({ position }: { position: [number, number, number] }) {
  const count = 8;
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      // Each puff has a staggered lifecycle
      const phase = ((t * 0.4 + i * 0.35) % 2.8) / 2.8; // 0→1 over ~2.8s
      const rise = phase * 3.5;
      const drift = Math.sin(t * 0.3 + i * 1.7) * 0.4 * phase;
      const scale = 0.2 + phase * 0.8;
      const opacity = phase < 0.15 ? phase / 0.15 * 0.18 : 0.18 * (1 - (phase - 0.15) / 0.85);
      mesh.position.set(position[0] + drift, position[1] + rise, position[2] + Math.cos(t * 0.2 + i) * 0.2 * phase);
      mesh.scale.setScalar(scale);
      (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity);
    }
  });

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={el => { refs.current[i] = el; }}>
          <sphereGeometry args={[0.5, 6, 6]} />
          <meshBasicMaterial color="#d4d4d8" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Blinking warning light
// ═══════════════════════════════════════════════════════════════
function BlinkingLight({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const on = Math.sin(clock.getElapsedTime() * 3) > 0;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = on ? 1.0 : 0.1;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.08, 6, 6]} />
      <meshBasicMaterial color={color} transparent />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// GENERATOR STATION (BUS-001 SLACK) — turbine hall + cooling tower
// ═══════════════════════════════════════════════════════════════
function GeneratorStation({ color, telemetry }: { color: string; telemetry?: GridTelemetry }) {
  const turbineRef = useRef<THREE.Group>(null);
  const em = vI(telemetry?.voltage ?? 0);

  useFrame(() => {
    if (turbineRef.current) {
      const rpm = ((telemetry?.frequency ?? F_NOM) / F_NOM) * 0.03;
      turbineRef.current.rotation.y += rpm;
      turbineRef.current.rotation.x += rpm * 0.6;
    }
  });

  return (
    <group>
      <FoundationPad color={color} width={7} depth={5} />

      {/* Main building — warm industrial grey */}
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[5, 3.2, 3.5]} />
        <meshStandardMaterial color="#8a7e72" metalness={0.45} roughness={0.55} />
      </mesh>
      {/* Roof — darker warm */}
      <mesh position={[0, 3.55, 0]}>
        <boxGeometry args={[5.3, 0.3, 3.8]} />
        <meshStandardMaterial color="#6b5e52" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Lit windows */}
      {[-1.2, 0, 1.2].map((z, i) => (
        <mesh key={i} position={[2.51, 1.8, z]}>
          <planeGeometry args={[0.01, 1.8]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[-1.2, 0, 1.2].map((z, i) => (
        <mesh key={`b${i}`} position={[-2.51, 1.8, z]}>
          <planeGeometry args={[0.01, 1.8]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Power core — arc reactor style */}
      <group ref={turbineRef} position={[-2.6, 2.0, 0]}>
        {/* Central energy sphere */}
        <mesh>
          <sphereGeometry args={[0.35, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
        {/* Outer containment shell */}
        <mesh>
          <sphereGeometry args={[0.55, 8, 8]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} transparent opacity={0.25} />
        </mesh>
        {/* 3 orbiting energy rings at different tilts */}
        {[0, Math.PI / 3, -Math.PI / 3].map((tilt, i) => (
          <mesh key={i} rotation={[tilt, 0, i * Math.PI / 3]}>
            <torusGeometry args={[0.75, 0.03, 6, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.7 + em * 0.15} />
          </mesh>
        ))}
      </group>

      {/* Cooling tower — concrete grey */}
      <mesh position={[4.2, 2.5, 0]}>
        <cylinderGeometry args={[0.9, 1.6, 5, 16, 1, true]} />
        <meshStandardMaterial color="#b0a899" metalness={0.1} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Animated steam — rises and fades */}
      <SteamPlume position={[4.2, 5.2, 0]} />

      {/* Smokestack — industrial dark with red/white warning bands */}
      <mesh position={[-2.2, 3, -2]}>
        <cylinderGeometry args={[0.2, 0.3, 5.5, 6]} />
        <meshStandardMaterial color="#706050" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[-2.2, 5.5, -2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.4, 6]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
      {/* Blinking aviation warning light */}
      <BlinkingLight position={[-2.2, 5.85, -2]} color="#ef4444" />
      {/* White warning band */}
      <mesh position={[-2.2, 5.1, -2]}>
        <cylinderGeometry args={[0.23, 0.23, 0.35, 8]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.1} roughness={0.8} />
      </mesh>

      {/* Step-up transformer — dark green (oil-filled) */}
      <mesh position={[0, 0.9, 2.8]}>
        <boxGeometry args={[2.0, 1.6, 1.2]} />
        <meshStandardMaterial color="#3d5a3a" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 3 HV bushings */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={i} position={[x, 2.0, 2.8]}>
          <mesh>
            <cylinderGeometry args={[0.07, 0.11, 1.2, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={em * 0.9} metalness={0.3} roughness={0.5} />
          </mesh>
          {[0, 0.2, 0.4].map((y, j) => (
            <mesh key={j} position={[0, y, 0]}>
              <torusGeometry args={[0.11, 0.018, 4, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={em * 0.6} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ── Micro details ── */}

      {/* Control room annex */}
      <mesh position={[-2.8, 0.7, -1.8]}>
        <boxGeometry args={[1.2, 1.2, 1.0]} />
        <meshStandardMaterial color="#8b9bb5" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Control room window */}
      <mesh position={[-2.19, 0.8, -1.8]}>
        <planeGeometry args={[0.01, 0.5]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Control room door */}
      <mesh position={[-2.8, 0.5, -1.29]}>
        <planeGeometry args={[0.5, 0.8]} />
        <meshStandardMaterial color="#5f7089" metalness={0.7} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* Oil containment bund around transformer */}
      <mesh position={[0, 0.15, 2.8]}>
        <boxGeometry args={[2.6, 0.02, 1.8]} />
        <meshStandardMaterial color="#d97706" transparent opacity={0.25} />
      </mesh>

      {/* Cable tray from transformer to building */}
      <mesh position={[0, 1.8, 1.6]}>
        <boxGeometry args={[0.15, 0.08, 2.4]} />
        <meshStandardMaterial color="#8b9bb5" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Fire extinguisher cabinet */}
      <mesh position={[2.6, 0.4, -1.7]}>
        <boxGeometry args={[0.2, 0.6, 0.15]} />
        <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.15} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Outdoor floodlight on pole */}
      <mesh position={[3.2, 2.5, 2.0]}>
        <cylinderGeometry args={[0.03, 0.03, 5.0, 6]} />
        <meshStandardMaterial color="#8b9bb5" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[3.2, 5.1, 2.0]}>
        <boxGeometry args={[0.25, 0.12, 0.15]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.6} />
      </mesh>

      {/* Readout panel — always visible on generator */}
      <mesh position={[0, 0.3, -2.8]}>
        <planeGeometry args={[3.0, 1.0]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <Text position={[0, 0.55, -2.79]} fontSize={0.32} color={color} anchorX="center" fontWeight={700}>
        {(telemetry?.voltage ?? 0).toFixed(1)} kV • {(telemetry?.activePower ?? 0).toFixed(1)} MW
      </Text>
      <Text position={[0, 0.15, -2.79]} fontSize={0.22} color="#cbd5e1" anchorX="center">
        {(telemetry?.frequency ?? 0).toFixed(3)} Hz • PF {(telemetry?.powerFactor ?? 0).toFixed(2)}
      </Text>

    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// SOLAR FARM (BUS-002 PV_GEN) — 20 tilted panels + inverter
// ═══════════════════════════════════════════════════════════════
function SolarFarm({ color, telemetry }: { color: string; telemetry?: GridTelemetry }) {
  const em = vI(telemetry?.voltage ?? 0);
  const power = telemetry?.activePower ?? 0;
  const tilt = -Math.PI / 6;

  const panels: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) panels.push([c * 1.3 - 2.6, r * 1.2 - 1.8]);

  return (
    <group>
      <FoundationPad color={color} width={8} depth={5.5} />

      {/* Gravel ground — sandy brown */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <planeGeometry args={[7.5, 5]} />
        <meshStandardMaterial color="#c2b8a3" roughness={1} side={THREE.DoubleSide} />
      </mesh>

      {panels.map(([px, pz], i) => (
        <group key={i} position={[px, 0, pz]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.9, 4]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0]} rotation={[tilt, 0, 0]}>
            <boxGeometry args={[1.1, 0.025, 0.03]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh rotation={[tilt, 0, 0]} position={[0, 0.95, 0]}>
            <boxGeometry args={[1.05, 0.035, 0.85]} />
            <meshStandardMaterial
              color="#1e3a5f"
              emissive={power > 0 ? '#3b82f6' : '#0a0f1c'}
              emissiveIntensity={power > 0 ? em * 0.5 : 0}
              metalness={0.97} roughness={0.02}
            />
          </mesh>
          {/* Reflection shimmer */}
          <mesh rotation={[tilt, 0, 0]} position={[0, 0.97, -0.1]}>
            <planeGeometry args={[0.9, 0.3]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={power > 0 ? 0.1 : 0} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* Inverter — white cabinet */}
      <mesh position={[4.8, 0.7, 0]}>
        <boxGeometry args={[1.0, 1.4, 0.9]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[5.31, 1.0, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line points={[[2.2, 0.5, 0], [4.3, 0.5, 0]]} color="#8b9bb5" lineWidth={1.5} />

      {/* Readout */}
      <mesh position={[0, 0.3, -3.2]}>
        <planeGeometry args={[3.0, 1.0]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <Text position={[0, 0.55, -3.19]} fontSize={0.32} color={color} anchorX="center" fontWeight={700}>
        {(telemetry?.voltage ?? 0).toFixed(1)} kV • {(telemetry?.activePower ?? 0).toFixed(1)} MW
      </Text>
      <Text position={[0, 0.15, -3.19]} fontSize={0.22} color="#cbd5e1" anchorX="center">
        {(telemetry?.frequency ?? 0).toFixed(3)} Hz • {power > 0 ? 'GENERATING' : 'STANDBY'}
      </Text>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOAD SUBSTATION (PQ_LOAD — BUS-003,004,005)
// ═══════════════════════════════════════════════════════════════
function LoadSubstation({ color, telemetry, busId }: { color: string; telemetry?: GridTelemetry; busId: string }) {
  const em = vI(telemetry?.voltage ?? 0);
  const breaker = telemetry?.breakerStatus ?? 'CLOSED';
  const loadMW = Math.abs(telemetry?.activePower ?? 0);

  return (
    <group>
      <FoundationPad color={color} width={6} depth={5} />

      {/* Main transformer — dark olive green (oil-filled) */}
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[2.4, 2.2, 1.8]} />
        <meshStandardMaterial color="#4a6741" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Cooling fins */}
      {[-1, 1].map(side => (
        <group key={side}>
          {Array.from({ length: 7 }).map((_, i) => (
            <mesh key={i} position={[side * 1.35, 1.3, (i - 3) * 0.22]}>
              <boxGeometry args={[0.2, 1.8, 0.14]} />
              <meshStandardMaterial color="#8b9bb5" metalness={0.75} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 3 tall HV bushings */}
      {[-0.5, 0, 0.5].map((z, i) => (
        <group key={i} position={[0, 2.7, z]}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.13, 1.6, 10]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={em * 0.9} metalness={0.2} roughness={0.6} />
          </mesh>
          {[0, 0.25, 0.5, 0.75].map((y, j) => (
            <mesh key={j} position={[0, y - 0.3, 0]}>
              <torusGeometry args={[0.13, 0.02, 4, 10]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={em * 0.5} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Bus bar */}
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[4.0, 0.06, 0.06]} />
        <meshStandardMaterial color="#d97706" emissive="#d97706" emissiveIntensity={em * 0.4} metalness={0.95} roughness={0.05} />
      </mesh>

      {/* Circuit breaker */}
      <group position={[-2.0, 0.6, 0]}>
        <mesh>
          <boxGeometry args={[0.7, 1.1, 0.6]} />
          <meshStandardMaterial
            color={breaker === 'CLOSED' ? '#334155' : '#7f1d1d'}
            emissive={breaker === 'CLOSED' ? '#000000' : '#ef4444'}
            emissiveIntensity={breaker === 'CLOSED' ? 0 : 0.4}
            metalness={0.6} roughness={0.4}
          />
        </mesh>
        <mesh position={[0.36, 0.35, 0]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color={breaker === 'CLOSED' ? '#22c55e' : '#ef4444'} />
        </mesh>
      </group>

      {/* Load indicator orb */}
      <mesh position={[2.0, 1.5, 0]}>
        <sphereGeometry args={[0.4, 10, 10]} />
        <meshStandardMaterial color={color} emissive={color}
          emissiveIntensity={Math.min(loadMW / 15, 3.5)} transparent opacity={0.85} />
      </mesh>
      <mesh position={[2.0, 1.5, 0]}>
        <sphereGeometry args={[0.65, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>

      {/* Grounding bus */}
      <mesh position={[0, 0.14, -2.0]}>
        <boxGeometry args={[3.5, 0.05, 0.05]} />
        <meshStandardMaterial color="#d97706" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Fence posts with chain-link wire lines */}
      {[[-2.8, -2.2], [2.8, -2.2], [-2.8, 2.2], [2.8, 2.2], [0, -2.2], [0, 2.2], [-2.8, 0], [2.8, 0]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.6, z]}>
          <cylinderGeometry args={[0.03, 0.03, 1.2, 3]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* Fence wire — horizontal lines connecting posts */}
      <Line points={[[-2.8, 0.9, -2.2], [0, 0.9, -2.2], [2.8, 0.9, -2.2]]} color="#94a3b8" lineWidth={0.5} />
      <Line points={[[-2.8, 0.5, -2.2], [0, 0.5, -2.2], [2.8, 0.5, -2.2]]} color="#94a3b8" lineWidth={0.5} />
      <Line points={[[-2.8, 0.9, 2.2], [0, 0.9, 2.2], [2.8, 0.9, 2.2]]} color="#94a3b8" lineWidth={0.5} />

      {/* Surge arresters — tall lightning protection rods */}
      {[[-1.5, 0, 1.5], [1.5, 0, 1.5]].map(([x, , z], i) => (
        <group key={`sa-${i}`} position={[x, 0, z]}>
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.02, 0.04, 4.5, 4]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Arrester discs */}
          {[1.5, 2.0, 2.5, 3.0, 3.5].map((y, j) => (
            <mesh key={j} position={[0, y, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.06, 6]} />
              <meshStandardMaterial color="#8b6914" metalness={0.3} roughness={0.7} />
            </mesh>
          ))}
          {/* Rod tip */}
          <mesh position={[0, 4.8, 0]}>
            <coneGeometry args={[0.03, 0.3, 4]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      ))}

      {/* Readout */}
      <mesh position={[0, 0.3, -3.0]}>
        <planeGeometry args={[3.0, 1.0]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <Text position={[0, 0.55, -2.99]} fontSize={0.32} color={color} anchorX="center" fontWeight={700}>
        {(telemetry?.voltage ?? 0).toFixed(1)} kV • {loadMW.toFixed(1)} MW
      </Text>
      <Text position={[0, 0.15, -2.99]} fontSize={0.22} color="#cbd5e1" anchorX="center">
        {(telemetry?.frequency ?? 0).toFixed(3)} Hz • {breaker}
      </Text>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Catenary curve (real sag physics: y = a·cosh(x/a))
// ═══════════════════════════════════════════════════════════════
function makeCatenary(
  s: [number, number, number], e: [number, number, number], segs: number, sagF: number,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const dx = e[0] - s[0], dy = e[1] - s[1], dz = e[2] - s[2];
  const span = Math.sqrt(dx * dx + dz * dz);
  const a = span / (2 * sagF);
  const pylonH = 6.5;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = (t - 0.5) * 2;
    const sag = a * (Math.cosh(u * sagF) - Math.cosh(sagF)) / Math.cosh(sagF);
    pts.push(new THREE.Vector3(s[0] + dx * t, s[1] + dy * t + pylonH + sag, s[2] + dz * t));
  }
  return pts;
}

// ═══════════════════════════════════════════════════════════════
// Transmission Pylon
// ═══════════════════════════════════════════════════════════════
function Pylon({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[0.28, 6.4, 0.28]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
      </mesh>
      {[5.5, 5.9, 6.2].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[1.5 - i * 0.2, 0.08, 0.08]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={i} position={[x, 5.1, 0]}>
          {[0, 0.12, 0.24].map((dy, j) => (
            <mesh key={j} position={[0, dy, 0]}>
              <cylinderGeometry args={[0.07, 0.05, 0.06, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * 0.4, 0.45, dz * 0.4]} rotation={[dz * 0.15, 0, -dx * 0.15]}>
          <boxGeometry args={[0.09, 1.0, 0.09]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[1.0, 1.1, 0.08, 8]} />
        <meshStandardMaterial color="#8b9bb5" metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Transmission Line (catenary + pylons + particles)
// ═══════════════════════════════════════════════════════════════
function TxLine({ line, shield, alerts, telMap }: {
  line: typeof TX_LINES[0]; shield: ShieldData | null;
  alerts: ThreatAlert[]; telMap: Map<string, GridTelemetry>;
}) {
  const s = BUS_POS[line.from], e = BUS_POS[line.to];
  const col = lineColor(line.id, shield, alerts);
  const tripped = shield?.trippedBreakers?.includes(line.id);
  const rerouted = shield?.reroutedLines?.includes(line.id);
  const fromP = telMap.get(line.from)?.activePower ?? 0;
  const toP = telMap.get(line.to)?.activePower ?? 0;
  const dir = fromP >= toP ? 1 : -1;
  const speed = Math.max(0.3, Math.min(Math.abs(fromP - toP) / 40, 3));
  const pts = useMemo(() => makeCatenary(s, e, 30, 1.2), [s, e]);

  return (
    <group>
      <Pylon position={s} color={col} />
      <Pylon position={e} color={col} />
      {[-0.18, 0, 0.18].map((off, i) => {
        const op = pts.map(p => new THREE.Vector3(p.x, p.y, p.z + off));
        return (
          <Line key={i} points={op} color={col}
            lineWidth={rerouted ? 3 : tripped ? 0.5 : 2}
            transparent opacity={tripped ? 0.12 : 0.85}
            dashed={tripped} dashSize={0.4} gapSize={0.3}
          />
        );
      })}
      {!tripped && <FlowPts pts={pts} color={col} speed={rerouted ? speed * 2 : speed} dir={dir} />}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Flow particles along catenary — bright glowing spheres
// ═══════════════════════════════════════════════════════════════
function FlowPts({ pts, color, speed, dir }: {
  pts: THREE.Vector3[]; color: string; speed: number; dir: number;
}) {
  const count = 16;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const segN = pts.length - 1;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed * 0.12 * dir;
    for (let i = 0; i < count; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      let p = ((i / count) + t) % 1; if (p < 0) p += 1;
      const sf = p * segN, si = Math.floor(sf), st = sf - si;
      const a = pts[Math.min(si, segN - 1)], b = pts[Math.min(si + 1, segN)];
      mesh.position.set(a.x + (b.x - a.x) * st, a.y + (b.y - a.y) * st, a.z + (b.z - a.z) * st);
    }
  });

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95
  }), [color]);
  const geo = useMemo(() => new THREE.SphereGeometry(0.22, 4, 4), []);

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={el => { refs.current[i] = el; }} material={mat} geometry={geo} />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shockwave ring (attack / healing visual)
// ═══════════════════════════════════════════════════════════════
function Shockwave({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.getElapsedTime() * 1.2) % 1;
    ref.current.scale.setScalar(1 + t * 5);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[position[0], 0.2, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.5, 1.7, 24]} />
      <meshBasicMaterial color={color} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════
// Ground plane
// ═══════════════════════════════════════════════════════════════
function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0e1525" roughness={0.95} />
      </mesh>
      <gridHelper args={[120, 60, '#1e293b', '#131b2e']} position={[0, -0.04, 0]} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Bus Node dispatcher
// ═══════════════════════════════════════════════════════════════
function BusNode({ busId, telemetry, alerts, shield, onSelect, isSelected }: {
  busId: string; telemetry?: GridTelemetry; alerts: ThreatAlert[]; shield: ShieldData | null;
  onSelect?: (busId: string | null) => void; isSelected?: boolean;
}) {
  const pos = BUS_POS[busId];
  const meta = BUS_META[busId];
  const col = busColor(busId, alerts, shield);
  const isIso = shield?.isolatedBuses?.includes(busId);
  const groupRef = useRef<THREE.Group>(null);
  const hovered = useRef(false);

  useFrame(() => {
    if (!groupRef.current) return;
    const target = hovered.current ? 1.03 : 1.0;
    const s = groupRef.current.scale;
    s.x += (target - s.x) * 0.1;
    s.y += (target - s.y) * 0.1;
    s.z += (target - s.z) * 0.1;
  });

  return (
    <group
      ref={groupRef}
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect?.(isSelected ? null : busId); }}
      onPointerEnter={(e) => { e.stopPropagation(); hovered.current = true; document.body.style.cursor = 'pointer'; }}
      onPointerLeave={() => { hovered.current = false; document.body.style.cursor = 'auto'; }}
    >
      {meta.type === 'SLACK' && <GeneratorStation color={col} telemetry={telemetry} />}
      {meta.type === 'PV_GEN' && <SolarFarm color={col} telemetry={telemetry} />}
      {meta.type === 'PQ_LOAD' && <LoadSubstation color={col} telemetry={telemetry} busId={busId} />}

      {isIso && (
        <mesh position={[0, 2, 0]}>
          <sphereGeometry args={[5.5, 12, 12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.5} />
        </mesh>
      )}

      {/* Selection highlight glow ring */}
      {isSelected && (
        <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.5, 5.2, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Label with dark backdrop for readability */}
      <mesh position={[0, 6.5, 0]}>
        <planeGeometry args={[4.5, 1.3]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <Text position={[0, 6.8, 0.01]} fontSize={0.65} fontWeight={700} color="#ffffff" anchorX="center">
        {meta.name}
      </Text>
      <Text position={[0, 6.1, 0.01]} fontSize={0.35} color="#cbd5e1" anchorX="center">
        {busId} • {meta.type === 'SLACK' ? 'GENERATOR' : meta.type === 'PV_GEN' ? 'SOLAR GEN' : 'LOAD SUB'}
      </Text>
    </group>
  );
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => { camera.position.set(28, 20, 34); camera.lookAt(0, 2, 0); }, [camera]);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Main Scene
// ═══════════════════════════════════════════════════════════════
function GridScene({ telemetry, alerts, shield, selectedBus, onSelectBus }: {
  telemetry: GridTelemetry[]; alerts: ThreatAlert[]; shield: ShieldData | null;
  selectedBus: string | null; onSelectBus: (busId: string | null) => void;
}) {
  const telMap = useMemo(() => {
    const m = new Map<string, GridTelemetry>();
    for (const t of telemetry) m.set(t.busId, t);
    return m;
  }, [telemetry]);

  const attacked = useMemo(() =>
    alerts.filter(a => a.status === 'ACTIVE' && (a.severity === 'CRITICAL' || a.severity === 'HIGH'))
      .flatMap(a => a.affectedAssets).filter((v, i, a) => a.indexOf(v) === i),
    [alerts]);

  return (
    <>
      <CameraRig />

      {/* BRIGHT lighting — hackathon-ready */}
      <ambientLight intensity={1.0} color="#e0e7ff" />
      <directionalLight position={[25, 35, 20]} intensity={1.8} color="#fef3c7" />
      <directionalLight position={[-18, 25, -12]} intensity={0.8} color="#bfdbfe" />
      <pointLight position={[0, 20, 0]} intensity={1.5} color="#818cf8" distance={80} />
      <hemisphereLight color="#c7d2fe" groundColor="#1e293b" intensity={0.5} />
      {/* Accent lights at stations */}
      {Object.entries(BUS_POS).map(([id, pos]) => (
        <pointLight key={id} position={[pos[0], 5, pos[2]]} intensity={1.2}
          color={busColor(id, alerts, shield)} distance={18} />
      ))}

      <Stars radius={120} depth={80} count={2500} factor={2.5} saturation={0.2} fade speed={0.3} />
      <Ground />

      {TX_LINES.map(l => <TxLine key={l.id} line={l} shield={shield} alerts={alerts} telMap={telMap} />)}
      {Object.keys(BUS_POS).map(id => (
        <BusNode key={id} busId={id} telemetry={telMap.get(id)} alerts={alerts} shield={shield}
          onSelect={onSelectBus} isSelected={selectedBus === id} />
      ))}

      {attacked.map(id => {
        const p = BUS_POS[id]; return p ? <Shockwave key={`a-${id}`} position={p} color="#ef4444" /> : null;
      })}
      {shield?.activeEvents?.map(e => {
        const p = BUS_POS[e.affectedBus]; return p ? <Shockwave key={`h-${e.id}`} position={p} color="#22d3ee" /> : null;
      })}

      <OrbitControls enableDamping dampingFactor={0.08} minDistance={14} maxDistance={80}
        autoRotate autoRotateSpeed={0.12} maxPolarAngle={Math.PI / 2.2} target={[0, 2, 0]} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════
export default function Grid3DVisualization({ latestTelemetry, alerts, shield }: {
  latestTelemetry: GridTelemetry[]; alerts: ThreatAlert[]; shield: ShieldData | null;
}) {
  const [selectedBus, setSelectedBus] = useState<string | null>(null);

  const selectedTel = selectedBus ? latestTelemetry.find(t => t.busId === selectedBus) : undefined;
  const selectedMeta = selectedBus ? BUS_META[selectedBus] : undefined;
  const selectedColor = selectedBus ? busColor(selectedBus, alerts, shield) : '#22c55e';
  const busAlerts = selectedBus
    ? alerts.filter(a => a.affectedAssets.includes(selectedBus) && a.status === 'ACTIVE') : [];
  const busShieldEvents = selectedBus && shield?.activeEvents
    ? shield.activeEvents.filter(e => e.affectedBus === selectedBus) : [];

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [28, 20, 34], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
        style={{ background: '#080d1a' }}
        onCreated={({ gl }) => { gl.setClearColor('#080d1a'); }}
        onPointerMissed={() => setSelectedBus(null)}
        fallback={<div className="w-full h-full flex items-center justify-center bg-[#080d1a]">
          <div className="text-slate-500 text-sm">WebGL required</div></div>}
      >
        <GridScene telemetry={latestTelemetry} alerts={alerts} shield={shield}
          selectedBus={selectedBus} onSelectBus={setSelectedBus} />
      </Canvas>

      {/* ── Click-to-Inspect detail panel ── */}
      {selectedBus && selectedMeta && (
        <div className="absolute bottom-4 left-4 z-20 w-80 max-h-[70vh] overflow-y-auto bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-lg p-4 text-slate-300 font-mono text-xs shadow-xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-sm font-bold text-white">{selectedMeta.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{selectedBus} &bull; {selectedMeta.type}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedColor, boxShadow: `0 0 8px ${selectedColor}` }} />
              <button className="text-slate-500 hover:text-white text-lg leading-none" onClick={() => setSelectedBus(null)}>&times;</button>
            </div>
          </div>

          {selectedTel ? (
            <>
              {/* Electrical Telemetry */}
              <div className="border-t border-slate-700/50 pt-2 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">Electrical</div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                  <div>Voltage <span className="text-white float-right">{selectedTel.voltage.toFixed(1)} kV</span></div>
                  <div>Frequency <span className="text-white float-right">{selectedTel.frequency.toFixed(3)} Hz</span></div>
                  <div>Phase &ang; <span className="text-white float-right">{selectedTel.phaseAngle.toFixed(1)}&deg;</span></div>
                  <div>Active P <span className="text-white float-right">{selectedTel.activePower.toFixed(2)} MW</span></div>
                  <div>Reactive Q <span className="text-white float-right">{selectedTel.reactivePower.toFixed(2)} MVAR</span></div>
                  <div>Current <span className="text-white float-right">{selectedTel.current.toFixed(1)} A</span></div>
                  <div>Power Factor <span className="text-white float-right">{selectedTel.powerFactor.toFixed(3)}</span></div>
                </div>
              </div>

              {/* Equipment */}
              <div className="border-t border-slate-700/50 pt-2 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">Equipment</div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                  <div>Xfmr Temp <span className="text-white float-right">{selectedTel.transformerTemp.toFixed(1)}&deg;C</span></div>
                  <div>Breaker <span className={`float-right ${selectedTel.breakerStatus === 'CLOSED' ? 'text-green-400' : 'text-red-400'}`}>{selectedTel.breakerStatus}</span></div>
                  <div>Quality <span className={`float-right ${selectedTel.dataQuality === 'GOOD' ? 'text-green-400' : selectedTel.dataQuality === 'SUSPECT' ? 'text-yellow-400' : 'text-red-400'}`}>{selectedTel.dataQuality}</span></div>
                  <div>Source <span className="text-white float-right">{selectedTel.source}</span></div>
                </div>
              </div>

              {/* Metering */}
              <div className="border-t border-slate-700/50 pt-2 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">Metering</div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                  <div>Meters <span className="text-white float-right">{selectedTel.meterCount}</span></div>
                  <div>Consumption <span className="text-white float-right">{selectedTel.meterConsumption.toFixed(1)} MWh</span></div>
                </div>
              </div>
            </>
          ) : (
            <div className="border-t border-slate-700/50 pt-2 mb-2 text-slate-500 italic">No telemetry data</div>
          )}

          {/* Active Alerts */}
          {busAlerts.length > 0 && (
            <div className="border-t border-slate-700/50 pt-2 mb-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">
                Active Alerts ({busAlerts.length})
              </div>
              {busAlerts.map(a => (
                <div key={a.id} className={`flex items-center gap-2 mb-1 ${
                  a.severity === 'CRITICAL' ? 'text-red-400' : a.severity === 'HIGH' ? 'text-orange-400' : 'text-yellow-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    a.severity === 'CRITICAL' ? 'bg-red-500' : a.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                  }`} />
                  <span className="truncate">{a.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Shield Status */}
          {busShieldEvents.length > 0 && (
            <div className="border-t border-slate-700/50 pt-2">
              <div className="text-[10px] uppercase tracking-wider text-cyan-500 mb-1.5 font-bold">{'\u26A1'} Shield Active</div>
              <div className="text-cyan-400">
                {busShieldEvents.length} healing event{busShieldEvents.length > 1 ? 's' : ''} in progress
              </div>
              {shield?.isolatedBuses?.includes(selectedBus) && (
                <div className="text-orange-400 mt-1">{'\uD83D\uDD12'} Bus Isolated</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="absolute top-4 left-4 z-10">
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 px-4 py-2.5 rounded-lg">
          <div className="text-[11px] uppercase font-bold tracking-widest text-slate-300 mb-1.5">3D Grid Topology • Live</div>
          <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-wider flex-wrap">
            <div className="flex items-center gap-1.5 text-green-400">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              Nominal
            </div>
            <div className="flex items-center gap-1.5 text-red-400">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              Attack
            </div>
            <div className="flex items-center gap-1.5 text-cyan-400">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              VajraShield
            </div>
            <div className="flex items-center gap-1.5 text-orange-400">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
              Isolated
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10">
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 px-3 py-1.5 rounded-lg text-[10px] text-slate-400 font-mono">
          Click station to inspect • Drag to rotate • Scroll to zoom
        </div>
      </div>
    </div>
  );
}
