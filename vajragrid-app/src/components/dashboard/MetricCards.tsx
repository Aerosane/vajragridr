'use client';

import React, { useState } from 'react';
import { SystemState } from '@/lib/types';

interface MetricCardsProps {
  systemState: SystemState | null;
}

type Trend = 'up' | 'down' | 'neutral';

function compareTrend(current: number, prev: number): Trend {
  if (current > prev) return 'up';
  if (current < prev) return 'down';
  return 'neutral';
}

/* Inline SVG icons */
const TrendUp = () => (
  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17l5-5 5 5M7 7l5-5 5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const TrendDown = () => (
  <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 7l5 5 5-5M7 17l5 5 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const TrendNeutral = () => (
  <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" strokeLinecap="round"/></svg>
);

export default function MetricCards({ systemState }: MetricCardsProps) {
  const [prev, setPrev] = useState<SystemState | null>(null);
  const [trends, setTrends] = useState<Record<string, Trend>>({});

  if (systemState && prev && systemState !== prev) {
    setTrends({
      gen: compareTrend(systemState.totalGeneration, prev.totalGeneration),
      load: compareTrend(systemState.totalLoad, prev.totalLoad),
      freq: compareTrend(systemState.systemFrequency, prev.systemFrequency),
      balance: compareTrend(systemState.generationLoadBalance, prev.generationLoadBalance),
    });
  }
  if (systemState !== prev) {
    setPrev(systemState);
  }

  const getTrendIcon = (trend?: Trend) => {
    if (trend === 'up') return <TrendUp />;
    if (trend === 'down') return <TrendDown />;
    return <TrendNeutral />;
  };

  const getFrequencyColor = (freq: number) => {
    if (freq < 49.5 || freq > 50.5) return 'text-red-400';
    if (freq < 49.9 || freq > 50.1) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getBalanceColor = (balance: number) => {
    const deviation = Math.abs(1 - balance);
    if (deviation > 0.1) return 'text-red-400';
    if (deviation > 0.05) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const isCritical = (label: string) => {
    if (!systemState) return false;
    if (label === 'System Frequency') return systemState.systemFrequency < 49.5 || systemState.systemFrequency > 50.5;
    if (label === 'Supply Balance') return Math.abs(1 - systemState.generationLoadBalance) > 0.1;
    return false;
  };

  const metrics = [
    {
      label: 'Generation Output',
      value: systemState?.totalGeneration != null ? `${systemState.totalGeneration.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.gen,
      gradient: 'from-blue-400 to-cyan-400',
      color: 'text-blue-400',
    },
    {
      label: 'Operational Load',
      value: systemState?.totalLoad != null ? `${systemState.totalLoad.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.load,
      gradient: 'from-indigo-400 to-purple-400',
      color: 'text-indigo-400',
    },
    {
      label: 'System Frequency',
      value: systemState?.systemFrequency != null ? `${systemState.systemFrequency.toFixed(3)}` : '---',
      unit: 'Hz',
      trend: trends.freq,
      gradient: systemState?.systemFrequency != null
        ? (systemState.systemFrequency < 49.9 || systemState.systemFrequency > 50.1 ? 'from-amber-400 to-red-400' : 'from-emerald-400 to-cyan-400')
        : 'from-slate-500 to-slate-600',
      color: systemState?.systemFrequency != null ? getFrequencyColor(systemState.systemFrequency) : 'text-slate-400',
    },
    {
      label: 'Supply Balance',
      value: systemState?.generationLoadBalance != null ? `${(systemState.generationLoadBalance * 100).toFixed(2)}` : '---',
      unit: '%',
      trend: trends.balance,
      gradient: systemState?.generationLoadBalance != null
        ? (Math.abs(1 - systemState.generationLoadBalance) > 0.05 ? 'from-amber-400 to-orange-400' : 'from-emerald-400 to-blue-400')
        : 'from-slate-500 to-slate-600',
      color: systemState?.generationLoadBalance != null ? getBalanceColor(systemState.generationLoadBalance) : 'text-slate-400',
    },
  ];

  const getSparklineWidth = (label: string) => {
    if (!systemState) return '0%';
    switch (label) {
      case 'Generation Output':
        return `${Math.min(100, (systemState.totalGeneration / 150) * 100)}%`;
      case 'Operational Load':
        return `${Math.min(100, (systemState.totalLoad / 150) * 100)}%`;
      case 'System Frequency': {
        const deviation = Math.abs(systemState.systemFrequency - 50) / 1;
        return `${Math.min(100, (1 - deviation) * 100)}%`;
      }
      case 'Supply Balance':
        return `${Math.min(100, systemState.generationLoadBalance * 100)}%`;
      default:
        return '0%';
    }
  };

  return (
    <div data-testid="metric-cards" className="grid grid-cols-2 gap-3">
      {metrics.map((metric, idx) => {
        const critical = isCritical(metric.label);
        return (
          <div
            key={idx}
            className={`bg-white/[0.02] border rounded-xl p-3.5 group hover:bg-white/[0.04] transition-all duration-300 ${
              critical
                ? 'border-amber-500/30 ring-1 ring-amber-500/20 animate-pulse'
                : 'border-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                {metric.label}
              </p>
              {getTrendIcon(metric.trend)}
            </div>
            <div className="flex items-baseline gap-1">
              <p className={`text-lg font-mono font-black tabular-nums bg-gradient-to-r ${metric.gradient} bg-clip-text text-transparent`}>
                {metric.value}
              </p>
              <span className="text-[10px] font-bold text-zinc-600 uppercase">{metric.unit}</span>
            </div>

            <div className="mt-3 h-[2px] w-full bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${metric.gradient} opacity-60 transition-all duration-1000 ease-in-out`}
                style={{ width: getSparklineWidth(metric.label) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
