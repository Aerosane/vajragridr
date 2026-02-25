'use client';

import React from 'react';
import { SystemState } from '@/lib/types';

interface MetricCardsProps {
  systemState: SystemState | null;
}

export default function MetricCards({ systemState }: MetricCardsProps) {
  const getFrequencyColor = (freq: number) => {
    if (freq < 49.5 || freq > 50.5) return 'text-red-400';
    if (freq < 49.9 || freq > 50.05) return 'text-amber-400';
    return 'text-green-400';
  };

  const getBalanceColor = (balance: number) => {
    const deviation = Math.abs(1 - balance);
    if (deviation > 0.1) return 'text-red-400';
    if (deviation > 0.05) return 'text-amber-400';
    return 'text-green-400';
  };

  const metrics = [
    {
      label: 'Total Generation',
      value: systemState ? `${systemState.totalGeneration.toFixed(2)} MW` : '---',
      color: 'text-blue-400',
    },
    {
      label: 'Total Load',
      value: systemState ? `${systemState.totalLoad.toFixed(2)} MW` : '---',
      color: 'text-indigo-400',
    },
    {
      label: 'System Frequency',
      value: systemState ? `${systemState.systemFrequency.toFixed(3)} Hz` : '---',
      color: systemState ? getFrequencyColor(systemState.systemFrequency) : 'text-slate-400',
    },
    {
      label: 'Gen-Load Balance',
      value: systemState ? `${(systemState.generationLoadBalance * 100).toFixed(2)}%` : '---',
      color: systemState ? getBalanceColor(systemState.generationLoadBalance) : 'text-slate-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      {metrics.map((metric, idx) => (
        <div key={idx} className="bg-slate-900/50 border border-slate-700 p-4 rounded-lg shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{metric.label}</p>
          <p className={`text-2xl font-mono font-bold ${metric.color}`}>
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}
