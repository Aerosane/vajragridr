'use client';

import React from 'react';
import type { KillChainData } from '@/hooks/useSSEGridData';

const DIMENSIONS = [
  { key: 'RULES', label: 'Rules', angle: 0 },
  { key: 'PHYSICS', label: 'Physics', angle: 72 },
  { key: 'STATISTICAL', label: 'Statistical', angle: 144 },
  { key: 'ML', label: 'ML/ONNX', angle: 216 },
  { key: 'CONFIDENCE', label: 'Confidence', angle: 288 },
];

interface Props {
  killChain: KillChainData | null;
  alertConfidence: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export default function ConfidenceRadar({ killChain, alertConfidence }: Props) {
  const cx = 80, cy = 80, maxR = 65;
  const layers = killChain?.layers || [];

  // Build scores: triggered layers get high score based on count
  const scores: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    if (dim.key === 'CONFIDENCE') {
      scores[dim.key] = alertConfidence;
    } else {
      const layer = layers.find(l => l.layer === dim.key);
      if (!layer) {
        scores[dim.key] = 0;
      } else {
        scores[dim.key] = layer.triggered ? Math.min(1, 0.5 + layer.count * 0.1) : 0.05;
      }
    }
  }

  const hasData = layers.length > 0;

  // Build polygon points
  const dataPoints = DIMENSIONS.map(dim => {
    const r = scores[dim.key] * maxR;
    return polarToCartesian(cx, cy, r, dim.angle);
  });
  const polygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Background grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-black uppercase tracking-[0.15em] text-zinc-300">🕸️ Detection Confidence</span>
        {hasData && (
          <span className="text-xs font-mono text-zinc-500">
            {DIMENSIONS.filter(d => scores[d.key] > 0.1).length}/{DIMENSIONS.length} layers active
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <svg viewBox="0 0 160 160" className="w-40 h-40 sm:w-48 sm:h-48">
          {/* Grid rings */}
          {rings.map(r => (
            <polygon
              key={r}
              points={DIMENSIONS.map(d => {
                const p = polarToCartesian(cx, cy, r * maxR, d.angle);
                return `${p.x},${p.y}`;
              }).join(' ')}
              fill="none"
              stroke="rgb(51, 65, 85)"
              strokeWidth="0.5"
              opacity={0.5}
            />
          ))}

          {/* Axes */}
          {DIMENSIONS.map(dim => {
            const p = polarToCartesian(cx, cy, maxR, dim.angle);
            return (
              <line key={dim.key} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgb(51, 65, 85)" strokeWidth="0.5" />
            );
          })}

          {/* Data polygon */}
          {hasData && (
            <>
              <polygon
                points={polygon}
                fill={alertConfidence > 0.5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}
                stroke={alertConfidence > 0.5 ? 'rgb(239, 68, 68)' : 'rgb(16, 185, 129)'}
                strokeWidth="1.5"
                className="transition-all duration-700"
              />
              {/* Data points */}
              {dataPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill={scores[DIMENSIONS[i].key] > 0.4 ? 'rgb(239, 68, 68)' : 'rgb(16, 185, 129)'}
                  className="transition-all duration-500"
                />
              ))}
            </>
          )}

          {/* Labels */}
          {DIMENSIONS.map(dim => {
            const p = polarToCartesian(cx, cy, maxR + 14, dim.angle);
            const score = scores[dim.key];
            return (
              <text
                key={dim.key}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`text-[10px] font-bold ${score > 0.4 ? 'fill-red-400' : 'fill-zinc-400'}`}
              >
                {dim.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-slate-500">Normal</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-slate-500">Anomalous</span>
        </div>
      </div>
    </div>
  );
}
