/**
 * VajraShield — Autonomous Self-Healing Grid Engine
 *
 * FLISR: Fault Location, Isolation, Service Restoration
 *
 * When a CRITICAL/HIGH alert is detected:
 *   DETECTING  → Threat confirmed, assess scope
 *   ISOLATING  → Trip breakers on compromised bus lines
 *   REROUTING  → Redistribute load through alternate topology paths
 *   MONITORING → Verify attack contained, watch for persistence
 *   RESTORING  → Re-close breakers, normalize power flow
 *   RESTORED   → Fully healed
 */

import type {
  ThreatAlert,
  HealingPhase,
  HealingAction,
  HealingEvent,
} from '@/lib/types';
import { GRID_TOPOLOGY, getLinesForBus, getAdjacentBuses } from '@/lib/constants/gridConfig';

// Phase durations in ticks (1 tick = 1 second)
const PHASE_TICKS: Record<HealingPhase, number> = {
  DETECTING: 10,   // Confirm threat persists before isolating
  ISOLATING: 2,
  REROUTING: 2,
  MONITORING: 8,
  RESTORING: 3,
  RESTORED: 0,
};

// Serializable healing event (no Map/Set for JSON transport)
export interface HealingEventDTO {
  id: string;
  triggeredBy: string;
  affectedBus: string;
  phase: HealingPhase;
  startTime: string;
  lastUpdate: string;
  actions: HealingAction[];
  isolatedLines: string[];
  reroutedPaths: string[];
  loadRedistribution: Record<string, number>;
  ticksInPhase: number;
  totalDurationMs: number;
}

interface ShieldState {
  activeEvents: Map<string, HealingEvent>;
  completedEvents: HealingEventDTO[];
  trippedBreakers: Set<string>;    // Line IDs
  isolatedBuses: Set<string>;      // Bus IDs
  reroutedLines: Set<string>;      // Line IDs carrying extra load
  enabled: boolean;
  alertConfirmations: Map<string, number>; // busId → consecutive ticks with CRIT/HIGH
}

/** Consecutive alert ticks required before creating a healing event */
const ALERT_CONFIRM_TICKS = 3;

const g = globalThis as unknown as { __vajraShield?: ShieldState };

function getState(): ShieldState {
  if (!g.__vajraShield) {
    g.__vajraShield = {
      activeEvents: new Map(),
      completedEvents: [],
      trippedBreakers: new Set(),
      isolatedBuses: new Set(),
      reroutedLines: new Set(),
      enabled: true,
      alertConfirmations: new Map(),
    };
  }
  return g.__vajraShield;
}

/** Find alternate lines that can carry rerouted power around an isolated bus */
function findAlternatePaths(isolatedBus: string): string[] {
  const adjacentBuses = getAdjacentBuses(isolatedBus);
  const alternateLines: string[] = [];

  // Find lines between adjacent buses that don't touch the isolated bus
  for (const line of GRID_TOPOLOGY.lines) {
    if (line.fromBus !== isolatedBus && line.toBus !== isolatedBus) {
      // This line doesn't touch the compromised bus — it's an alternate path
      if (adjacentBuses.includes(line.fromBus) || adjacentBuses.includes(line.toBus)) {
        alternateLines.push(line.id);
      }
    }
  }

  // Also include any lines between non-isolated adjacent buses
  for (let i = 0; i < adjacentBuses.length; i++) {
    for (let j = i + 1; j < adjacentBuses.length; j++) {
      const connecting = GRID_TOPOLOGY.lines.find(
        l => (l.fromBus === adjacentBuses[i] && l.toBus === adjacentBuses[j]) ||
             (l.fromBus === adjacentBuses[j] && l.toBus === adjacentBuses[i])
      );
      if (connecting && !alternateLines.includes(connecting.id)) {
        alternateLines.push(connecting.id);
      }
    }
  }

  return alternateLines;
}

/** Calculate how load from isolated bus is redistributed to neighbors */
function computeLoadRedistribution(isolatedBus: string): Map<string, number> {
  const busConfig = GRID_TOPOLOGY.buses.find(b => b.id === isolatedBus);
  if (!busConfig) return new Map();

  const isolatedLoad = busConfig.ratedLoad || 0;
  if (isolatedLoad === 0) return new Map();

  const neighbors = getAdjacentBuses(isolatedBus);
  // Distribute proportionally based on line capacity
  const totalCapacity = neighbors.reduce((sum, nId) => {
    const line = GRID_TOPOLOGY.lines.find(
      l => (l.fromBus === isolatedBus && l.toBus === nId) ||
           (l.fromBus === nId && l.toBus === isolatedBus)
    );
    return sum + (line?.capacity || 0);
  }, 0);

  const redistribution = new Map<string, number>();
  for (const nId of neighbors) {
    const line = GRID_TOPOLOGY.lines.find(
      l => (l.fromBus === isolatedBus && l.toBus === nId) ||
           (l.fromBus === nId && l.toBus === isolatedBus)
    );
    const share = totalCapacity > 0 ? (line?.capacity || 0) / totalCapacity : 1 / neighbors.length;
    redistribution.set(nId, isolatedLoad * share);
  }

  return redistribution;
}

function addAction(event: HealingEvent, phase: HealingPhase, action: string, target: string, detail: string) {
  event.actions.push({
    timestamp: new Date().toISOString(),
    phase,
    action,
    targetAsset: target,
    detail,
  });
  event.lastUpdate = new Date().toISOString();
}

function toDTO(event: HealingEvent): HealingEventDTO {
  return {
    id: event.id,
    triggeredBy: event.triggeredBy,
    affectedBus: event.affectedBus,
    phase: event.phase,
    startTime: event.startTime,
    lastUpdate: event.lastUpdate,
    actions: event.actions,
    isolatedLines: event.isolatedLines,
    reroutedPaths: event.reroutedPaths,
    loadRedistribution: Object.fromEntries(event.loadRedistribution),
    ticksInPhase: event.ticksInPhase,
    totalDurationMs: event.totalDurationMs,
  };
}

// ─── Public API ──────────────────────────────────────────────────────

/** Process new alerts — triggers healing for CRITICAL/HIGH threats after confirmation */
export function processAlerts(alerts: ThreatAlert[]) {
  const state = getState();
  if (!state.enabled) return;

  // Track which buses have alerts THIS tick
  const busesAlertedThisTick = new Set<string>();

  for (const alert of alerts) {
    if (alert.severity !== 'CRITICAL' && alert.severity !== 'HIGH') continue;
    for (const busId of alert.affectedAssets) {
      busesAlertedThisTick.add(busId);
    }
  }

  // Increment confirmation counter for alerted buses, reset for non-alerted
  for (const busId of busesAlertedThisTick) {
    const count = (state.alertConfirmations.get(busId) || 0) + 1;
    state.alertConfirmations.set(busId, count);
  }
  for (const [busId] of state.alertConfirmations) {
    if (!busesAlertedThisTick.has(busId)) {
      state.alertConfirmations.delete(busId);
    }
  }

  // Only create healing events for buses with sustained alerts
  for (const alert of alerts) {
    if (alert.severity !== 'CRITICAL' && alert.severity !== 'HIGH') continue;

    for (const busId of alert.affectedAssets) {
      if (state.activeEvents.has(busId)) continue;
      if (state.isolatedBuses.has(busId)) continue;

      const confirmCount = state.alertConfirmations.get(busId) || 0;
      if (confirmCount < ALERT_CONFIRM_TICKS) continue;

      const event: HealingEvent = {
        id: `heal-${busId}-${Date.now()}`,
        triggeredBy: alert.id,
        affectedBus: busId,
        phase: 'DETECTING',
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        actions: [],
        isolatedLines: [],
        reroutedPaths: [],
        loadRedistribution: new Map(),
        ticksInPhase: 0,
        totalDurationMs: 0,
      };

      addAction(event, 'DETECTING', 'Threat detected', busId,
        `${alert.severity} ${alert.threatCategory} alert on ${busId} confirmed over ${confirmCount} ticks. Initiating VajraShield response.`);

      state.activeEvents.set(busId, event);
    }
  }
}

/** Advance all active healing events by one tick — called every simulation tick */
export function tickHealing() {
  const state = getState();

  for (const [busId, event] of state.activeEvents) {
    event.ticksInPhase++;
    event.totalDurationMs += 1000;

    const requiredTicks = PHASE_TICKS[event.phase];

    if (event.ticksInPhase >= requiredTicks) {
      // Advance to next phase
      event.ticksInPhase = 0;

      switch (event.phase) {
        case 'DETECTING': {
          event.phase = 'ISOLATING';
          // Trip breakers on all lines connected to affected bus
          const lines = getLinesForBus(busId);
          for (const line of lines) {
            state.trippedBreakers.add(line.id);
            event.isolatedLines.push(line.id);
          }
          state.isolatedBuses.add(busId);
          addAction(event, 'ISOLATING', 'Breakers tripped', busId,
            `Tripped ${lines.length} breakers: ${lines.map(l => l.id).join(', ')}. Bus ${busId} isolated from grid.`);
          break;
        }

        case 'ISOLATING': {
          event.phase = 'REROUTING';
          // Find alternate paths and redistribute load
          const altPaths = findAlternatePaths(busId);
          const redistribution = computeLoadRedistribution(busId);

          event.reroutedPaths = altPaths;
          event.loadRedistribution = redistribution;

          for (const lineId of altPaths) {
            state.reroutedLines.add(lineId);
          }

          const redistEntries = Array.from(redistribution.entries())
            .map(([bid, mw]) => `${bid}: +${mw.toFixed(1)}MW`)
            .join(', ');
          addAction(event, 'REROUTING', 'Load redistributed', busId,
            `Power rerouted via ${altPaths.join(', ')}. Load redistribution: ${redistEntries}`);
          break;
        }

        case 'REROUTING': {
          event.phase = 'MONITORING';
          addAction(event, 'MONITORING', 'Monitoring containment', busId,
            `Attack contained. Monitoring ${busId} for ${PHASE_TICKS.MONITORING}s before restoration.`);
          break;
        }

        case 'MONITORING': {
          event.phase = 'RESTORING';
          // Begin re-closing breakers
          addAction(event, 'RESTORING', 'Restoring breakers', busId,
            `Threat neutralized. Re-closing breakers on ${event.isolatedLines.join(', ')}.`);
          break;
        }

        case 'RESTORING': {
          event.phase = 'RESTORED';
          // Clear isolation state
          for (const lineId of event.isolatedLines) {
            state.trippedBreakers.delete(lineId);
          }
          for (const lineId of event.reroutedPaths) {
            state.reroutedLines.delete(lineId);
          }
          state.isolatedBuses.delete(busId);

          addAction(event, 'RESTORED', 'Grid healed', busId,
            `VajraShield restored ${busId} in ${(event.totalDurationMs / 1000).toFixed(0)}s. All breakers closed, power flow normalized.`);

          // Move to completed
          state.completedEvents.unshift(toDTO(event));
          if (state.completedEvents.length > 20) state.completedEvents.pop();
          state.activeEvents.delete(busId);
          break;
        }
      }
    }
  }
}

/** Get current shield state for API responses */
export function getShieldStatus(): {
  active: boolean;
  activeEvents: HealingEventDTO[];
  completedEvents: HealingEventDTO[];
  trippedBreakers: string[];
  isolatedBuses: string[];
  reroutedLines: string[];
} {
  const state = getState();
  return {
    active: state.enabled,
    activeEvents: Array.from(state.activeEvents.values()).map(toDTO),
    completedEvents: state.completedEvents,
    trippedBreakers: Array.from(state.trippedBreakers),
    isolatedBuses: Array.from(state.isolatedBuses),
    reroutedLines: Array.from(state.reroutedLines),
  };
}

/** Check if a specific line has a tripped breaker */
export function isBreakerTripped(lineId: string): boolean {
  return getState().trippedBreakers.has(lineId);
}

/** Check if a bus is currently isolated */
export function isBusIsolated(busId: string): boolean {
  return getState().isolatedBuses.has(busId);
}

/** Check if a line is carrying rerouted power */
export function isLineRerouted(lineId: string): boolean {
  return getState().reroutedLines.has(lineId);
}

/** Toggle shield on/off */
export function setShieldEnabled(enabled: boolean) {
  getState().enabled = enabled;
}

/** Reset all healing state */
export function resetShield() {
  const state = getState();
  state.activeEvents.clear();
  state.completedEvents = [];
  state.trippedBreakers.clear();
  state.isolatedBuses.clear();
  state.reroutedLines.clear();
  state.alertConfirmations.clear();
  state.enabled = true;
}
