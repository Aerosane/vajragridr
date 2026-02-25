'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SystemState } from '@/lib/types';

interface MetricCardsProps {
  systemState: SystemState | null;
}

export default function MetricCards({ systemState }: MetricCardsProps) {
  const prevSystemState = useRef<SystemState | null>(null);
  const [trends, setTrends] = useState<{ [key: string]: 'up' | 'down' | 'neutral' }>({});

  useEffect(() => {
    if (systemState && prevSystemState.current) {
      const newTrends: { [key: string]: 'up' | 'down' | 'neutral' } = {};
      
      const compare = (current: number, prev: number) => {
        if (current > prev) return 'up';
        if (current < prev) return 'down';
        return 'neutral';
      };

      newTrends.gen = compare(systemState.totalGeneration, prevSystemState.current.totalGeneration);
      newTrends.load = compare(systemState.totalLoad, prevSystemState.current.totalLoad);
      newTrends.freq = compare(systemState.systemFrequency, prevSystemState.current.systemFrequency);
      newTrends.balance = compare(systemState.generationLoadBalance, prevSystemState.current.generationLoadBalance);

      setTrends(newTrends);
    }
    prevSystemState.current = systemState;
  }, [systemState]);

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
      value: systemState ? `${systemState.totalGeneration.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.gen,
      color: 'text-blue-400',
      isActive: true,
    },
    {
      label: 'Operational Load',
      value: systemState ? `${systemState.totalLoad.toFixed(2)}` : '---',
      unit: 'MW',
      trend: trends.load,
      color: 'text-indigo-400',
      isActive: true,
    },
    {
      label: 'System Frequency',
      value: systemState ? `${systemState.systemFrequency.toFixed(3)}` : '---',
      unit: 'Hz',
      trend: trends.freq,
      color: systemState ? getFrequencyColor(systemState.systemFrequency) : 'text-slate-400',
      isActive: systemState ? (systemState.systemFrequency < 49.9 || systemState.systemFrequency > 50.1) : false,
    },
    {
      label: 'Supply Balance',
      value: systemState ? `${(systemState.generationLoadBalance * 100).toFixed(2)}` : '---',
      unit: '%',
      trend: trends.balance,
      color: systemState ? getBalanceColor(systemState.generationLoadBalance) : 'text-slate-400',
      isActive: systemState ? Math.abs(1 - systemState.generationLoadBalance) > 0.05 : false,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-2">
      {metrics.map((metric, idx) => (
        <div 
          key={idx} 
          className={`gradient-border ${metric.isActive ? 'gradient-border-active' : ''} bg-slate-900/40 p-4 border border-slate-800/50 rounded-lg group hover:border-slate-700/50 transition-all duration-300`}
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
            <p className={`text-2xl font-mono font-black value-transition ${metric.color}`}>
              {metric.value}
            </p>
            <span className="text-[10px] font-bold text-slate-600 uppercase">{metric.unit}</span>
          </div>
          
          {/* Subtle sparkline placeholder or decorative element */}
          <div className="mt-3 h-[2px] w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-current ${metric.color} opacity-40 transition-all duration-1000 ease-in-out`}
              style={{ width: systemState ? '70%' : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
