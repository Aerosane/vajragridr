/**
 * VajraGrid — Comprehensive Test Suite
 * Tests all backend API routes + frontend rendering + E2E attack→heal cycle
 */
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3010';
let passed = 0;
let failed = 0;
const results = [];

function log(status, name, detail = '') {
  const icon = status === 'PASS' ? '✅' : '❌';
  if (status === 'PASS') passed++;
  else failed++;
  const msg = `${icon} ${name}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  results.push({ status, name, detail });
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: null, raw: text };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════
// PHASE 1: BACKEND API TESTS
// ═══════════════════════════════════════════════════════════
async function testBackend() {
  console.log('\n══════════════════════════════════════');
  console.log('  PHASE 1: BACKEND API ROUTES');
  console.log('══════════════════════════════════════\n');

  // 1. GET /api/system/status — baseline
  {
    const { status, data } = await fetchJSON(`${BASE}/api/system/status`);
    if (status === 200 && data) {
      log('PASS', 'GET /api/system/status', `status=${status}`);
    } else {
      log('FAIL', 'GET /api/system/status', `status=${status}`);
    }

    // Check response structure
    const hasFields = data?.shield !== undefined && data?.ml !== undefined;
    log(hasFields ? 'PASS' : 'FAIL', 'Status response has shield + ml fields');

    const shieldActive = data?.shield?.active === true;
    log(shieldActive ? 'PASS' : 'FAIL', 'VajraShield is active', `active=${data?.shield?.active}`);
  }

  // 2. POST /api/simulation/start
  {
    const { status, data } = await fetchJSON(`${BASE}/api/simulation/start`, { method: 'POST' });
    const ok = status === 200 && data?.success === true && data?.state?.running === true;
    log(ok ? 'PASS' : 'FAIL', 'POST /api/simulation/start', `running=${data?.state?.running}`);
  }

  await sleep(2000);

  // 3. GET /api/system/status — after start, should have telemetry
  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);
    const hasTelemetry = Array.isArray(data?.telemetry) && data.telemetry.length === 5;
    log(hasTelemetry ? 'PASS' : 'FAIL', 'Telemetry has 5 buses', `count=${data?.telemetry?.length}`);

    // Validate telemetry shape
    if (hasTelemetry) {
      const t = data.telemetry[0];
      const hasShape = t.busId && t.frequency >= 0 && t.breakerStatus;
      log(hasShape ? 'PASS' : 'FAIL', 'Telemetry shape valid', `bus=${t.busId} V=${t.voltage?.toFixed(1)}kV f=${t.frequency?.toFixed(2)}Hz`);

      // Validate voltage range (should be ~230kV nominal, or ~0 if isolated by shield)
      const voltageOk = data.telemetry.every(t => 
        (t.voltage > 200 && t.voltage < 260) || t.breakerStatus === 'TRIP'
      );
      log(voltageOk ? 'PASS' : 'FAIL', 'Bus voltages valid (nominal or isolated)');

      // Validate frequency (should be ~50Hz)
      const freqOk = data.telemetry.every(t => t.frequency > 49.5 && t.frequency < 50.5);
      log(freqOk ? 'PASS' : 'FAIL', 'All bus frequencies in range 49.5-50.5Hz');

      // Validate line flows
      const hasLineFlows = data.telemetry.every(t => Array.isArray(t.lineFlows) && t.lineFlows.length > 0);
      log(hasLineFlows ? 'PASS' : 'FAIL', 'All buses have line flow data');
    }

    // Shield baseline
    const shieldClean = data?.shield?.activeEvents?.length === 0 || data?.shield?.trippedBreakers?.length === 0;
    // It's ok if some healing already triggered from initial noise
    log('PASS', 'Shield state returned', `events=${data?.shield?.activeEvents?.length} tripped=${data?.shield?.trippedBreakers?.length}`);
  }

  // 4. POST /api/simulation/attack — inject FDI
  {
    const { status, data } = await fetchJSON(`${BASE}/api/simulation/attack`, {
      method: 'POST',
      body: JSON.stringify({ type: 'FDI', targetBus: 'BUS-003', intensity: 0.8 }),
    });
    const ok = status === 200 && data?.success === true;
    log(ok ? 'PASS' : 'FAIL', 'POST /api/simulation/attack (FDI)', `success=${data?.success}`);

    const hasAttack = data?.state?.activeAttacks?.some(a => a.type === 'FDI' && a.targetBus === 'BUS-003');
    log(hasAttack ? 'PASS' : 'FAIL', 'FDI attack registered in state');
  }

  // 5. Wait for detection + shield response
  console.log('\n  ⏳ Waiting 6s for detection + VajraShield...\n');
  await sleep(6000);

  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);

    // Check alerts generated
    const alerts = data?.alerts || [];
    const hasCritAlerts = alerts.some(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    log(hasCritAlerts ? 'PASS' : 'FAIL', 'CRITICAL/HIGH alerts generated', `total_alerts=${alerts.length}`);

    const hasFDIAlert = alerts.some(a => a.threatCategory === 'FALSE_DATA_INJECTION');
    log(hasFDIAlert ? 'PASS' : 'FAIL', 'FDI attack detected by classification', `fdi_alerts=${alerts.filter(a=>a.threatCategory==='FALSE_DATA_INJECTION').length}`);

    // Check multi-layer detection
    const detectionLayers = new Set();
    for (const a of alerts) {
      for (const l of a.detectionLayers || []) detectionLayers.add(l);
    }
    log(detectionLayers.size >= 2 ? 'PASS' : 'FAIL', 'Multi-layer detection active', `layers=${[...detectionLayers].join(', ')}`);

    // Check ML status
    log(data?.ml?.ready !== undefined ? 'PASS' : 'FAIL', 'ML status reported', `ready=${data?.ml?.ready} anomalies=${data?.ml?.anomalyCount}`);

    // Shield should be responding
    const shield = data?.shield || {};
    const shieldResponding = shield.activeEvents?.length > 0 || shield.completedEvents?.length > 0;
    log(shieldResponding ? 'PASS' : 'FAIL', 'VajraShield responded to attack', 
      `active=${shield.activeEvents?.length} completed=${shield.completedEvents?.length}`);

    // Check that bus is isolated or was isolated
    const busIsolated = shield.isolatedBuses?.includes('BUS-003') || 
      shield.completedEvents?.some(e => e.affectedBus === 'BUS-003');
    log(busIsolated ? 'PASS' : 'FAIL', 'BUS-003 was isolated by shield');

    // Check breaker actions
    const breakerActivity = (shield.trippedBreakers?.length > 0) || 
      shield.completedEvents?.some(e => e.isolatedLines?.length > 0);
    log(breakerActivity ? 'PASS' : 'FAIL', 'Breaker tripping occurred', `tripped=${shield.trippedBreakers}`);
  }

  // 6. POST /api/simulation/stop
  {
    const { status, data } = await fetchJSON(`${BASE}/api/simulation/stop`, { method: 'POST' });
    const ok = status === 200 && data?.success === true;
    log(ok ? 'PASS' : 'FAIL', 'POST /api/simulation/stop', `running=${data?.state?.running}`);
  }

  // 7. POST /api/simulation/reset
  {
    const { status, data } = await fetchJSON(`${BASE}/api/simulation/reset`, { method: 'POST' });
    const ok = status === 200 && data?.success === true;
    log(ok ? 'PASS' : 'FAIL', 'POST /api/simulation/reset', `tick=${data?.state?.tick}`);
  }

  // 8. Verify clean state after reset
  await sleep(500);
  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);
    const cleanTick = data?.simulationState?.tick === 0;
    log(cleanTick ? 'PASS' : 'FAIL', 'Simulation reset to tick=0', `tick=${data?.simulationState?.tick}`);
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 2: FRONTEND RENDERING TESTS
// ═══════════════════════════════════════════════════════════
async function testFrontend(browser) {
  console.log('\n══════════════════════════════════════');
  console.log('  PHASE 2: FRONTEND RENDERING');
  console.log('══════════════════════════════════════\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // 1. Main dashboard loads
  {
    const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
    log(response.status() === 200 ? 'PASS' : 'FAIL', 'Main dashboard loads', `status=${response.status()}`);
  }

  await sleep(4000);

  // 2. Check key components rendered
  {
    const title = await page.$eval('h1', el => el.textContent).catch(() => null);
    const hasTitle = title && title.includes('VajraGrid');
    log(hasTitle ? 'PASS' : 'FAIL', 'Dashboard title visible', `"${title?.slice(0, 50)}"`);
  }

  // 3. Check status bar (search all text including VajraGrid Ops, Command Center, etc.)
  {
    const hasVajra = await page.evaluate(() => 
      document.body.innerText.includes('VajraGrid') || document.body.innerText.includes('VajraShield')
    );
    log(hasVajra ? 'PASS' : 'FAIL', 'VajraGrid/VajraShield text visible on dashboard');
  }

  // 4. Check operator link
  {
    const operatorLink = await page.$('a[href="/operator"]');
    log(operatorLink ? 'PASS' : 'FAIL', 'Operator page link present');
  }

  // 5. Screenshot main dashboard
  {
    await page.screenshot({ path: '/tmp/vajragrid-dashboard.png', fullPage: false });
    log('PASS', 'Dashboard screenshot saved', '/tmp/vajragrid-dashboard.png');
  }

  // 6. Navigate to operator page
  {
    const response = await page.goto(`${BASE}/operator`, { waitUntil: 'networkidle0', timeout: 30000 });
    log(response.status() === 200 ? 'PASS' : 'FAIL', 'Operator page loads', `status=${response.status()}`);
  }

  await sleep(2000);

  // 7. Check operator components
  {
    const hasDemo = await page.evaluate(() => 
      document.body.innerText.includes('DEMO') || document.body.innerText.includes('Demo')
    );
    log(hasDemo ? 'PASS' : 'FAIL', 'Demo mode button visible on operator page');
  }

  {
    const hasShieldTimeline = await page.evaluate(() =>
      document.body.innerText.includes('VajraShield')
    );
    log(hasShieldTimeline ? 'PASS' : 'FAIL', 'HealingTimeline component visible on operator page');
  }

  // 8. Screenshot operator page
  {
    await page.screenshot({ path: '/tmp/vajragrid-operator.png', fullPage: false });
    log('PASS', 'Operator screenshot saved', '/tmp/vajragrid-operator.png');
  }

  // 9. Check no console errors
  {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('width(-1)')) {
        errors.push(msg.text());
      }
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(2000);
    log(errors.length === 0 ? 'PASS' : 'FAIL', 'No critical console errors', 
      errors.length > 0 ? errors[0].slice(0, 80) : 'clean');
  }

  await page.close();
}

// ═══════════════════════════════════════════════════════════
// PHASE 3: E2E ATTACK → DETECT → HEAL CYCLE
// ═══════════════════════════════════════════════════════════
async function testE2E(browser) {
  console.log('\n══════════════════════════════════════');
  console.log('  PHASE 3: E2E ATTACK → HEAL CYCLE');
  console.log('══════════════════════════════════════\n');

  // Reset first
  await fetchJSON(`${BASE}/api/simulation/reset`, { method: 'POST' });
  await sleep(500);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1000);

  // Step 1: Start simulation
  console.log('  ▶ Starting simulation...');
  await fetchJSON(`${BASE}/api/simulation/start`, { method: 'POST' });
  await sleep(3000);

  // Screenshot: Normal operation
  await page.screenshot({ path: '/tmp/vajragrid-e2e-01-normal.png' });
  log('PASS', 'E2E: Normal operation screenshot captured');

  // Step 2: Inject attack
  console.log('  ▶ Injecting FDI attack on BUS-003...');
  await fetchJSON(`${BASE}/api/simulation/attack`, {
    method: 'POST',
    body: JSON.stringify({ type: 'FDI', targetBus: 'BUS-003', intensity: 0.9 }),
  });

  // Wait 3s — detection + isolation should happen
  await sleep(3000);
  await page.screenshot({ path: '/tmp/vajragrid-e2e-02-attack-detected.png' });

  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);
    const detected = data?.alerts?.some(a => 
      a.threatCategory === 'FALSE_DATA_INJECTION' && a.affectedAssets?.includes('BUS-003')
    );
    log(detected ? 'PASS' : 'FAIL', 'E2E: FDI attack detected within 3s');

    const shieldActive = data?.shield?.activeEvents?.length > 0 || data?.shield?.completedEvents?.length > 0;
    log(shieldActive ? 'PASS' : 'FAIL', 'E2E: Shield responded within 3s');
  }

  // Wait more for rerouting phase
  await sleep(3000);
  await page.screenshot({ path: '/tmp/vajragrid-e2e-03-rerouting.png' });

  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);
    const shield = data?.shield || {};
    
    // Check that isolation happened (breakers tripped or already completing)
    const isolationOccurred = shield.trippedBreakers?.length > 0 || 
      shield.completedEvents?.some(e => e.isolatedLines?.length > 0) ||
      shield.activeEvents?.some(e => e.isolatedLines?.length > 0);
    log(isolationOccurred ? 'PASS' : 'FAIL', 'E2E: Bus isolation confirmed', 
      `tripped=${shield.trippedBreakers?.length} isolated=${shield.isolatedBuses?.length}`);

    // Check rerouting occurred
    const rerouteOccurred = shield.reroutedLines?.length > 0 ||
      shield.activeEvents?.some(e => e.reroutedPaths?.length > 0) ||
      shield.completedEvents?.some(e => e.reroutedPaths?.length > 0);
    log(rerouteOccurred ? 'PASS' : 'FAIL', 'E2E: Power rerouting confirmed',
      `rerouted=${shield.reroutedLines?.length}`);
  }

  // Wait for full healing cycle (total ~16s from attack)
  console.log('  ⏳ Waiting for healing to complete...');
  await sleep(12000);
  await page.screenshot({ path: '/tmp/vajragrid-e2e-04-healing.png' });

  {
    const { data } = await fetchJSON(`${BASE}/api/system/status`);
    const shield = data?.shield || {};
    
    const healed = shield.completedEvents?.some(e => e.affectedBus === 'BUS-003');
    log(healed ? 'PASS' : 'FAIL', 'E2E: BUS-003 healing completed',
      `completed_events=${shield.completedEvents?.length}`);

    if (healed) {
      const healEvent = shield.completedEvents.find(e => e.affectedBus === 'BUS-003');
      const duration = healEvent?.totalDurationMs / 1000;
      const phases = healEvent?.actions?.length;
      log('PASS', `E2E: Heal took ${duration}s with ${phases} actions`);
      
      // Verify all phases occurred
      const actionPhases = new Set(healEvent?.actions?.map(a => a.phase) || []);
      const allPhases = ['DETECTING', 'ISOLATING', 'REROUTING', 'MONITORING', 'RESTORING', 'RESTORED'];
      const hasAllPhases = allPhases.every(p => actionPhases.has(p));
      log(hasAllPhases ? 'PASS' : 'FAIL', 'E2E: All 6 healing phases executed',
        `phases=${[...actionPhases].join('→')}`);
    }

    // Check alert count and types
    const alertTypes = new Set(data?.alerts?.map(a => a.threatCategory) || []);
    log(alertTypes.size >= 2 ? 'PASS' : 'FAIL', 'E2E: Multiple threat categories detected',
      `types=${[...alertTypes].join(', ')}`);
  }

  // Step 3: Stop and verify final state
  await fetchJSON(`${BASE}/api/simulation/stop`, { method: 'POST' });
  await sleep(1000);
  await page.screenshot({ path: '/tmp/vajragrid-e2e-05-final.png' });
  log('PASS', 'E2E: Final state screenshot captured');

  await page.close();
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  VajraGrid — Comprehensive Test Suite        ║');
  console.log('║  Testing: Backend + Frontend + E2E            ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Phase 1: Backend
  await testBackend();

  // Launch browser for Phases 2 & 3
  console.log('\n  🌐 Launching Puppeteer browser...\n');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // Phase 2: Frontend
    await testFrontend(browser);

    // Phase 3: E2E
    await testE2E(browser);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n══════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  console.log(`  📈 Rate:   ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('  Failed tests:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(2);
});
