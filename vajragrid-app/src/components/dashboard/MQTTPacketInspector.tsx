'use client';

import React from 'react';
import type { MQTTPacket } from '@/hooks/useSSEGridData';
import type { LiveAttack } from '@/hooks/useSSEGridData';

interface Props {
  packets: MQTTPacket[];
  liveAttacks: LiveAttack[];
}

const BUS_COLORS: Record<string, string> = {
  'BUS-001': 'text-emerald-400',
  'BUS-002': 'text-yellow-400',
  'BUS-003': 'text-cyan-400',
  'BUS-004': 'text-purple-400',
  'BUS-005': 'text-orange-400',
};

export default function MQTTPacketInspector({ packets, liveAttacks }: Props) {
  const attackedBuses = new Set(liveAttacks.map(a => a.targetBus));

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl w-full">
      <div className="px-3 sm:px-6 py-3 border-b border-slate-700 bg-zinc-800/50 flex justify-between items-center">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          MQTT Inspector
        </h2>

        <span className="text-xs font-mono text-slate-600">{packets.length} packets</span>
      </div>

      <div className="h-48 overflow-y-auto font-mono text-xs leading-relaxed bg-zinc-950/80">
        {packets.length === 0 ? (
          <div className="p-4 text-slate-600 text-center">Waiting for MQTT packets...</div>
        ) : (
          packets.map((pkt, i) => {
            const isAttacked = attackedBuses.has(pkt.busId);
            const busColor = BUS_COLORS[pkt.busId] || 'text-slate-400';
            const time = new Date(pkt.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });

            return (
              <div
                key={`${pkt.timestamp}-${i}`}
                className={`flex items-center gap-2 px-3 py-1 border-b border-slate-900 transition-colors ${
                  isAttacked ? 'bg-red-950/40 hover:bg-red-950/60' : 'hover:bg-slate-900/50'
                }`}
              >
                <span className="text-slate-700 w-[72px] shrink-0">{time}</span>
                <span className="text-slate-600 shrink-0">Q{pkt.qos}</span>
                <span className={`shrink-0 w-[52px] font-bold ${busColor}`}>{pkt.busId.replace('BUS-', 'B')}</span>
                <span className="text-slate-600 truncate">{pkt.topic}</span>
                <span className="text-slate-700 ml-auto shrink-0">{pkt.size}B</span>
                {isAttacked && (
                  <span className="text-red-400 font-bold animate-pulse shrink-0">⚠</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
