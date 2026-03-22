'use client';

import React, { useRef, useEffect, useState } from 'react';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevCountRef = useRef(packets.length);

  // Auto-scroll to bottom when new packets arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && packets.length > prevCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = packets.length;
  }, [packets.length, autoScroll]);

  // Detect manual scroll — pause auto-scroll if user scrolls up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl w-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700 bg-zinc-800/50 flex justify-between items-center shrink-0">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          MQTT Live Log
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-500">{packets.length} packets</span>
          <button
            onClick={() => {
              setAutoScroll(!autoScroll);
              if (!autoScroll && scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border transition-all ${
              autoScroll
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
        </div>
      </div>

      {/* Log body — fills all remaining space */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto font-mono text-xs leading-relaxed bg-zinc-950/80 custom-scrollbar"
      >
        {packets.length === 0 ? (
          <div className="p-6 text-zinc-600 text-center">
            <div className="text-2xl mb-2">📡</div>
            Waiting for MQTT packets...
          </div>
        ) : (
          packets.map((pkt, i) => {
            const isAttacked = attackedBuses.has(pkt.busId);
            const busColor = BUS_COLORS[pkt.busId] || 'text-zinc-400';
            const time = new Date(pkt.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });

            return (
              <div
                key={`${pkt.timestamp}-${i}`}
                className={`flex items-center gap-2 px-3 py-1 border-b border-zinc-900/80 transition-colors ${
                  isAttacked ? 'bg-red-950/40 hover:bg-red-950/60' : 'hover:bg-zinc-900/50'
                }`}
              >
                <span className="text-zinc-600 w-[72px] shrink-0">{time}</span>
                <span className="text-zinc-600 shrink-0">Q{pkt.qos}</span>
                <span className={`shrink-0 w-[52px] font-bold ${busColor}`}>{pkt.busId}</span>
                <span className="text-zinc-500 truncate">{pkt.topic}</span>
                <span className="text-zinc-600 ml-auto shrink-0">{pkt.size}B</span>
                {isAttacked && (
                  <span className="text-red-400 font-bold animate-pulse shrink-0">!</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && packets.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }}
          className="shrink-0 w-full py-1.5 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-wider border-t border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
        >
          New packets below — click to scroll down
        </button>
      )}
    </div>
  );
}
