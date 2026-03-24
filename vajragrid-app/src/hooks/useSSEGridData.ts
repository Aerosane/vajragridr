'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { GridTelemetry, SystemState, ThreatAlert, SimulationState, AttackConfig, AttackType } from '@/lib/types';
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

export interface LiveAttack {
  type: AttackType;
  targetBus: string;
  intensity: number;
  startedAt: string;
  elapsedTicks: number;
}

export interface KillChainData {
  attacks: LiveAttack[];
  layers: { layer: string; triggered: boolean; count: number; timestamp: string; details: string }[];
  alertCount: number;
  shieldPhase: string | null;
  healed?: boolean;
}

export interface MQTTPacket {
  topic: string;
  busId: string;
  timestamp: string;
  size: number;
  qos: number;
}

const MAX_PACKETS = 50;

export function useSSEGridData() {
  const [telemetryHistory, setTelemetryHistory] = useState<Map<string, GridTelemetry[]>>(new Map());
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [shield, setShield] = useState<ShieldData | null>(null);
  const [liveAttacks, setLiveAttacks] = useState<LiveAttack[]>([]);
  const [killChain, setKillChain] = useState<KillChainData | null>(null);
  const [mqttPackets, setMqttPackets] = useState<MQTTPacket[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenAlertIds = useRef(new Set<string>());
  const healedRef = useRef(false);
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
                setAlerts((prev) => {
                  // Deduplicate: keep only latest alert per (threatCategory + affectedAsset combo)
                  const sig = `${alert.threatCategory}:${alert.affectedAssets?.sort().join(',')}`;
                  const filtered = prev.filter(a => {
                    const aSig = `${a.threatCategory}:${a.affectedAssets?.sort().join(',')}`;
                    return aSig !== sig;
                  });
                  return [alert, ...filtered].slice(0, 50);
                });
              }
              break;
            }

            case 'system_state':
              if (data) setSystemState(data as SystemState);
              break;

            case 'simulation_state':
              if (data) {
                const simData = data as SimulationState;
                setSimulationState(simData);
                // Clear stale alerts when simulation stops or has no active attacks
                if (!simData.running) {
                  setAlerts([]);
                  seenAlertIds.current.clear();
                }
              }
              break;

            case 'shield':
              if (data) setShield(data as ShieldData);
              break;

            case 'ingestion_attacks':
              if (Array.isArray(data)) setLiveAttacks(data as LiveAttack[]);
              break;

            case 'clear_alerts':
              setAlerts([]);
              seenAlertIds.current.clear();
              // Show "healed" state — preserve last killChain data with healed flag
              setKillChain(prev => prev ? { ...prev, healed: true } as KillChainData : null);
              healedRef.current = true;
              setTimeout(() => { healedRef.current = false; setKillChain(null); }, 12000);
              break;

            case 'kill_chain':
              // Don't overwrite the healed summary with stale async data
              if (data && !healedRef.current) setKillChain(data as KillChainData);
              break;

            case 'mqtt_packet':
              if (data) {
                setMqttPackets(prev => [data as MQTTPacket, ...prev].slice(0, MAX_PACKETS));
              }
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        console.error(`[VajraGrid] Action failed: ${endpoint} — HTTP ${res.status}`);
      }
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

  // Live/MQTT mode attack controls
  const liveInjectAttack = useCallback(
    (config: AttackConfig) => sendAction('/api/ingest/attack', config),
    [sendAction]
  );

  const liveRemoveAttack = useCallback(
    async (type: AttackType, targetBus?: string) => {
      try {
        const res = await fetch('/api/ingest/attack', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, targetBus }),
        });
        if (!res.ok) console.error(`[VajraGrid] Remove attack failed: HTTP ${res.status}`);
      } catch (err) {
        console.error('[VajraGrid] Remove attack failed:', err);
      }
    },
    []
  );

  const liveClearAttacks = useCallback(
    async () => {
      try {
        const res = await fetch('/api/ingest/attack', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearAll: true }),
        });
        if (!res.ok) console.error(`[VajraGrid] Clear attacks failed: HTTP ${res.status}`);
      } catch (err) {
        console.error('[VajraGrid] Clear attacks failed:', err);
      }
    },
    []
  );

  return {
    telemetryHistory,
    systemState,
    alerts,
    simulationState,
    shield,
    liveAttacks,
    killChain,
    mqttPackets,
    connected,
    error,
    startSimulation,
    stopSimulation,
    resetSimulation,
    injectAttack,
    liveInjectAttack,
    liveRemoveAttack,
    liveClearAttacks,
  };
}
