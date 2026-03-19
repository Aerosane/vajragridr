'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { GridTelemetry, SystemState, ThreatAlert, SimulationState, AttackConfig } from '@/lib/types';
import type { HealingEventDTO } from '@/lib/healing/SelfHealingEngine';

const MAX_HISTORY = 120;
const RECONNECT_DELAY = 2000;

export interface ShieldData {
  active: boolean;
  activeEvents: HealingEventDTO[];
  completedEvents: HealingEventDTO[];
  trippedBreakers: string[];
  isolatedBuses: string[];
  reroutedLines: string[];
}

export function useSSEGridData() {
  const [telemetryHistory, setTelemetryHistory] = useState<Map<string, GridTelemetry[]>>(new Map());
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [shield, setShield] = useState<ShieldData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenAlertIds = useRef(new Set<string>());
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;
      if (esRef.current) {
        esRef.current.close();
      }

      const es = new EventSource('/api/stream');
      esRef.current = es;

      es.onopen = () => {
        if (!active) return;
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        if (!active) return;
        try {
          const { type, data } = JSON.parse(event.data);

          switch (type) {
            case 'telemetry':
              if (Array.isArray(data) && data.length > 0) {
                setTelemetryHistory((prev) => {
                  const next = new Map(prev);
                  for (const t of data as GridTelemetry[]) {
                    const history = next.get(t.busId) || [];
                    next.set(t.busId, [...history, t].slice(-MAX_HISTORY));
                  }
                  return next;
                });
              }
              break;

            case 'alert': {
              const alert = data as ThreatAlert;
              if (!seenAlertIds.current.has(alert.id)) {
                seenAlertIds.current.add(alert.id);
                setAlerts((prev) => [alert, ...prev].slice(0, 100));
              }
              break;
            }

            case 'system_state':
              if (data) setSystemState(data as SystemState);
              break;

            case 'simulation_state':
              if (data) setSimulationState(data as SimulationState);
              break;

            case 'shield':
              if (data) setShield(data as ShieldData);
              break;
          }
        } catch {
          // Ignore parse errors (heartbeat comments, etc.)
        }
      };

      es.onerror = () => {
        if (!active) return;
        setConnected(false);
        setError('SSE connection lost — reconnecting...');
        es.close();
        esRef.current = null;
        // Reconnect after delay
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      active = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
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
    systemState,
    alerts,
    simulationState,
    shield,
    connected,
    error,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
  };
}
