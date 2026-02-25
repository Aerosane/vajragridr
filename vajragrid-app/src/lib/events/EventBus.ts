/**
 * Server-side event bus — singleton via globalThis.
 * Pipeline publishes events here; SSE route subscribes and pushes to clients.
 */

type EventHandler = (type: string, data: unknown) => void;

interface EventBusState {
  listeners: Set<EventHandler>;
}

const g = globalThis as unknown as { __vajraEventBus?: EventBusState };

function getBus(): EventBusState {
  if (!g.__vajraEventBus) {
    g.__vajraEventBus = { listeners: new Set() };
  }
  return g.__vajraEventBus;
}

export function subscribe(handler: EventHandler): () => void {
  const bus = getBus();
  bus.listeners.add(handler);
  return () => { bus.listeners.delete(handler); };
}

export function publish(type: string, data: unknown) {
  const bus = getBus();
  for (const handler of bus.listeners) {
    try { handler(type, data); } catch { /* don't let one bad listener kill others */ }
  }
}
