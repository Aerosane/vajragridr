'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { GridTelemetry, SystemState, ThreatAlert, SimulationState, AttackConfig } from '@/lib/types';
import type { HealingEventDTO } from '@/lib/healing/SelfHealingEngine';

const MAX_HISTORY = 120;
const POLL_INTERVAL = 1000;

export interface ShieldData {
  active: boolean;
  activeEvents: HealingEventDTO[];
  completedEvents: HealingEventDTO[];
  trippedBreakers: string[];
  isolatedBuses: string[];
  reroutedLines: string[];
}

export function usePollingGridData() {
  const [telemetryHistory, setTelemetryHistory] = useState<Map<string, GridTelemetry[]>>(new Map());
  const [latestTelemetry, setLatestTelemetry] = useState<GridTelemetry[]>([]);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [shield, setShield] = useState<ShieldData | null>(null);
  const [connected, setConnected] = useState(false);
  const seenAlertIds = useRef(new Set<string>());

  // Poll for data
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch('/api/system/status');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        if (!active) return;
        setConnected(true);

        if (data.telemetry?.length) {
          setLatestTelemetry(data.telemetry);
          setTelemetryHistory((prev) => {
            const next = new Map(prev);
            for (const t of data.telemetry as GridTelemetry[]) {
              const history = next.get(t.busId) || [];
              const updated = [...history, t].slice(-MAX_HISTORY);
              next.set(t.busId, updated);
            }
            return next;
          });
        }

        if (data.systemState) {
          setSystemState(data.systemState);
        }

        if (data.simulationState) {
          setSimulationState(data.simulationState);
        }

        if (data.shield) {
          setShield(data.shield);
        }

        if (data.alerts?.length) {
          const newAlerts = (data.alerts as ThreatAlert[]).filter(
            (a) => !seenAlertIds.current.has(a.id)
          );
          for (const a of newAlerts) {
            seenAlertIds.current.add(a.id);
          }
          if (newAlerts.length > 0) {
            setAlerts((prev) => [...newAlerts, ...prev].slice(0, 500));
          }
        }
      } catch {
        setConnected(false);
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    poll(); // Initial fetch

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const sendAction = useCallback(async (endpoint: string, body?: unknown) => {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      console.error('[VajraGrid] Action failed:', err);
    }
  }, []);

  const startSimulation = useCallback(() => sendAction('/api/simulation/start'), [sendAction]);
  const stopSimulation = useCallback(() => sendAction('/api/simulation/stop'), [sendAction]);
  const resetSimulation = useCallback(() => sendAction('/api/simulation/reset'), [sendAction]);
  const injectAttack = useCallback(
    (config: AttackConfig) => sendAction('/api/simulation/attack', config),
    [sendAction]
  );

  return {
    telemetryHistory,
    latestTelemetry,
    systemState,
    alerts,
    simulationState,
    shield,
    connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
  };
}
