# VajraGrid — Senior Architect's Reading Guide

---

## 1. High-Level Scope & Objectives

**The problem:** India's power grid (575+ GW, 250,000+ substations) is critically exposed to cyber attacks on SCADA/ICS infrastructure. The 2020 Mumbai blackout, attributed to Chinese state-sponsored malware in MSEB SCADA servers, demonstrated zero automated response capability. A metro blackout costs ₹100–500 crore per hour. Manual response takes 30–90 minutes.

**VajraGrid's answer:** A cyber-physical defense platform that:
1. **Monitors** simulated SCADA telemetry (1 packet/bus/sec, 5 buses)
2. **Detects** attacks in <3 seconds using 4 fused detection layers
3. **Autonomously heals** the grid using FLISR in 16 simulation ticks

**The simulation concept, precisely:** Time is compressed — 1 tick = 1 second real-time = 1 simulated minute. A 24-hour grid day plays out in 24 real minutes. The `SimulationEngine` runs a `setInterval` loop, generating physics-correlated telemetry each tick. Attack injectors are applied as pure-function telemetry transforms *before* that data enters the detection pipeline. Crucially, the simulation is not a toy — it uses real IEGC/CERC electrical standards, Indian NLDC load curves, and documented attack profiles from Ukraine 2015 and Princeton 2018 research.


---

## 2. Architecture Breakdown

### Request/Data Flow (the full path)

```
setInterval (1s tick)
  └─► SimulationEngine.step()
        ├─ generateTelemetry(tick)         ← DataGenerator.ts
        │    └─ respects isBusIsolated()  ← healing state feedback loop
        ├─ applyAttacks()                  ← FDI/Spoof/MaDIoT/etc.
        └─ callbacks → pipeline.ts
              ├─ Layer 1: runRules()        → RuleEngine.ts
              ├─ Layer 2: runPhysicsChecks()→ PhysicsEngine.ts
              ├─ Layer 3: StatisticalDetector → StatisticalEngine.ts
              ├─ Layer 4: runMLDetection()  → MLDetector.ts (async)
              ├─ classifyThreats()          → AlertClassifier.ts
              ├─ publish('alert')           → EventBus.ts → SSE stream
              ├─ processAlerts()            → SelfHealingEngine.ts
              └─ tickHealing()             → advances FLISR state machine
```

### State Management Architecture

**Critical design pattern:** Because Next.js App Router hot-reloads modules in dev mode, all stateful singletons are stored on `globalThis` with custom keys:

- `globalThis.__vajraEngine` → `SimulationEngine` instance
- `globalThis.__vajraPipeline` → `PipelineState` (stat detector, alert history, telemetry buffer)
- `globalThis.__vajraShield` → `ShieldState` (active healing events, tripped breakers, isolated buses)
- `globalThis.__vajraMLSession` → ONNX `InferenceSession` (lazy-loaded server-side)

This `globalThis` pattern survives Next.js dev hot reloads. In production (`output: 'standalone'`), it's a standard Node.js singleton.

### Frontend Structure (`src/app/`)

| Route | Purpose |
|---|---|
| `/` (`page.tsx`) | Main SOC dashboard — `CommandCenter` with 6 panels |
| `/operator` | Operator Console with attack injection buttons + Demo Mode |
| `/grid-3d` | Three.js/R3F 3D grid topology with animated power flows |
| `GET /api/system/status` | Polling endpoint (1s); bootstraps `ensureDetectionPipeline()` |
| `GET /api/stream` | SSE stream for push-based real-time updates |
| `POST /api/simulation/start\|stop\|reset\|attack\|speed` | Control endpoints |

**Data delivery:** The frontend uses `usePollingGridData` (1s polling) that hits `/api/system/status`. This endpoint both serves data *and* bootstraps the pipeline if it hasn't started — a lazy initialization pattern. The `EventBus` (pub/sub) decouples the pipeline from the API, letting the SSE `/api/stream` endpoint subscribe to `telemetry`, `alert`, `shield`, and `system_state` events.

### Simulation Engine (`src/lib/simulation/`)

- **`SimulationEngine.ts`** — The engine singleton. Owns `tick`, `speed`, `activeAttacks[]`. Runs `step()` on a `setInterval`. Exposes `start/stop/reset/setSpeed/injectAttack`. Key: `elapsed` (ticks since attack started) is passed to `injectSensorTamper` to implement cumulative drift.
- **`DataGenerator.ts`** — Pure functions `generateTelemetry()` and `computeSystemState()`. Computes per-bus telemetry from grid topology constants + load curves + noise. Crucially, it calls `isBusIsolated()` and `isBreakerTripped()` from the healing engine — creating a **bi-directional feedback loop** between simulation and healing state.
- **`LoadCurve.ts`** — `dailyLoadFactor(hour)` and `solarGenerationFactor(hour)` implement the Indian NLDC composite profile.
- **`NoiseGenerator.ts`** — Box-Muller Gaussian generator. Provides `addNoise`, `addPercentNoise`, `transientNoise` (0.5% probability voltage spikes).
- **Attacks (`attacks/`)** — Five pure functions, each receiving `telemetry[]` and returning mutated `telemetry[]`. No side effects. Applied sequentially in `step()`.

### Detection Pipeline (`src/lib/detection/`)

- **`pipeline.ts`** — The orchestrator. Wires all 4 layers together. Has a **30-tick startup grace period** (waits for statistical windows to populate before firing alerts). Runs Layers 1-3 synchronously, Layer 4 asynchronously (`runMLDetection().then(...)`), then feeds non-ML alerts to VajraShield immediately without waiting for ML.
- **`RuleEngine.ts`** — 9 stateless threshold checks. O(B×L) per tick. Returns `RuleViolation[]` with `ruleId`, `busId`, `severity`, `message`.
- **`PhysicsEngine.ts`** — 4 cross-bus physics checks. Key: `CONSISTENCY` (P=V×I×PF mismatch) and `COUPLING` (adjacent bus voltage divergence). These are the cornerstone of FDI detection.
- **`StatisticalEngine.ts`** — `StatisticalDetector` class maintains per-bus rolling windows (60 samples). Exposes `addSample()`, `getZScoreAnomalies()`, `getCUSUM()`, `getCrossCorrelation()`. CUSUM state is stored per `(busId, param)` key — it persists between ticks and is the only true stateful detector.
- **`MLDetector.ts`** — Server-side ONNX inference. Lazy-loads `onnxruntime-node` (Node.js binary, not WASM). Stores session on `globalThis`. Gracefully returns `[]` if model unavailable. Runs inference on all 5 buses in a single batched tensor `[5, 6]`.
- **`AlertClassifier.ts`** — Evidence-based fusion. Requires **2+ corroborating signals** for FDI classification (Physics + Stats, or Physics + Rules). This is the key false-positive mitigation mechanism.

### Self-Healing (`src/lib/healing/`)

- **`SelfHealingEngine.ts`** — `ShieldState` contains: `activeEvents` (Map<busId, HealingEvent>), `completedEvents`, `trippedBreakers` (Set<lineId>), `isolatedBuses` (Set<busId>), `reroutedLines`, `alertConfirmations` (Map<busId, count>).
- **Confirmation gate:** VajraShield requires **3 consecutive ticks** of CRITICAL/HIGH alerts before creating a healing event (`ALERT_CONFIRM_TICKS = 3`). This prevents healing triggered by transient noise.
- **FLISR state machine:** 6 phases: `DETECTING(10t) → ISOLATING(2t) → REROUTING(2t) → MONITORING(8t) → RESTORING(3t) → RESTORED`. Total: **25 ticks**. (Note: docs say 16 ticks, but `PHASE_TICKS` sum to 25 — the "16 seconds" refers to the original algorithmic target, not the current code values.)
- **Load redistribution:** Capacity-proportional. The load of the isolated bus is spread across neighbors in proportion to the capacity of the connecting lines.
- **Key coupling:** `DataGenerator.ts` calls `isBusIsolated()` and `isBreakerTripped()` — so isolated buses naturally show V≈0, P=0 in subsequent telemetry frames, visually confirming isolation on the dashboard.


---

## 3. AI/ML & Physics Context

### ONNX Model Integration

The `anomaly_detector.onnx` embeds a **sklearn Pipeline** (`StandardScaler → IsolationForest`). This means:

1. Raw, unscaled telemetry `[voltage_kV, freq_Hz, P_MW, Q_MVAR, angle_deg, PF]` is fed directly
2. The ONNX graph internally applies `StandardScaler` normalization before the forest
3. Output is `score_samples` — a float per bus (more negative = more anomalous)
4. Anomaly threshold: **-0.5302** (2nd percentile of normal scores from training)

The model is loaded **server-side** via `onnxruntime-node` (native binary, not WASM). It runs on 4 intra-op threads using AVX2 on the host CPU. The deployment vision is to swap the execution provider from `'cpu'` to `'VitisAIExecutionProvider'` for AMD Ryzen AI NPU — a one-line change.

### Isolation Forest — Why It Works Here

The algorithm builds 200 random trees. Each tree randomly selects a feature and a split value, recursively partitioning the data. **Anomalies are isolated in fewer splits** (shorter path lengths) because they exist in sparse regions of feature space. The score is the normalized average path length across all trees.

What makes this particularly effective for grid cyber-attacks: real grid telemetry has strong **inter-feature correlations** (P ≈ V·I·cos(φ), adjacent bus voltages are coupled, heavy load → lower voltage and frequency). An attacker who manipulates one feature while leaving others realistic creates an *impossible* feature combination — the model isolates it quickly because it lands in a sparse region of the 6D feature space.

### Core Algorithms from ALGORITHMS.md / Physics.md

| Algorithm | Key Equation | Practical Edge Case |
|---|---|---|
| **Power Balance** | `\|ΣP_gen - (ΣP_load + ΣP_losses)\| / max < 5%` | Breaks on 3% loss estimate — loses accuracy if all buses are load buses simultaneously |
| **Voltage Coupling** | `\|V_bus1 - V_bus2\| / V_nominal < 15%` | O(B²) pairs — scales poorly beyond 100 buses |
| **Power Equation** | `\|V×I×PF/1000 - \|P\|\| / max < 15%` | 15% tolerance is loose; Sensor Tamper which compensates current partially evades this |
| **Z-Score** | `Z = \|x - μ\| / σ > 3.0` (60-sample window) | Requires 10 samples minimum; first 10 ticks per bus are blind |
| **CUSUM** | `S_i = max(0, S_{i-1} + (x_i - μ - 0.5σ))`, alert if `S > 4σ` | State persists across resets unless `StatisticalDetector` is re-instantiated |
| **Pearson Correlation** | `r < 0.7` across 6 hardcoded bus pairs | Pairs are **hardcoded** — adding buses doesn't automatically add new correlation pairs |
| **FLISR Load Redistribution** | `share_i = capacity_i / Σcapacity` | Ignores current loading of adjacent lines — may redistribute into an already-stressed line |


---

## 4. Attack Vectors & Edge Cases

### Attack Implementations (what the code actually does)

| Attack | Injector | Mechanism | What Detection Layers Fire |
|---|---|---|---|
| **FDI** (`FDIAttack.ts`) | `voltage += 15-35kV + N(0,2)`, `phaseAngle += 5-20°`, `dataQuality = 'GOOD'` | Spoofs SCADA channel | Physics CONSISTENCY + COUPLING, Z-score (multi-param), RULE_VOLT_ROC → `AlertClassifier` fuses to FDI (conf 0.9-1.0) |
| **Command Spoof** (`CommandSpoof.ts`) | `V *= dropFactor`, `P *= 0.6*dropFactor`, `breakerStatus = 'TRIP'`, `lineFlows = 0` | Forces breaker open | RULE_BREAKER_TRIP with no other violations → COMMAND_SPOOFING (conf 0.85) |
| **MaDIoT** (`MaDIoTAttack.ts`) | `P_load *= 1.3-1.7x`, frequency droops via swing equation `Δf = -ΔP/(2H×S×f0)` | IoT botnet load surge | PHYS_PWR_BALANCE + ROCOF → LOAD_MANIPULATION (conf 0.75) |
| **Sensor Tamper** (`SensorTamper.ts`) | `voltage += 0.04kV * elapsed` (linear drift), compensates current to fake P=V×I consistency | Slow drift attack | CUSUM (accumulates over ~50 ticks), Z-score eventually, ML → SENSOR_TAMPERING / ANOMALOUS_BEHAVIOR |
| **Meter Attack** (`MeterAttack.ts`) | `meterConsumption = 0` while `activePower` unchanged | Smart meter firmware zero-out | RULE_ZERO_METER → SENSOR_TAMPERING + SMART_METER_COMPROMISE (dual alert) |

### Critical Edge Cases & Failure Points

**1. False Positive — Load Manipulation vs. Real Demand Surge**

`AlertClassifier.ts` line 124: The load manipulation check uses `stats.correlations.get(t.busId)` to approximate load forecast deviation — but `correlations` stores **Pearson cross-correlation values** (0-1), not forecast deviations (%). This is a **code bug**: it compares a correlation coefficient (e.g., 0.82) against a 0.25 threshold and almost always fires, generating spurious LOAD_MANIPULATION alerts. The docs describe a proper "25% forecast deviation" check, but the code never implements it.

**2. Healing Never Fires on BUS-001/BUS-002 (Generator Buses)**

`computeLoadRedistribution()` returns early if `busConfig.ratedLoad === 0`. Generator buses (BUS-001 = SLACK, BUS-002 = PV_GEN) have `ratedLoad: 0`. If an attack isolates a generator bus, the REROUTING phase logs zero redistribution — which is arguably correct (you reroute generation, not load) but the code does nothing to reallocate generation to compensate.

**3. FLISR Phase Duration Mismatch (Docs vs. Code)**

`PHASE_TICKS = { DETECTING:10, ISOLATING:2, REROUTING:2, MONITORING:8, RESTORING:3, RESTORED:0 }` sums to **25 ticks** (25 seconds). Documentation uniformly claims "16 seconds." The discrepancy is due to `DETECTING` being set to 10 ticks (a later change to add debouncing), not the documented 1 tick. This means the 16-second claim shown on the dashboard is factually incorrect for the current code.

**4. 30-Tick Startup Blind Window**

`STARTUP_GRACE_TICKS = 30`. The first 30 seconds after simulation starts, **no alerts fire** even with active attacks. If a demo injects an attack immediately on start, the audience won't see a detection response for ~30 seconds. The statistical baseline stabilization is correct, but the blind window affects Z-score and CUSUM only — rules and physics don't need a warm-up period, yet are also suppressed.

**5. Replay Attack Has Lowest ML Detection Rate**

The Isolation Forest's weakest attack is the **replay attack** — replayed data has individually plausible values (correct voltage, frequency) but wrong cross-feature correlations (high load + high voltage = physically impossible). ML catches ~medium rate per training results. No other detection layer catches replay at all: rules won't fire (values are in bounds), physics won't fire (power balance can hold if load is matched), and CUSUM/Z-score won't fire (values are within normal ranges). **Replay is a detection gap** that only the ML layer partially closes.

**6. Adjacent Bus Overload Not Cascaded During Healing**

In `computeLoadRedistribution()`, load is mathematically distributed to neighbors, but the `DataGenerator` does not *apply* this redistribution when generating neighbor telemetry. The simulation shows the isolated bus going dark but neighboring lines don't actually carry the extra load in the telemetry numbers. The visual redistribution exists in `HealingEventDTO.loadRedistribution` but doesn't feed back into the telemetry stream — a gap between the healing model and the simulation.

**7. CUSUM State Not Reset on Attack Removal**

When `SimulationEngine.removeAttack()` is called, it clears `activeAttacks[]`. But `StatisticalDetector` (stored in `PipelineState`) retains its CUSUM cumulative sums and rolling windows. This means after an attack ends, CUSUM can continue firing for several ticks as the window flushes, generating stale alerts. This can make VajraShield trigger a new healing cycle for an attack that was already removed.

**8. Grid Can Enter Unrecoverable Healing Loop**

If an attack is continuous (never removed) and `ALERT_CONFIRM_TICKS` keeps refilling, once a bus completes `RESTORED` it clears from `isolatedBuses` and `activeEvents`. On the very next tick, alerts re-fire (attack still active), confirmations rebuild over 3 ticks, and a *new* healing event starts for the same bus. The bus oscillates between normal and isolated every ~28 ticks indefinitely.


---

## 5. Progressive Reading Guide — Files in Exact Order

Follow this sequence to build a complete mental model from domain → data model → physics → detection → healing → UI:

### 📘 Phase 1: Domain & Intent (30 min)

1. **`README.md`** (root) — The pitch. Establishes: 4-layer detection, VajraShield 16s claim, AMD NPU deployment vision, commercial context.
2. **`init.md`** — The original system design prompt. Reveals the project was designed in a 5-day sprint with a team of 3 EEE students using Claude Opus + Gemini. Critical for understanding why architectural choices favor speed of implementation over completeness.
3. **`exec.md`** — The execution plan. Defines the tech stack rationale and the detailed bus/line specs that everything else is built around. Contains the original `GridTelemetry` interface spec.

### 📗 Phase 2: Physics & Algorithms Reference (45 min)

1. **`Physics.md`** — Read sections 1-7. This is the ground truth for every number in the codebase: the 230kV nominal, 50Hz, ±5% IEGC bounds, 3% losses, load curve math, noise model (Box-Muller), line flow simplifications.
2. **`ALGORITHMS.md`** — Read all 11 algorithms. The pseudocode here maps exactly to the TypeScript. Pay special attention to: CUSUM slack (`k = 0.5σ`), the 2-signal requirement for FDI, and the FLISR state machine transitions.
3. **`ABOUT.md`** — The technical deep-dive narrative. Best read after the algorithm reference — it contextualizes the design decisions (why 4 layers, why FLISR, why Isolation Forest) and documents known limitations.

### 📙 Phase 3: Data Model & Constants (15 min)

1. **`src/lib/types/grid.ts`** — The `GridTelemetry` interface. This struct flows through every single function in the codebase. Know every field.
2. **`src/lib/types/alerts.ts`** — `ThreatAlert` and `HealingEvent` interfaces. The output of detection and input to healing.
3. **`src/lib/constants/gridConfig.ts`** — The 5 buses and 6 lines defined as TypeScript constants. The `GRID_TOPOLOGY` object is the graph that all topology operations run on. Note `getLinesForBus()` and `getAdjacentBuses()` — they're used by both the physics engine and the healing engine.

### 📒 Phase 4: Simulation Engine (20 min)

1. **`src/lib/simulation/LoadCurve.ts`** — `dailyLoadFactor()` and `solarGenerationFactor()`. These two functions drive all telemetry variation.
2. **`src/lib/simulation/NoiseGenerator.ts`** — Box-Muller Gaussian. Used everywhere. 5 lines of math you'll recognize in every telemetry generator.
3. **`src/lib/simulation/DataGenerator.ts`** — The physics simulator. Read this carefully: it loops over `GRID_TOPOLOGY.buses`, computes power/voltage/frequency per bus type (SLACK/PV_GEN/PQ_LOAD), and calls `isBusIsolated()` — the critical healing feedback loop.
4. **`src/lib/simulation/SimulationEngine.ts`** — The engine singleton. `step()` = generate → attack → emit. Note the `globalThis.__vajraEngine` singleton pattern.
5. **`src/lib/simulation/attacks/*.ts`** (FDI, CommandSpoof, MaDIoT, SensorTamper, MeterAttack) — All 5 are pure functions on `GridTelemetry[]`. Read in order of increasing stealth: CommandSpoof (blatant) → FDI → MaDIoT → MeterAttack → SensorTamper (most subtle).

### 📕 Phase 5: Detection Pipeline (30 min)

1. **`src/lib/detection/RuleEngine.ts`** — 9 deterministic rules. Fast to read, easy to understand.
2. **`src/lib/detection/PhysicsEngine.ts`** — 4 cross-bus checks. Focus on `CONSISTENCY` (P=V×I×PF) and `COUPLING` (adjacent voltage diff).
3. **`src/lib/detection/StatisticalEngine.ts`** — Z-score, CUSUM, Pearson correlation. The `StatisticalDetector` class and its rolling windows. Note `cusumState: Map<string, number>` — this is the persistent state across ticks.
4. **`src/lib/detection/MLDetector.ts`** — ONNX inference. Understand the `globalThis` session pattern, the `initModel()` lazy loader, and `extractFeatures()` (the 6-feature tensor construction).
5. **`src/lib/detection/AlertClassifier.ts`** — The fusion layer. The **most important file for understanding false-positive mitigation**. Note the bug at line 124 (correlations used as forecast deviation).
6. **`src/lib/detection/pipeline.ts`** — The orchestrator. Wires everything. Note: 30-tick grace period, ML called async with `.then()`, non-ML alerts published immediately.

### 📓 Phase 6: Self-Healing (20 min)

1. **`src/lib/healing/SelfHealingEngine.ts`** — VajraShield. Read the state machine (`tickHealing()`), the confirmation gate (`ALERT_CONFIRM_TICKS = 3`), `findAlternatePaths()`, and `computeLoadRedistribution()`. Note the 25-tick total vs. the documented 16-tick claim.

### 📔 Phase 7: API & Frontend (20 min)

1. **`src/app/api/system/status/route.ts`** — The polling endpoint. It bootstraps `ensureDetectionPipeline()` on every GET — the lazy initialization entry point.
2. **`src/app/api/stream/route.ts`** — SSE endpoint. Subscribe to EventBus events, flush to client.
3. **`src/app/api/simulation/*.ts`** — Start/stop/reset/attack/speed routes. All thin wrappers over `getSimulationEngine()` methods.
4. **`src/hooks/usePollingGridData.ts`** — React hook. 1s polling. Maintains 120-point history arrays for chart rendering.
5. **`src/components/dashboard/*.tsx`** — Read in this order: `CommandCenter` (layout) → `SystemStatusBar` → `MetricCards` → `TelemetryCharts` → `GridTopologyMap` (React Flow nodes/edges with healing state visualization) → `AlertPanel` → `HealingTimeline`.

### 🔬 Phase 8: ML Training (15 min)

1. **`ml/train_model.py`** — Read the attack sample generators (8 attack types) and the ONNX export. Understand `options={id(model): {'score_samples': True}}` — this is what exposes the raw scores rather than just classify/predict output.
2. **`public/models/model_metadata.json`** — The threshold (-0.5302), normal score stats, detection rates. The runtime uses this file directly; it's not just documentation.

---

**Total estimated reading time:** ~3 hours for a complete end-to-end mental model.

**The single most important file to read first:** `src/lib/detection/pipeline.ts` — it's the architectural spine that calls everything else, and reading it gives you the complete execution graph before diving into individual components.