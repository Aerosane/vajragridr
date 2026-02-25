# VajraGrid — Full App Test Prompt for Gemini CLI

Copy everything below the line and paste into Gemini CLI:

---

You are testing **VajraGrid**, an AI-driven cyber defense system for smart power grids. It's a Next.js 16 app at `/workspaces/vajragrid/vajragrid-app`.

## Setup
```bash
cd /workspaces/vajragrid/vajragrid-app

# Install Playwright and tsx for browser testing
pnpm add -D @playwright/test tsx
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

# Start dev server
PORT=3010 pnpm dev &
sleep 8
```
Wait until you see "Ready" in the output. The app runs on `http://localhost:3010`.

## What to Test

### PHASE 1: Backend API Routes

Test ALL these endpoints and verify responses:

```bash
# 1. System status (should return telemetry, systemState, alerts, ml, shield)
curl -s http://localhost:3010/api/system/status | python3 -m json.tool | head -30

# 2. Start simulation
curl -s -X POST http://localhost:3010/api/simulation/start
# Expected: {"success":true,"state":{"running":true,...}}

# 3. Wait 3 seconds, then check status — telemetry should have 5 buses with real values
sleep 3
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Buses: {len(d[\"telemetry\"])}')
for t in d['telemetry']:
    print(f'  {t[\"busId\"]}: V={t[\"voltage\"]:.1f}kV f={t[\"frequency\"]:.3f}Hz P={t[\"activePower\"]:.1f}MW breaker={t[\"breakerStatus\"]}')
print(f'SystemState: {d[\"systemState\"][\"systemStatus\"]} freq={d[\"systemState\"][\"systemFrequency\"]:.3f}Hz')
print(f'Alerts: {len(d[\"alerts\"])}')
print(f'ML ready: {d[\"ml\"][\"ready\"]} anomalies: {d[\"ml\"][\"anomalyCount\"]}')
print(f'Shield active: {d[\"shield\"][\"active\"]}')
"

# 4. Inject FDI attack on BUS-003
curl -s -X POST http://localhost:3010/api/simulation/attack \
  -H "Content-Type: application/json" \
  -d '{"type":"FDI","targetBus":"BUS-003","intensity":0.9}'
# Expected: {"success":true}

# 5. Wait 6s for detection + VajraShield response
sleep 6
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
alerts = d['alerts']
fdi = [a for a in alerts if 'FDI' in a.get('title','') or a.get('threatCategory','')=='FALSE_DATA_INJECTION']
layers = set()
for a in alerts:
    for l in a.get('detectionLayers',[]):
        layers.add(l)
shield = d['shield']
print(f'Total alerts: {len(alerts)}')
print(f'FDI-specific alerts: {len(fdi)}')
print(f'Detection layers active: {sorted(layers)}')
print(f'ML anomalies: {d[\"ml\"][\"anomalyCount\"]}')
print(f'Shield events: active={len(shield[\"activeEvents\"])} completed={len(shield[\"completedEvents\"])}')
print(f'Tripped breakers: {shield[\"trippedBreakers\"]}')
print(f'Isolated buses: {shield[\"isolatedBuses\"]}')
print(f'Rerouted lines: {shield[\"reroutedLines\"]}')
"

# 6. Wait for healing to complete (16s total cycle)
sleep 12
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
shield = d['shield']
completed = shield['completedEvents']
for evt in completed:
    print(f'Healed: {evt[\"affectedBus\"]} in {evt[\"totalDurationMs\"]/1000:.0f}s')
    print(f'  Phase: {evt[\"phase\"]}')
    print(f'  Actions: {len(evt[\"actions\"])}')
    phases = [a['phase'] for a in evt['actions']]
    print(f'  Phase sequence: {\"→\".join(phases)}')
print(f'Active events remaining: {len(shield[\"activeEvents\"])}')
"

# 7. Inject ALL attack types
curl -s -X POST http://localhost:3010/api/simulation/attack -H "Content-Type: application/json" -d '{"type":"COMMAND_SPOOF","targetBus":"BUS-003","intensity":0.9}'
curl -s -X POST http://localhost:3010/api/simulation/attack -H "Content-Type: application/json" -d '{"type":"SENSOR_TAMPER","targetBus":"BUS-004","intensity":0.7}'
curl -s -X POST http://localhost:3010/api/simulation/attack -H "Content-Type: application/json" -d '{"type":"MADIOT","targetBus":"BUS-005","intensity":0.8}'
curl -s -X POST http://localhost:3010/api/simulation/attack -H "Content-Type: application/json" -d '{"type":"METER_ATTACK","targetBus":"BUS-002","intensity":0.8}'
sleep 5
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
cats = set(a.get('threatCategory','') for a in d['alerts'])
print(f'Threat categories detected: {sorted(cats)}')
print(f'Total alerts: {len(d[\"alerts\"])}')
print(f'Shield active events: {len(d[\"shield\"][\"activeEvents\"])}')
"

# 8. Stop and reset
curl -s -X POST http://localhost:3010/api/simulation/stop
curl -s -X POST http://localhost:3010/api/simulation/reset
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Running: {d[\"simulationState\"][\"running\"]}')
print(f'Tick: {d[\"simulationState\"][\"tick\"]}')
"
# Expected: running=False, tick=0
```

### PHASE 2: Frontend Verification (Playwright)

Create and run this Playwright test script **inside the project directory** (not /tmp — it needs access to node_modules):

```bash
cat > /workspaces/vajragrid/vajragrid-app/e2e-test.ts << 'TESTEOF'
import { chromium, type Page, type Browser } from '@playwright/test';

const BASE = 'http://localhost:3010';
let browser: Browser;
let page: Page;
const results: { test: string; status: 'PASS' | 'FAIL'; detail?: string }[] = [];

function log(test: string, pass: boolean, detail?: string) {
  results.push({ test, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅' : '❌'} ${test}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('width(-1)') && !msg.text().includes('height(-1)')) {
      consoleErrors.push(msg.text());
    }
  });

  // ── PHASE 2: Dashboard page ──
  console.log('\n=== PHASE 2: Frontend Verification ===\n');

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Use data-testid selectors (stable, not affected by CSS class names or text casing)
  const statusBar = await page.locator('[data-testid="status-bar"]').count();
  log('SystemStatusBar rendered', statusBar > 0);

  const metricCards = await page.locator('[data-testid="metric-cards"]').count();
  log('MetricCards rendered', metricCards > 0);

  const gridTopology = await page.locator('[data-testid="grid-topology"]').count();
  log('GridTopologyMap rendered', gridTopology > 0);

  const alertPanel = await page.locator('[data-testid="alert-panel"]').count();
  log('AlertPanel rendered', alertPanel > 0);

  const healingTimeline = await page.locator('[data-testid="healing-timeline"]').count();
  log('HealingTimeline rendered', healingTimeline > 0);

  // Text-based checks (case-insensitive for uppercase CSS transforms)
  const h1Text = await page.locator('h1').first().textContent();
  log('Dashboard heading', /vajragrid|command/i.test(h1Text || ''), h1Text || 'not found');

  const busLabels = await page.getByText(/BUS-00[1-5]/).count();
  log('Bus labels visible', busLabels >= 3, `Found ${busLabels}`);

  const operatorLink = await page.locator('a[href*="operator"]').count();
  log('Operator page link', operatorLink > 0);

  await page.screenshot({ path: '/tmp/vajragrid-dashboard.png', fullPage: true });

  // ── Operator page ──
  await page.goto(`${BASE}/operator`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const operatorHeading = await page.getByText(/operator|console/i).first().isVisible().catch(() => false);
  log('Operator page heading', !!operatorHeading);

  const startBtn = await page.getByRole('button', { name: /start/i }).count();
  const stopBtn = await page.getByRole('button', { name: /stop/i }).count();
  const resetBtn = await page.getByRole('button', { name: /reset/i }).count();
  log('Control buttons', startBtn > 0 && stopBtn > 0 && resetBtn > 0, `start=${startBtn} stop=${stopBtn} reset=${resetBtn}`);

  const attackBtns = await page.getByRole('button', { name: /FDI|Spoof|MaDIoT|Tamper|Meter/i }).count();
  log('Attack buttons', attackBtns >= 3, `Found ${attackBtns}`);

  const demoBtn = await page.getByRole('button', { name: /demo/i }).count();
  log('Demo mode button', demoBtn > 0);

  await page.screenshot({ path: '/tmp/vajragrid-operator.png', fullPage: true });

  // ── PHASE 3: E2E Attack → Heal Cycle ──
  console.log('\n=== PHASE 3: E2E Attack > Heal Cycle ===\n');

  const startRes = await page.request.post(`${BASE}/api/simulation/start`);
  log('Start simulation', startRes.ok(), `Status: ${startRes.status()}`);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const statusRes = await page.request.get(`${BASE}/api/system/status`);
  const statusData = await statusRes.json();
  const busCount = statusData.telemetry?.length || 0;
  log('Live telemetry', busCount === 5, `${busCount} buses`);

  const freq = statusData.systemState?.systemFrequency;
  log('Frequency in range', freq > 49 && freq < 51, `${freq?.toFixed(3)} Hz`);

  await page.screenshot({ path: '/tmp/vajragrid-running.png' });

  const atkRes = await page.request.post(`${BASE}/api/simulation/attack`, {
    data: { type: 'FDI', targetBus: 'BUS-003', intensity: 0.9 }
  });
  log('Inject FDI attack', atkRes.ok());

  await page.waitForTimeout(6000);
  const afterAtk = await (await page.request.get(`${BASE}/api/system/status`)).json();
  const alertCount = afterAtk.alerts?.length || 0;
  log('Alerts generated', alertCount > 0, `${alertCount} alerts`);

  const fdiAlerts = afterAtk.alerts?.filter((a: any) =>
    a.threatCategory === 'FALSE_DATA_INJECTION' || a.title?.includes('FDI')
  ) || [];
  log('FDI detected', fdiAlerts.length > 0, `${fdiAlerts.length} FDI alerts`);

  const layers = new Set<string>();
  afterAtk.alerts?.forEach((a: any) => a.detectionLayers?.forEach((l: string) => layers.add(l)));
  log('Multi-layer detection', layers.size >= 2, `Layers: ${[...layers].sort().join(', ')}`);

  const shieldActive = afterAtk.shield?.activeEvents?.length > 0 || afterAtk.shield?.completedEvents?.length > 0;
  log('VajraShield triggered', shieldActive, `Active: ${afterAtk.shield?.activeEvents?.length}, Completed: ${afterAtk.shield?.completedEvents?.length}`);

  await page.screenshot({ path: '/tmp/vajragrid-attack.png' });

  console.log('  Waiting 18s for VajraShield healing cycle...');
  await page.waitForTimeout(18000);

  const afterHeal = await (await page.request.get(`${BASE}/api/system/status`)).json();
  const completed = afterHeal.shield?.completedEvents || [];
  log('Healing completed', completed.length > 0, `${completed.length} events healed`);

  if (completed.length > 0) {
    const evt = completed[completed.length - 1];
    const phases = evt.actions?.map((a: any) => a.phase) || [];
    log('Full phase sequence', phases.includes('RESTORING') || phases.includes('RESTORED'), phases.join(' > '));
    log('Heal duration', evt.totalDurationMs > 0, `${(evt.totalDurationMs / 1000).toFixed(0)}s`);
  }

  await page.screenshot({ path: '/tmp/vajragrid-healed.png' });

  await page.request.post(`${BASE}/api/simulation/reset`);

  log('No console errors', consoleErrors.length === 0,
    consoleErrors.length > 0 ? consoleErrors.slice(0, 3).join('; ') : 'Clean');

  // ── Summary ──
  console.log('\n=== RESULTS SUMMARY ===\n');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r =>
      console.log(`  FAIL ${r.test}${r.detail ? ' -- ' + r.detail : ''}`)
    );
  }
  console.log('\nScreenshots saved to /tmp/vajragrid-*.png');

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
TESTEOF

# Run from project root so it finds node_modules
cd /workspaces/vajragrid/vajragrid-app
npx tsx e2e-test.ts
```

**Key fixes from Gemini's first run:**
- Script lives in project root (not /tmp) so `@playwright/test` resolves
- Uses `pnpm` not `npm` for installs
- Uses `data-testid` selectors (stable, not affected by CSS transforms or class names)
- Increased timeouts: 30s page load, 18s healing wait, 3s initial render delay
- No multi-line template literals in heredoc (avoids shell quoting issues)
- All `console.log` use simple strings (no backtick emoji issues)

### PHASE 4: ML Pipeline Verification

```bash
# Check ONNX model exists
ls -la /workspaces/vajragrid/vajragrid-app/public/models/
# Expected: anomaly_detector.onnx (~2MB) and model_metadata.json

# Check model metadata
cat /workspaces/vajragrid/vajragrid-app/public/models/model_metadata.json | python3 -m json.tool

# Verify ML detects anomalies during attack
curl -s -X POST http://localhost:3010/api/simulation/start
sleep 2
curl -s -X POST http://localhost:3010/api/simulation/attack -H "Content-Type: application/json" -d '{"type":"FDI","targetBus":"BUS-003","intensity":0.9}'
sleep 4
curl -s http://localhost:3010/api/system/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
ml_alerts = [a for a in d['alerts'] if 'ML' in a.get('detectionLayers',[])]
print(f'ML-generated alerts: {len(ml_alerts)}')
for a in ml_alerts[:3]:
    print(f'  {a[\"title\"]} — confidence: {a[\"confidence\"]:.0%} severity: {a[\"severity\"]}')
print(f'ML model ready: {d[\"ml\"][\"ready\"]}')
print(f'ML anomaly count: {d[\"ml\"][\"anomalyCount\"]}')
"
curl -s -X POST http://localhost:3010/api/simulation/reset
```

### PHASE 5: Code Quality Check

```bash
cd /workspaces/vajragrid/vajragrid-app

# Build must pass with zero errors
pnpm build

# Check TypeScript compilation
npx tsc --noEmit 2>&1 | head -20

# Count source files
find src -name "*.ts" -o -name "*.tsx" | wc -l

# Check for any TODO/FIXME/HACK in source
grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" || echo "None found"
```

## Expected Results Summary

| Test | Expected |
|------|----------|
| Build | Zero errors |
| API /system/status | Returns telemetry (5 buses), systemState, alerts, ml, shield |
| Simulation start/stop/reset | All return success, state changes correctly |
| FDI detection | Detected within 5s by RULES + PHYSICS + STATISTICAL + ML |
| VajraShield | Auto-triggers on CRITICAL alerts, heals in ~16s |
| Healing phases | DETECTING→ISOLATING→REROUTING→MONITORING→RESTORING→RESTORED |
| All 5 attack types | Each injectable and detectable |
| Dashboard (Playwright) | Renders heading, MetricCards, GridTopologyMap, AlertPanel, HealingTimeline |
| Operator page (Playwright) | All control/attack buttons render, demo mode available |
| E2E cycle (Playwright) | Start → FDI attack → multi-layer detection → VajraShield heals → phase sequence complete |
| ML model | ONNX loaded, detects anomalies at 60-100% confidence |
| Console errors | Zero (except Recharts width warnings) |
| Screenshots | 4 screenshots saved to /tmp/vajragrid-*.png |

## Architecture Reference

- **Simulation**: `src/lib/simulation/` — SimulationEngine, DataGenerator, 5 attack types
- **Detection**: `src/lib/detection/` — RuleEngine, PhysicsEngine, StatisticalEngine, MLDetector, AlertClassifier, pipeline.ts
- **Healing**: `src/lib/healing/SelfHealingEngine.ts` — FLISR algorithm, 6 phases
- **Types**: `src/lib/types/` — GridTelemetry, ThreatAlert, HealingEvent, SystemState
- **API**: `src/app/api/` — simulation/{start,stop,reset,attack}, system/status
- **Dashboard**: `src/components/dashboard/` — 8 components
- **Hooks**: `src/hooks/usePollingGridData.ts` — 1s polling, 120-point history

Report all test results with PASS/FAIL and any issues found.
