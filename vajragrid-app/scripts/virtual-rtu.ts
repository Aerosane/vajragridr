/**
 * Virtual RTU Simulator — 5 simulated substation RTUs publishing over MQTT
 *
 * Each virtual RTU publishes to: scada/{busId}/telemetry
 *
 * This simulates what real SCADA Remote Terminal Units do:
 *   - Poll sensors every 1 second
 *   - Publish JSON telemetry to MQTT broker
 *   - Include realistic noise, daily load curves, solar generation
 *
 * Usage:
 *   pnpm run rtu          # Start 5 virtual RTUs
 *   pnpm run rtu:attack   # Start RTUs + inject FDI attack on BUS-003 after 30s
 *
 * To connect real hardware, replace this script with:
 *   - Modbus TCP poller → MQTT publisher (for real RTUs)
 *   - IEEE C37.118 decoder → MQTT publisher (for real PMUs)
 *   - DLMS/COSEM reader → MQTT publisher (for smart meters)
 */

import mqtt from 'mqtt';

// ─── Grid Configuration ──────────────────────────────────────────

const BUSES = [
  { id: 'BUS-001', name: 'Indrapura',     type: 'SLACK',   ratedGen: 150, ratedLoad: 0,  meters: 0,     source: 'PMU' },
  { id: 'BUS-002', name: 'Vajra Solar',   type: 'PV_GEN',  ratedGen: 80,  ratedLoad: 0,  meters: 0,     source: 'PMU' },
  { id: 'BUS-003', name: 'Shakti Nagar',  type: 'PQ_LOAD', ratedGen: 0,   ratedLoad: 85, meters: 52000, source: 'RTU' },
  { id: 'BUS-004', name: 'Kavach Grid',   type: 'PQ_LOAD', ratedGen: 0,   ratedLoad: 60, meters: 15000, source: 'RTU' },
  { id: 'BUS-005', name: 'Sudarshan Hub', type: 'PQ_LOAD', ratedGen: 0,   ratedLoad: 45, meters: 28000, source: 'RTU' },
];

const LINES = [
  { id: 'TL-01', from: 'BUS-001', to: 'BUS-003', capacity: 200 },
  { id: 'TL-02', from: 'BUS-001', to: 'BUS-002', capacity: 150 },
  { id: 'TL-03', from: 'BUS-002', to: 'BUS-004', capacity: 100 },
  { id: 'TL-04', from: 'BUS-003', to: 'BUS-005', capacity: 100 },
  { id: 'TL-05', from: 'BUS-004', to: 'BUS-005', capacity: 80 },
  { id: 'TL-06', from: 'BUS-002', to: 'BUS-003', capacity: 150 },
];

// ─── Physics Models ──────────────────────────────────────────────

function getLoadFactor(hour: number): number {
  const base = 0.3;
  const morning = 0.25 * Math.max(0, Math.sin(((hour - 5) * Math.PI) / 8));
  const evening = 0.40 * Math.exp(-0.5 * Math.pow((hour - 19) / 2.5, 2));
  const midday = 0.15 * Math.exp(-0.5 * Math.pow((hour - 12) / 4, 2));
  return Math.min(1.0, base + morning + evening + midday);
}

function getSolarFactor(hour: number): number {
  if (hour < 6 || hour > 18) return 0;
  return Math.sin(((hour - 6) * Math.PI) / 12) * (0.85 + Math.random() * 0.15);
}

function noise(base: number, pct: number): number {
  return base * (1 + (Math.random() - 0.5) * 2 * pct);
}

// ─── Attack Injection ────────────────────────────────────────────

let attackMode: string | null = null;
const attackTarget = 'BUS-003';
let attackTick = 0;

function applyAttack(busId: string, telemetry: Record<string, unknown>): Record<string, unknown> {
  if (!attackMode || busId !== attackTarget) return telemetry;
  attackTick++;

  switch (attackMode) {
    case 'FDI': {
      // Gradually manipulate voltage and power readings
      const ramp = Math.min(1, attackTick / 20);
      telemetry.voltage = (telemetry.voltage as number) + 25 * ramp;
      telemetry.activePower = (telemetry.activePower as number) * (1 + 0.5 * ramp);
      telemetry.dataQuality = 'SUSPECT';
      break;
    }
    case 'COMMAND_SPOOF': {
      telemetry.breakerStatus = 'TRIP';
      break;
    }
    case 'MADIOT': {
      // Coordinated load surge
      telemetry.activePower = (telemetry.activePower as number) * (1.4 + 0.3 * Math.random());
      break;
    }
  }
  return telemetry;
}

// ─── RTU Telemetry Generator ─────────────────────────────────────

let sequenceNumber = 0;

function generateBusTelemetry(bus: typeof BUSES[0]): Record<string, unknown> {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const loadFactor = getLoadFactor(hour);
  const solarFactor = getSolarFactor(hour);
  sequenceNumber++;

  const isGen = bus.type === 'SLACK' || bus.type === 'PV_GEN';
  const isSolar = bus.type === 'PV_GEN';

  let activePower: number;
  if (bus.type === 'SLACK') {
    const totalLoad = BUSES.filter(b => b.type === 'PQ_LOAD').reduce((s, b) => s + b.ratedLoad * loadFactor, 0);
    const solarGen = BUSES.filter(b => b.type === 'PV_GEN').reduce((s, b) => s + b.ratedGen * solarFactor, 0);
    activePower = noise(totalLoad - solarGen + totalLoad * 0.03, 0.02);
  } else if (isSolar) {
    activePower = noise(bus.ratedGen * solarFactor, 0.05);
  } else {
    activePower = -noise(bus.ratedLoad * loadFactor, 0.03);
  }

  const voltage = noise(230, 0.008);
  const frequency = noise(50.0, 0.0003);
  const reactivePower = activePower * noise(0.25, 0.2);
  const current = Math.abs(activePower * 1000) / (Math.sqrt(3) * voltage);
  const powerFactor = noise(0.92, 0.03);
  const phaseAngle = isGen ? noise(0, 5) : noise(-10, 0.3);

  // Line flows
  const busLines = LINES.filter(l => l.from === bus.id || l.to === bus.id);
  const lineFlows = busLines.map(line => {
    const dir = line.from === bus.id ? 1 : -1;
    const flow = (Math.abs(activePower) / Math.max(busLines.length, 1)) * dir;
    return {
      lineId: line.id,
      fromBus: line.from,
      toBus: line.to,
      activePowerFlow: noise(flow, 0.05),
      reactivePowerFlow: noise(flow * 0.3, 0.1),
      current: Math.abs(flow * 1000) / (Math.sqrt(3) * voltage),
      loadingPercent: Math.min(100, (Math.abs(flow) / line.capacity) * 100),
      losses: Math.abs(flow) * 0.001,
    };
  });

  let telemetry: Record<string, unknown> = {
    busId: bus.id,
    timestamp: now.toISOString(),
    sequenceNumber,
    voltage,
    frequency,
    phaseAngle,
    activePower,
    reactivePower,
    current,
    powerFactor,
    lineFlows,
    transformerTemp: noise(45, 0.15),
    breakerStatus: 'CLOSED',
    meterCount: bus.meters,
    meterConsumption: bus.type === 'PQ_LOAD' ? bus.ratedLoad * loadFactor * 0.9 : 0,
    dataQuality: 'GOOD',
    source: bus.source,
  };

  // Apply attack if active
  telemetry = applyAttack(bus.id, telemetry);

  return telemetry;
}

// ─── Main: Connect + Publish Loop ────────────────────────────────

const BROKER_URL = process.argv.find(a => a.startsWith('--broker='))?.split('=')[1] || 'mqtt://localhost:1883';
const INTERVAL_MS = parseInt(process.argv.find(a => a.startsWith('--interval='))?.split('=')[1] || '1000', 10);
const ATTACK_AFTER = parseInt(process.argv.find(a => a.startsWith('--attack-after='))?.split('=')[1] || '0', 10);
const ATTACK_TYPE = process.argv.find(a => a.startsWith('--attack='))?.split('=')[1] || null;

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║        VajraGrid Virtual RTU Simulator                  ║');
console.log('║        5 Substations • MQTT Protocol                    ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Broker:    ${BROKER_URL.padEnd(43)}║`);
console.log(`║  Interval:  ${(INTERVAL_MS + 'ms').padEnd(43)}║`);
console.log(`║  RTUs:      ${BUSES.map(b => b.id).join(', ').padEnd(43)}║`);
if (ATTACK_TYPE) {
  console.log(`║  Attack:    ${ATTACK_TYPE} on ${attackTarget} after ${ATTACK_AFTER}s${''.padEnd(43 - `${ATTACK_TYPE} on ${attackTarget} after ${ATTACK_AFTER}s`.length)}║`);
}
console.log('╚══════════════════════════════════════════════════════════╝');
console.log();

const client = mqtt.connect(BROKER_URL, {
  clientId: `vajragrid-rtu-sim-${Date.now()}`,
  clean: true,
  reconnectPeriod: 2000,
});

let publishCount = 0;
let publishInterval: ReturnType<typeof setInterval> | null = null;

client.on('connect', () => {
  console.log(`✓ Connected to MQTT broker at ${BROKER_URL}`);
  console.log(`  Publishing telemetry every ${INTERVAL_MS}ms...\n`);

  publishInterval = setInterval(() => {
    const elapsed = (publishCount * INTERVAL_MS) / 1000;

    // Check if we should start an attack
    if (ATTACK_TYPE && ATTACK_AFTER > 0 && elapsed >= ATTACK_AFTER && !attackMode) {
      attackMode = ATTACK_TYPE;
      console.log(`\n🚨 ATTACK INJECTED: ${ATTACK_TYPE} on ${attackTarget} at t=${elapsed}s\n`);
    }

    for (const bus of BUSES) {
      const telemetry = generateBusTelemetry(bus);
      const topic = `scada/${bus.id}/telemetry`;
      client.publish(topic, JSON.stringify(telemetry), { qos: 1 });
    }

    publishCount++;

    // Status line every 5 seconds
    if (publishCount % 5 === 0) {
      const hour = new Date().getHours() + new Date().getMinutes() / 60;
      const lf = (getLoadFactor(hour) * 100).toFixed(0);
      const sf = (getSolarFactor(hour) * 100).toFixed(0);
      const atk = attackMode ? ` | 🚨 ${attackMode}→${attackTarget}` : '';
      process.stdout.write(`  [t=${elapsed.toFixed(0)}s] ${publishCount * 5} msgs | Load: ${lf}% | Solar: ${sf}%${atk}\r`);
    }
  }, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('✗ MQTT error:', err.message);
});

client.on('close', () => {
  console.log('\n✗ Disconnected from broker');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down virtual RTUs...');
  if (publishInterval) clearInterval(publishInterval);
  client.end(false, () => {
    console.log(`✓ Published ${publishCount * 5} total messages. Goodbye.`);
    process.exit(0);
  });
});
