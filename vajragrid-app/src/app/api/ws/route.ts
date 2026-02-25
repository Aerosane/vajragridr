import { SimulationEngine } from '@/lib/simulation/SimulationEngine';
import { runRules } from '@/lib/detection/RuleEngine';
import { runPhysicsChecks } from '@/lib/detection/PhysicsEngine';
import { StatisticalDetector } from '@/lib/detection/StatisticalEngine';
import { classifyThreats } from '@/lib/detection/AlertClassifier';
import type { GridTelemetry, ThreatAlert } from '@/lib/types';

// Server-side simulation + detection state (shared across connections)
const engine = new SimulationEngine();
const statDetector = new StatisticalDetector();
const previousReadings = new Map<string, GridTelemetry>();
const clients = new Set<WebSocket>();
let initialized = false;

function broadcast(type: string, data: unknown) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(msg);
    }
  }
}

function initEngine() {
  if (initialized) return;
  initialized = true;

  engine.setCallbacks({
    onTelemetry: (telemetry: GridTelemetry[]) => {
      broadcast('telemetry', telemetry);

      // Run detection pipeline
      const allRuleViolations = [];
      for (const t of telemetry) {
        const prev = previousReadings.get(t.busId) || null;
        const violations = runRules(t, prev);
        allRuleViolations.push(...violations);
        previousReadings.set(t.busId, t);
        statDetector.addSample(t.busId, t);
      }

      const physicsViolations = runPhysicsChecks(telemetry);

      // Gather statistical results
      const anomalies = [];
      const cusumAlerts = [];
      const correlations = new Map<string, number>();

      for (const t of telemetry) {
        anomalies.push(...statDetector.getZScoreAnomalies(t.busId));
        cusumAlerts.push(...statDetector.getCUSUM(t.busId));
      }

      // Check correlations between adjacent buses
      const busPairs = [
        ['BUS-001', 'BUS-003'], ['BUS-001', 'BUS-002'],
        ['BUS-002', 'BUS-004'], ['BUS-003', 'BUS-005'],
        ['BUS-004', 'BUS-005'], ['BUS-002', 'BUS-003'],
      ];
      for (const [b1, b2] of busPairs) {
        const corr = statDetector.getCrossCorrelation(b1, b2);
        correlations.set(`${b1}-${b2}`, corr);
      }

      const alerts: ThreatAlert[] = classifyThreats(
        allRuleViolations,
        physicsViolations,
        { anomalies, cusumAlerts, correlations },
        telemetry
      );

      for (const alert of alerts) {
        broadcast('alert', alert);
      }
    },
    onSystemState: (state) => {
      broadcast('system_state', state);
    },
    onStateChange: (state) => {
      broadcast('simulation_state', state);
    },
  });
}

export function GET(req: Request) {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = req.headers.get('upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  initEngine();

  // @ts-expect-error — Next.js experimental WebSocket support
  const { socket, response } = Deno?.upgradeWebSocket?.(req) ?? upgradeWebSocket(req);

  socket.onopen = () => {
    clients.add(socket);
    // Send current state on connect
    socket.send(JSON.stringify({ type: 'simulation_state', data: engine.getState() }));
  };

  socket.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'simulation:start':
          engine.start();
          break;
        case 'simulation:stop':
          engine.stop();
          break;
        case 'simulation:reset':
          engine.reset();
          break;
        case 'simulation:attack':
          engine.injectAttack(msg.data);
          break;
        case 'simulation:speed':
          engine.setSpeed(msg.data);
          break;
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  };

  socket.onclose = () => {
    clients.delete(socket);
  };

  return response;
}
