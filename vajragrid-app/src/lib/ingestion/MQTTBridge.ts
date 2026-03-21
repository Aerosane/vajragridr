/**
 * MQTTBridge — Embedded MQTT broker + subscriber for real-time IoT ingestion
 *
 * Architecture:
 *   1. Starts an Aedes MQTT broker in-process (port 1883)
 *   2. Subscribes to `scada/+/telemetry` topics
 *   3. Normalizes incoming MQTT payloads → GridTelemetry
 *   4. Feeds data into the IngestionEngine (same 4-layer detection pipeline)
 *   5. Publishes detection results back on `vajragrid/alerts/#`
 *
 * MQTT Topic Schema:
 *   scada/{busId}/telemetry   — RTU/PMU publishes voltage, freq, power, etc.
 *   scada/{busId}/status      — Equipment status (breaker, transformer)
 *   vajragrid/alerts/{busId}  — VajraGrid publishes detected threats
 *   vajragrid/shield/{busId}  — VajraGrid publishes healing actions
 *   vajragrid/system/state    — Aggregated system state
 *
 * In production, replace the embedded Aedes with an external broker
 * (EMQX, HiveMQ, Mosquitto) and point MQTT_BROKER_URL accordingly.
 */

import { Aedes } from 'aedes';
import { createServer, type Server } from 'net';
import mqtt, { type MqttClient } from 'mqtt';
import { ingestTelemetry } from './IngestionEngine';
import { publish as publishEvent } from '@/lib/events/EventBus';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AedesInstance = any;

interface MQTTBridgeState {
  broker: AedesInstance;
  tcpServer: Server | null;
  subscriber: MqttClient | null;
  running: boolean;
  stats: {
    messagesReceived: number;
    messagesPublished: number;
    connectedClients: number;
    lastMessageTime: string | null;
    startTime: string | null;
  };
}

const g = globalThis as unknown as { __vajraMQTT?: MQTTBridgeState };

function getState(): MQTTBridgeState {
  if (!g.__vajraMQTT) {
    g.__vajraMQTT = {
      broker: null,
      tcpServer: null,
      subscriber: null,
      running: false,
      stats: {
        messagesReceived: 0,
        messagesPublished: 0,
        connectedClients: 0,
        lastMessageTime: null,
        startTime: null,
      },
    };
  }
  return g.__vajraMQTT;
}

const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883', 10);
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtt://localhost:${MQTT_PORT}`;

/** Buffer to batch MQTT messages arriving within the same tick */
let ingestBuffer: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 1000; // Batch and ingest once per second

function flushBuffer() {
  if (ingestBuffer.length === 0) return;
  const batch = ingestBuffer;
  ingestBuffer = [];
  ingestTelemetry(batch);
}

/**
 * Start the embedded MQTT broker and subscriber.
 * Safe to call multiple times — idempotent.
 */
export async function startMQTTBridge(): Promise<{ port: number; url: string }> {
  const state = getState();
  if (state.running) return { port: MQTT_PORT, url: MQTT_BROKER_URL };

  // 1. Start embedded Aedes broker (v1.x uses async createBroker factory)
  const broker = await Aedes.createBroker();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcpServer = createServer((conn: any) => broker.handle(conn));

  await new Promise<void>((resolve, reject) => {
    tcpServer.listen(MQTT_PORT, () => {
      console.log(`[MQTT] Aedes broker listening on port ${MQTT_PORT}`);
      resolve();
    });
    tcpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[MQTT] Port ${MQTT_PORT} in use — connecting to external broker`);
        resolve(); // Will connect to external broker instead
      } else {
        reject(err);
      }
    });
  });

  // Track connected clients
  broker.on('client', () => { state.stats.connectedClients++; });
  broker.on('clientDisconnect', () => { state.stats.connectedClients = Math.max(0, state.stats.connectedClients - 1); });

  state.broker = broker;
  state.tcpServer = tcpServer;

  // 2. Subscribe to telemetry topics
  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: 'vajragrid-ingestion-bridge',
    clean: true,
    reconnectPeriod: 2000,
  });

  await new Promise<void>((resolve) => {
    client.on('connect', () => {
      console.log(`[MQTT] Bridge subscriber connected to ${MQTT_BROKER_URL}`);

      // Subscribe to all SCADA telemetry topics
      client.subscribe('scada/+/telemetry', { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe error:', err);
        else console.log('[MQTT] Subscribed to scada/+/telemetry');
      });

      client.subscribe('scada/+/status', { qos: 0 });
      resolve();
    });

    client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err.message);
      resolve(); // Don't block startup
    });
  });

  // 3. Handle incoming messages
  client.on('message', (topic, payload) => {
    state.stats.messagesReceived++;
    state.stats.lastMessageTime = new Date().toISOString();

    try {
      const data = JSON.parse(payload.toString());

      // Emit mqtt_packet event for live packet inspector
      publishEvent('mqtt_packet', {
        topic,
        busId: data.busId || topic.split('/')[1],
        timestamp: new Date().toISOString(),
        size: payload.length,
        qos: 1,
      });

      // Extract busId from topic: scada/{busId}/telemetry
      const topicParts = topic.split('/');
      if (topicParts[0] === 'scada' && topicParts[2] === 'telemetry') {
        const busId = topicParts[1];
        if (!data.busId) data.busId = busId;

        // Add to batch buffer
        ingestBuffer.push(data);

        // Start flush timer if not already running
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushBuffer();
          }, FLUSH_INTERVAL_MS);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  state.subscriber = client;
  state.running = true;
  state.stats.startTime = new Date().toISOString();

  // Publish bridge status to EventBus
  publishEvent('mqtt_status', getMQTTStatus());

  return { port: MQTT_PORT, url: MQTT_BROKER_URL };
}

/** Publish a message back to MQTT (alerts, shield events) */
export function publishToMQTT(topic: string, data: unknown) {
  const state = getState();
  if (!state.subscriber?.connected) return;
  state.subscriber.publish(topic, JSON.stringify(data), { qos: 0 });
  state.stats.messagesPublished++;
}

/** Stop the MQTT bridge */
export async function stopMQTTBridge() {
  const state = getState();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushBuffer();

  if (state.subscriber) {
    state.subscriber.end(true);
    state.subscriber = null;
  }
  if (state.broker) {
    state.broker.close();
    state.broker = null;
  }
  if (state.tcpServer) {
    state.tcpServer.close();
    state.tcpServer = null;
  }
  state.running = false;
  console.log('[MQTT] Bridge stopped');
}

/** Get MQTT bridge status for API/dashboard */
export function getMQTTStatus() {
  const state = getState();
  return {
    running: state.running,
    brokerPort: MQTT_PORT,
    brokerUrl: MQTT_BROKER_URL,
    subscriberConnected: state.subscriber?.connected ?? false,
    stats: { ...state.stats },
  };
}
