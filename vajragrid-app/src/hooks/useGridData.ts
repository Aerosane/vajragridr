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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[VajraGrid] WebSocket connected');
    };

    ws.onmessage = (event) => {
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
        console.error('[VajraGrid] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[VajraGrid] WebSocket disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(() => connectRef.current?.(), 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const sendCommand = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  const startSimulation = useCallback(() => sendCommand('simulation:start'), [sendCommand]);
  const stopSimulation = useCallback(() => sendCommand('simulation:stop'), [sendCommand]);
  const resetSimulation = useCallback(() => sendCommand('simulation:reset'), [sendCommand]);
  const injectAttack = useCallback(
    (config: AttackConfig) => sendCommand('simulation:attack', config),
    [sendCommand]
  );
  const setSpeed = useCallback(
    (speed: number) => sendCommand('simulation:speed', speed),
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
