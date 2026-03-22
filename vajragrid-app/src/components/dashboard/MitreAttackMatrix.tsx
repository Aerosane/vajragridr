'use client';

import React from 'react';
import type { ThreatAlert } from '@/lib/types';

// MITRE ATT&CK for ICS Matrix — subset covering VajraGrid's attack detection
const TACTICS = [
  { id: 'TA0108', name: 'Initial Access', techniques: ['T0817', 'T0859'] },
  { id: 'TA0104', name: 'Execution', techniques: ['T0807', 'T0823'] },
  { id: 'TA0110', name: 'Persistence', techniques: ['T0839'] },
  { id: 'TA0111', name: 'Evasion', techniques: ['T0820', 'T0830'] },
  { id: 'TA0109', name: 'Collection', techniques: ['T0801', 'T0831'] },
  { id: 'TA0040', name: 'Impact', techniques: ['T0816', 'T0826', 'T0831'] },
];

const TECHNIQUES: Record<string, { name: string; attacks: string[] }> = {
  'T0817': { name: 'Drive-by Compromise', attacks: [] },
  'T0859': { name: 'Valid Accounts', attacks: ['COMMAND_SPOOF'] },
  'T0807': { name: 'Command-Line Interface', attacks: [] },
  'T0823': { name: 'Graphical UI', attacks: [] },
  'T0839': { name: 'Modify Parameter', attacks: ['SENSOR_TAMPER'] },
  'T0820': { name: 'Exploitation of Trusted App', attacks: [] },
  'T0830': { name: 'Man-in-the-Middle', attacks: ['FDI'] },
  'T0801': { name: 'Monitor Process State', attacks: [] },
  'T0831': { name: 'Data Manipulation', attacks: ['MADIOT', 'LOAD_MANIPULATION'] },
  'T0816': { name: 'Device Deletion', attacks: ['METER_ATTACK'] },
  'T0826': { name: 'Loss of Availability', attacks: ['COMMAND_SPOOF'] },
};

interface Props {
  alerts: ThreatAlert[];
}

export default function MitreAttackMatrix({ alerts }: Props) {
  // Build set of active MITRE technique IDs from current alerts
  const activeTactics = new Set<string>();
  const activeTechniques = new Set<string>();

  for (const alert of alerts) {
    const id = alert.mitreTactic?.match(/T\d{4}|TA\d{4}/)?.[0];
    if (id) {
      activeTechniques.add(id);
      // Find parent tactic
      for (const tactic of TACTICS) {
        if (tactic.techniques.includes(id) || tactic.id === id) {
          activeTactics.add(tactic.id);
        }
      }
    }
    // Also match by threat category
    const cat = alert.threatCategory;
    for (const [techId, tech] of Object.entries(TECHNIQUES)) {
      if (tech.attacks.includes(cat)) {
        activeTechniques.add(techId);
        for (const tactic of TACTICS) {
          if (tactic.techniques.includes(techId)) activeTactics.add(tactic.id);
        }
      }
    }
  }

  const hasActive = activeTechniques.size > 0;

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-[0.15em] text-zinc-300">🎯 MITRE ATT&CK for ICS</span>
          {hasActive && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
              {activeTechniques.size} MATCHED
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {TACTICS.map(tactic => {
          const isActive = activeTactics.has(tactic.id);
          return (
            <div key={tactic.id} className="space-y-1">
              {/* Tactic header */}
              <div className={`text-[10px] font-bold uppercase text-center py-1 rounded transition-all ${
                isActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-800/50 text-zinc-500 border border-zinc-800'
              }`}>
                {tactic.name}
              </div>
              {/* Techniques */}
              {tactic.techniques.map(techId => {
                const tech = TECHNIQUES[techId];
                if (!tech) return null;
                const isTechActive = activeTechniques.has(techId);
                return (
                  <div
                    key={techId}
                    className={`text-[10px] px-1 py-1 rounded text-center transition-all ${
                      isTechActive
                        ? 'bg-red-500/30 text-red-300 border border-red-500/40 ring-1 ring-red-500/20'
                        : 'bg-slate-800/30 text-zinc-500 border border-slate-800/50'
                    }`}
                    title={`${techId}: ${tech.name}`}
                  >
                    <div className="font-mono font-bold">{techId}</div>
                    <div className="truncate">{tech.name}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {!hasActive && (
        <div className="text-xs text-zinc-400 font-mono text-center mt-2">
          No active attack coverage — inject an attack to see mapping
        </div>
      )}
    </div>
  );
}
