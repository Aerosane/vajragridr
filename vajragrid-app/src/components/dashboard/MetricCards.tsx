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

export default function MetricCards({ systemState }: MetricCardsProps) {
  const [prev, setPrev] = useState<SystemState | null>(null);
  const [trends, setTrends] = useState<Record<string, Trend>>({});

  // React 19 pattern: derive state from props without useEffect
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

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    if (trend === 'up') return <span className="text-emerald-500 ml-1">↑</span>;
    if (trend === 'down') return <span className="text-red-500 ml-1">↓</span>;
    return <span className="text-slate-500 ml-1">→</span>;
  };

  const getFrequencyColor = (freq: number) => {
    if (freq < 49.5 || freq > 50.5) return 'text-red-500';
    if (freq < 49.9 || freq > 50.1) return 'text-amber-500';
    return 'text-emerald-400';
  };

  const getBalanceColor = (balance: number) => {
    const deviation = Math.abs(1 - balance);
    if (deviation > 0.1) return 'text-red-500';
    if (deviation > 0.05) return 'text-amber-500';
    return 'text-emerald-400';
  };

  const metrics = [
    {
      label: 'Generation Output',
      value: systemState?.totalGeneration != null ? `${systemState.totalGeneration.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.gen,
      color: 'text-blue-400',
      isActive: true,
    },
    {
      label: 'Operational Load',
      value: systemState?.totalLoad != null ? `${systemState.totalLoad.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.load,
      color: 'text-indigo-400',
      isActive: true,
    },
    {
      label: 'System Frequency',
      value: systemState?.systemFrequency != null ? `${systemState.systemFrequency.toFixed(3)}` : '---',
      unit: 'Hz',
      trend: trends.freq,
      color: systemState?.systemFrequency != null ? getFrequencyColor(systemState.systemFrequency) : 'text-slate-400',
      isActive: systemState?.systemFrequency != null ? (systemState.systemFrequency < 49.9 || systemState.systemFrequency > 50.1) : false,
    },
    {
      label: 'Supply Balance',
      value: systemState?.generationLoadBalance != null ? `${(systemState.generationLoadBalance * 100).toFixed(2)}` : '---',
      unit: '%',
      trend: trends.balance,
      color: systemState?.generationLoadBalance != null ? getBalanceColor(systemState.generationLoadBalance) : 'text-slate-400',
      isActive: systemState?.generationLoadBalance != null ? Math.abs(1 - systemState.generationLoadBalance) > 0.05 : false,
    },
  ];

  const getSparklineWidth = (metric: typeof metrics[0]) => {
    if (!systemState) return '0%';
    switch (metric.label) {
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
    <div data-testid="metric-cards" className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 px-2 sm:px-4 py-2">
      {metrics.map((metric, idx) => (
        <div 
          key={idx} 
          className={`gradient-border ${metric.isActive ? 'gradient-border-active' : ''} bg-slate-900/40 p-2.5 sm:p-4 border border-slate-800/50 rounded-lg group hover:border-slate-700/50 transition-all duration-300`}
        >
          <div className="flex justify-between items-start mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
              {metric.label}
            </p>
            <div className="text-xs">
              {getTrendIcon(metric.trend)}
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <p className={`text-lg sm:text-2xl font-mono font-black value-transition ${metric.color}`}>
              {metric.value}
            </p>
            <span className="text-[10px] font-bold text-slate-600 uppercase">{metric.unit}</span>
          </div>
          
          {/* Sparkline bar reflecting actual metric proportion */}
          <div className="mt-3 h-[2px] w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-current ${metric.color} opacity-40 transition-all duration-1000 ease-in-out`}
              style={{ width: getSparklineWidth(metric) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
