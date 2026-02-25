'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { GridTelemetry, SystemState, ThreatAlert, SimulationState, AttackConfig } from '@/lib/types';

const MAX_HISTORY = 120;

export function useGridData() {
  const [telemetryHistory, setTelemetryHistory] = useState<Map<string, GridTelemetry[]>>(new Map());
  const [latestTelemetry, setLatestTelemetry] = useState<GridTelemetry[]>([]);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      console.log('[VajraGrid] SSE connected');
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'telemetry': {
            const busData = msg.data as GridTelemetry[];
            setLatestTelemetry(busData);
            setTelemetryHistory((prev) => {
              const next = new Map(prev);
              for (const t of busData) {
                const history = next.get(t.busId) || [];
                const updated = [...history, t].slice(-MAX_HISTORY);
                next.set(t.busId, updated);
              }
              return next;
            });
            break;
          }
          case 'system_state':
            setSystemState(msg.data as SystemState);
            break;
          case 'alert':
            setAlerts((prev) => [msg.data as ThreatAlert, ...prev].slice(0, 500));
            break;
          case 'simulation_state':
            setSimulationState(msg.data as SimulationState);
            break;
        }
      } catch (err) {
        console.error('[VajraGrid] Failed to parse SSE message:', err);
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      console.log('[VajraGrid] SSE disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(() => connectRef.current?.(), 2000);
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // Commands go via REST (SSE is server→client only)
  const sendCommand = useCallback(async (endpoint: string, body?: unknown) => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    } catch (err) {
      console.error(`[VajraGrid] Command failed: ${endpoint}`, err);
    }
  }, []);

  const startSimulation = useCallback(() => sendCommand('/api/simulation/start'), [sendCommand]);
  const stopSimulation = useCallback(() => sendCommand('/api/simulation/stop'), [sendCommand]);
  const resetSimulation = useCallback(() => sendCommand('/api/simulation/reset'), [sendCommand]);
  const injectAttack = useCallback(
    (config: AttackConfig) => sendCommand('/api/simulation/attack', config),
    [sendCommand]
  );
  const setSpeed = useCallback(
    (speed: number) => sendCommand('/api/simulation/speed', { speed }),
    [sendCommand]
  );

  return {
    telemetryHistory,
    latestTelemetry,
    systemState,
    alerts,
    simulationState,
    connected,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
    setSpeed,
  };
}
