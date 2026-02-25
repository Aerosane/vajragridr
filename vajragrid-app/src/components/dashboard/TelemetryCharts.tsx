'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { GridTelemetry } from '@/lib/types';

interface TelemetryChartsProps {
  telemetryHistory: Map<string, GridTelemetry[]>;
}

const BUS_COLORS: Record<string, string> = {
  'BUS-001': '#06b6d4', // cyan-500
  'BUS-002': '#d946ef', // magenta-500
  'BUS-003': '#eab308', // yellow-500
  'BUS-004': '#22c55e', // green-500
  'BUS-005': '#f97316', // orange-500
};

export default function TelemetryCharts({ telemetryHistory }: TelemetryChartsProps) {
  const chartData = useMemo(() => {
    const buses = Array.from(telemetryHistory.keys());
    if (buses.length === 0) return [];

    // Assuming all buses have same length and synced timestamps
    const firstBusData = telemetryHistory.get(buses[0]) || [];
    const points = firstBusData.length;
    
    const data = [];
    for (let i = 0; i < points; i++) {
      const entry: Record<string, string | number> = {
        time: new Date(firstBusData[i].timestamp).toLocaleTimeString([], { hour12: false }),
        avgFreq: 0,
      };
      
      let freqSum = 0;
      let count = 0;

      for (const busId of buses) {
        const busHistory = telemetryHistory.get(busId);
        if (busHistory && busHistory[i]) {
          entry[`voltage_${busId}`] = busHistory[i].voltage;
          entry[`power_${busId}`] = busHistory[i].activePower;
          freqSum += busHistory[i].frequency;
          count++;
        }
      }
      
      entry.avgFreq = count > 0 ? freqSum / count : 0;
      data.push(entry);
    }
    
    return data.slice(-120);
  }, [telemetryHistory]);

  const buses = Array.from(telemetryHistory.keys());

  return (
    <div className="flex flex-col gap-6 p-4 bg-slate-900/50 rounded-lg">
      <ChartContainer title="Voltage Levels (kV) — Per Bus">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" hide />
          <YAxis domain={[200, 260]} stroke="#94a3b8" fontSize={10} />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
          <Legend />
          {buses.map((busId) => (
            <Line
              key={busId}
              type="monotone"
              dataKey={`voltage_${busId}`}
              name={busId}
              stroke={BUS_COLORS[busId] || '#fff'}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <ChartContainer title="System Frequency (Hz)">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" hide />
          <YAxis domain={[49, 51]} stroke="#94a3b8" fontSize={10} />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
          <Line
            type="monotone"
            dataKey="avgFreq"
            name="System Avg"
            stroke="#f87171"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      <ChartContainer title="Active Power (MW) — Per Bus">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" hide />
          <YAxis stroke="#94a3b8" fontSize={10} />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
          <Legend />
          {buses.map((busId) => (
            <Line
              key={busId}
              type="monotone"
              dataKey={`power_${busId}`}
              name={busId}
              stroke={BUS_COLORS[busId] || '#fff'}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function ChartContainer({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="w-full h-64 bg-slate-950/50 p-4 border border-slate-700 rounded shadow-inner">
      <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-widest">{title}</h3>
      <div className="w-full h-48 min-w-[200px] min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={150}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
