# VajraGrid — Technical Deep Dive

> **AI-Driven Cyber Defense for Smart Power Grids**
> AMD Slingshot 2026 | Theme: AI + Cybersecurity & Privacy
> Team Innovibe — D Shantan Dheer, MJ Emmanuel, Jakkula Tarun

---

## Table of Contents

1. [What Is VajraGrid?](#1-what-is-vajragrid)
2. [Grid Model & Assumptions](#2-grid-model--assumptions)
3. [4-Layer Detection Pipeline](#3-4-layer-detection-pipeline)
4. [AlertClassifier — Threat Fusion](#4-alertclassifier--threat-fusion)
5. [VajraShield — Autonomous Self-Healing (FLISR)](#5-vajrashield--autonomous-self-healing-flisr)
6. [Attack Simulation](#6-attack-simulation)
7. [Fail-Safe Behavior](#7-fail-safe-behavior)
8. [AMD Hardware Integration](#8-amd-hardware-integration)
9. [SOC Dashboard](#9-soc-dashboard)
10. [API & Architecture](#10-api--architecture)
11. [Technology Stack](#11-technology-stack)
12. [Test Coverage](#12-test-coverage)
13. [Performance Metrics](#13-performance-metrics)
14. [Known Limitations](#14-known-limitations)
15. [Deployment Pathway](#15-deployment-pathway)
16. [References & Citations](#16-references--citations)

---

## 1. What Is VajraGrid?

VajraGrid is an **AI-powered cybersecurity system** purpose-built for **Indian smart power grid infrastructure**. It combines a **4-layer detection pipeline** (rules, physics, statistics, ML) with **VajraShield**, an autonomous self-healing engine that executes FLISR (Fault Location, Isolation, Service Restoration) in **16 seconds** — compared to the 30-90 minute manual response baseline observed in real-world incidents like the Ukraine 2016 blackout (Dragos OT IR Report).

This is **not** a generic cybersecurity tool. It is a **cyber-physical** defense system that understands electrical engineering principles — Kirchhoff's laws, power balance, frequency regulation, voltage coupling — to distinguish real grid faults from sophisticated cyberattacks like False Data Injection.

---

## 2. Grid Model & Assumptions

### Topology

| Parameter | Value |
|-----------|-------|
| **Grid Type** | Simplified regional transmission/distribution hybrid |
| **Model Basis** | Inspired by IEEE 9-bus; reduced to 5-bus for prototype |
| **Voltage Level** | 230 kV |
| **Buses** | 5 (2 generation + 3 load) |
| **Transmission Lines** | 6 (with resistance, reactance, capacity 80-200 MVA) |
| **Load Flow** | Simplified AC (not full Newton-Raphson; linearized P-V-f relationships) |
| **Control** | Centralized SOC with per-bus telemetry |

### Bus Definitions

| Bus ID | Name | Type | Capacity | Smart Meters |
|--------|------|------|----------|--------------|
| BUS-001 | Indrapura | SLACK (swing bus) | 150 MW gen | — |
| BUS-002 | Vajra Solar | PV_GEN (solar) | 80 MW gen | — |
| BUS-003 | Shakti Nagar | PQ_LOAD | 85 MW load | 52,000 |
| BUS-004 | Kavach Grid | PQ_LOAD | 60 MW load | 15,000 |
| BUS-005 | Sudarshan Hub | PQ_LOAD | 45 MW load | 28,000 |

### Operating Parameters

- **Voltage regulation**: ±5% warning (218.5-241.5 kV), ±10% critical (207-253 kV)
- **Frequency**: 50 Hz nominal (Indian grid), ±0.5 Hz critical
- **Load curves**: Based on Indian NLDC daily profile (peak 10-14h & 18-22h, trough 02-06h)
- **Solar generation**: Gaussian profile with cloud variability
- **Slack bus**: Balances total generation = total load + 3% losses
- **Telemetry rate**: 1 frame/second (1 Hz SCADA simulation)
- **Measurement precision**: PMU (±0.5 Hz), RTU (±2% power), smart meters (95-99% PF)

### What This Is NOT

- Not a full AC load flow solver (no Newton-Raphson/Gauss-Seidel)
- Not a transient stability simulator
- Not a real-time hardware-in-the-loop (HIL) system
- The 5-bus model is a **prototype demonstration** — production would use IEC 61850/CIM models with real SCADA feeds

---

## 3. 4-Layer Detection Pipeline

Each layer runs independently per telemetry frame (1 second). All results feed into the AlertClassifier for fusion. **No single layer is a silver bullet** — the multi-layer approach catches what individual layers miss.

### Layer 1: Rule Engine (Deterministic, <100ms)

9 predefined threshold rules providing instant detection of obvious violations:

| Rule | Metric | Critical Threshold | Warning |
|------|--------|--------------------|---------|
| RULE_VOLT_CRIT | Bus voltage | <207 or >253 kV | 218.5-241.5 kV |
| RULE_FREQ_CRIT | Frequency | <49.5 or >50.5 Hz | — |
| RULE_ROCOF_CRIT | Rate of Change of Frequency | >1.0 Hz/s | >0.5 Hz/s |
| RULE_VOLT_ROC | Voltage Rate of Change | >10 kV/s | — |
| RULE_LINE_OVERLOAD | Line loading | >95% capacity | >80% |
| RULE_PF_CRIT | Power factor | <0.80 | <0.85 |
| RULE_TEMP_CRIT | Transformer temperature | >80°C | >65°C |
| RULE_ZERO_METER | Meter reading = 0 + active power | Discrepancy | — |
| RULE_BREAKER_TRIP | Breaker status | TRIP state | — |

**Why rules?** They're fast, deterministic, and catch blatant attacks (command spoofing, sensor disconnect). They're the first line of defense.

### Layer 2: Physics Engine (Kirchhoff-based, <100ms)

4 physics consistency checks that validate whether telemetry obeys electrical laws:

1. **Power Balance** — `ΣP_gen ≈ ΣP_load + ΣP_losses` (±5% tolerance)
   - Based on: Conservation of energy / Kirchhoff's Current Law
   - Catches: FDI that spoofs individual bus readings but breaks system-wide balance

2. **Voltage Coupling** — Adjacent buses must have <15% voltage difference
   - Based on: Transmission line impedance relationships
   - Catches: Localized FDI that creates physically impossible voltage gradients

3. **Power Equation Consistency** — `V × I × cos(φ) ≈ P_reported` (±15%)
   - Based on: AC power triangle (P = V·I·PF)
   - Catches: Sensor tampering that modifies one measurement but not all three

4. **Frequency Consensus** — All buses within ±0.1 Hz
   - Based on: Synchronous grid physics (single frequency system)
   - Catches: Frequency manipulation attacks that affect individual buses

**Why physics?** An attacker can fool threshold rules by staying within limits. But they cannot violate the laws of physics across correlated measurements without the physics engine detecting inconsistencies.

### Layer 3: Statistical Engine (<200ms)

Two statistical anomaly detectors per bus, tracking 3 parameters (voltage, frequency, active power):

**Z-Score Anomaly Detection:**
- Formula: `Z = |x_i - μ| / σ`
- Threshold: Z > 3.0 (i.e., beyond 3 standard deviations)
- Rolling window: 60 samples
- Catches: Sudden deviations from historical normal

**CUSUM (Cumulative Sum) Change Detection:**
- Slack: `k = 0.5 × σ`
- Recursion: `S_i = max(0, S_{i-1} + (x_i - μ - k))`
- Threshold: `S > 4σ`
- Catches: **Slow drift attacks** (e.g., sensor tampering that changes values by 0.04 kV/tick) — these stay under threshold rules but accumulate detectable CUSUM scores

**Cross-Bus Correlation (Pearson):**
- Expected: r > 0.7 between adjacent buses
- Catches: Transmission faults, desynchronization

**Why statistics?** Rules catch big attacks, physics catches impossible data. Statistics catch **stealthy attacks** — slow drifts, subtle manipulations that stay within thresholds but deviate from historical patterns.

### Layer 4: ML/ONNX (Isolation Forest, <500ms)

**Model**: Isolation Forest (unsupervised anomaly detection)
- 200 trees, max_samples=2048, contamination=0.5%
- 6 features: voltage, frequency, activePower, reactivePower, voltageAngle, powerFactor
- StandardScaler normalization embedded in ONNX pipeline

**Training Data** (generated via `train_model.py`):
- 20,000 normal samples per bus (100,000 total) following Indian NLDC load curves
- 2,000+ attack samples across 8 attack patterns:
  1. FDI voltage bias (+15-40 kV)
  2. FDI voltage suppression (-20-50 kV)
  3. Frequency manipulation (±0.3-1.5 Hz)
  4. MaDIoT load surge (1.8-3.0x)
  5. Command spoofing (voltage collapse)
  6. Sensor freeze (stuck values)
  7. Multi-vector coordinated attack
  8. Replay attack (stale data)

**Performance**:
- Detection rate: **95.8%** on attack data
- False positive rate: **0.2%** on normal data
- Anomaly score threshold: -0.5302
- Inference: onnxruntime-node, CPU with AVX2, 4 intra-op threads

**Confidence Scoring**:
- `confidence = 0.5 + min(0.5, (threshold - score) / (3σ))`
- Range: [0.0, 1.0]

**Why ML beyond rules + physics?** ML catches **novel/zero-day attacks** that don't match predefined rules or known physics violations. The Isolation Forest learns the "shape" of normal grid behavior and flags anything that deviates — even attack patterns we haven't explicitly programmed.

### Why 4 Layers?

| Attack Type | Rules | Physics | Stats | ML |
|-------------|-------|---------|-------|----|
| Command Spoof (blatant) | ✅ | — | — | ✅ |
| FDI (sensor spoofing) | ⚠️ | ✅ | ✅ | ✅ |
| Sensor Tamper (slow drift) | ❌ | ⚠️ | ✅ | ✅ |
| MaDIoT (load manipulation) | ✅ | ✅ | — | ✅ |
| Novel zero-day | ❌ | ❌ | ⚠️ | ✅ |

No single layer catches everything. The fusion of all four provides **defense in depth**.

---

## 4. AlertClassifier — Threat Fusion

The AlertClassifier takes outputs from all 4 detection layers and classifies the threat into one of 6 categories:

| Threat Category | Required Signals | Base Confidence |
|----------------|------------------|-----------------|
| **FALSE_DATA_INJECTION** | Physics inconsistency + Z>3σ + ROC violations (2+ signals required) | 0.7-0.9 |
| **COMMAND_SPOOFING** | Breaker trip + no electrical justification | 0.85 |
| **SENSOR_TAMPERING** | RULE_ZERO_METER violation | 0.9 |
| **LOAD_MANIPULATION** | Power imbalance + high deviation | 0.75 |
| **SMART_METER_COMPROMISE** | Zero meter at high-density bus (>100 meters) | 0.8 |
| **ANOMALOUS_BEHAVIOR** | ML anomaly (catch-all for unclassified) | 0.6-0.9 (dynamic) |

**Fusion Logic:**
- FDI detection requires **2+ corroborating signals** from different layers (not just one layer screaming)
- Confidence is boosted: +0.2 if physics corroborates, +0.1 if multi-parameter statistics corroborate
- Each alert includes: severity (CRITICAL/HIGH/MEDIUM/LOW), affected assets, MITRE ATT&CK tactics (T0830, T0859, etc.), and **actionable recommendations**

**False Positive Mitigation:**
1. Multi-layer confirmation — single-layer anomaly alone does NOT trigger VajraShield
2. Confidence threshold — VajraShield requires HIGH or CRITICAL severity (confidence ≥ 0.90 for autonomous action)
3. Cross-validation — physics + statistics must agree on the anomaly location

---

## 5. VajraShield — Autonomous Self-Healing (FLISR)

### Activation

VajraShield activates when AlertClassifier produces a **CRITICAL** or **HIGH** severity alert. It implements FLISR — the industry-standard approach for grid self-healing.

### 6-Phase Healing Cycle (16 seconds total)

```
Phase 1: DETECTING    (0-1s)   — Confirm threat, identify affected bus
Phase 2: ISOLATING    (1-3s)   — Trip breakers on compromised bus lines
Phase 3: REROUTING    (3-5s)   — Calculate alternate paths, redistribute load
Phase 4: MONITORING   (5-13s)  — Verify containment, watch for persistence
Phase 5: RESTORING    (13-16s) — Re-close breakers, normalize power
Phase 6: RESTORED     (16s)    — Grid healed, event logged
```

### How Rerouting Works

1. **Identify isolation zone**: All transmission lines connected to the compromised bus
2. **Trip breakers**: Mark lines as isolated, bus voltage → 0-10 kV, power → 0 MW
3. **Find alternate paths**: Lines between adjacent healthy buses that don't touch the compromised bus
4. **Redistribute load**:
   - `per_neighbor_share = (line.capacity / total_alternate_capacity) × isolated_load`
   - Each healthy neighbor absorbs proportional share based on available line capacity
5. **Gradual restoration**: After monitoring confirms stability, breakers re-close incrementally

### The "16 Seconds" Claim — Clarified

- **16 seconds** = simulation ticks (1 tick = 1 second of simulated time)
- In production, real SCADA communication latency would add 100-500ms per command
- Realistic target: **20-30 seconds** with real hardware
- This is still **60-180x faster** than manual response (30-90 minutes)
- The 16s figure represents the **algorithmic processing time**, not end-to-end including network latency

### Stability Safeguards

1. **Gradual restoration** — breakers re-close incrementally, not all at once
2. **Frequency consensus check** — physics engine validates all buses within ±0.1 Hz before restoration
3. **Monitoring phase is longest** (8 ticks / 8 seconds) — deliberate wait to ensure no cascading failures
4. **No duplicate healing** — cannot isolate a bus that's already being healed
5. **Cannot trip already-tripped breakers** — prevents conflicting actions

### Autonomous vs. Advisory Mode

**Current prototype**: Fully autonomous (acts immediately upon HIGH/CRITICAL alerts)

**Advisory mode** (production recommendation):
- VajraShield can be toggled: `setShieldEnabled(true/false)`
- When disabled, alerts and recommendations still generate — operators see them on the SOC dashboard
- Production deployment should add an **approval gate** before the ISOLATING phase
- This respects operator expertise while providing AI-speed recommendations

**If the system is uncertain** (confidence < 0.90):
- Alert is generated but VajraShield does NOT activate
- Recommendation: "Cross-reference rules/physics; investigate manually"
- System stays in monitoring mode — no autonomous action on ambiguous signals

---

## 6. Attack Simulation

VajraGrid simulates **5 real-world attack types** based on documented incidents and academic research:

### Attack 1: False Data Injection (FDI)
- **Basis**: Academic literature on state estimation attacks
- **Mechanism**: Adds voltage bias (+15-35 kV) and phase angle bias (+5-20°) to SCADA telemetry
- **Stealth**: Marks data quality as GOOD (attacker spoofs trustworthiness)
- **Detection**: Physics engine (power equation mismatch) + statistics (Z-score)

### Attack 2: Command Spoofing
- **Basis**: Ukraine 2015 BlackEnergy3 attack pattern
- **Mechanism**: Forces breaker TRIP + 45-55% voltage drop, zero power flow
- **Cascade effect**: Adjacent buses see 1.5-1.6x line overload
- **Detection**: RULE_BREAKER_TRIP + nominal grid state = COMMAND_SPOOFING

### Attack 3: Sensor Tampering (Slow Drift)
- **Basis**: Stuxnet-style gradual manipulation
- **Mechanism**: Voltage drifts +0.04 to +0.16 kV per tick (cumulative)
- **Stealth**: Adjusts current to maintain apparent P=V×I consistency (with intentional -2% error)
- **Detection**: CUSUM catches persistent drift over time; rules miss it initially

### Attack 4: MaDIoT (Manipulation of Demand via IoT)
- **Basis**: Princeton 2018 research on botnet-based grid attacks
- **Mechanism**: Load multiplier 1.3-1.7x across all buses simultaneously
- **Physics**: `freq_drop = -(mult-1) × (P_base / (2 × H × S_base × f_nom))` (inverse droop)
- **Detection**: Physics (power imbalance) + ROCOF (frequency dip)

### Attack 5: Smart Meter Compromise
- **Basis**: AMI (Advanced Metering Infrastructure) attack surface
- **Mechanism**: Sets meter consumption → 0 (partial or full intensity)
- **Discrepancy**: PMU still reads real values ≠ meter aggregate
- **Detection**: RULE_ZERO_METER → SMART_METER_COMPROMISE

### What VajraGrid CANNOT Detect (Out of Scope)
- **Supply chain attacks** (compromised firmware before deployment)
- **Physical destruction** (equipment damage, not cyber)
- **Social engineering** (phishing targeting operators)
- **Encrypted C2 traffic** (no network-level IDS)
- **Attacks on the VajraGrid system itself** (no self-defense module)

---

## 7. Fail-Safe Behavior

Critical infrastructure systems MUST fail safely. Here's how VajraGrid handles uncertainty:

| Scenario | Behavior |
|----------|----------|
| **ML model unavailable** | Returns empty results. Pipeline continues with 3 remaining layers. |
| **Insufficient statistical history** (<10 samples) | Stats layer returns empty. Graceful degradation. |
| **Low confidence alert** (<0.90) | Alert generated, VajraShield does NOT activate. Advisory only. |
| **Conflicting layer signals** | AlertClassifier requires 2+ corroborating signals for FDI. Single-layer anomaly = advisory. |
| **Already healing a bus** | New alerts for same bus are queued, not duplicated. |
| **All buses isolated** | BLACKOUT status. No further healing (nothing to reroute to). Operator notified. |
| **Shield disabled by operator** | Alerts still generate. No autonomous action. Full advisory mode. |

**Design principle**: When in doubt, **alert the operator** rather than take autonomous action. Only HIGH/CRITICAL confidence triggers VajraShield.

---

## 8. AMD Hardware Integration

### Why AMD Ryzen AI NPU at the Edge?

| Benefit | Explanation |
|---------|-------------|
| **Low latency** | <5ms inference on NPU vs 200ms+ over cloud round-trip |
| **Offline protection** | Substations operate on airgapped networks; cloud isn't always available |
| **Reduced network dependency** | Detection happens locally — no bandwidth bottleneck |
| **Power efficiency** | 50 TOPS at 15W cTDP — suitable for edge deployment cabinets |
| **Cost** | Estimated ~₹2-5L per substation edge node |

### Current Implementation (Prototype)

```
Runtime:     onnxruntime-node 1.24.2
Providers:   CPU (with AVX2 auto-optimization)
Threads:     4 intra-op (parallel tree evaluation)
Model:       ~500 KB ONNX binary (200 trees, 6 features)
Throughput:  31,500 inferences/sec on EPYC/AVX2
```

### Production Path — AMD XDNA NPU

1. **Model already in ONNX format** — zero framework changes needed
2. **VitisAI Execution Provider** — switch from CPU EP to VitisAI EP for NPU offload
3. **Quark INT8 quantization** — <1% accuracy loss, 5-8x inference speedup (AMD benchmarks)
4. **Target hardware**: AMD Ryzen AI 300/400 series (50-60 TOPS NPU, XDNA 2 architecture)

### EPYC Backend Role (Cloud/Aggregation)

- Aggregation of telemetry from multiple regional substations
- Large-scale cross-region correlation analysis
- Model retraining on accumulated attack data (ROCm GPU path)
- Cloud dev → edge deployment pipeline

---

## 9. SOC Dashboard

The Security Operations Center dashboard provides real-time grid awareness:

| Component | Description |
|-----------|-------------|
| **System Status Bar** | Live alert count, simulation state, frequency/load indicators. Color-coded: Green (NOMINAL), Yellow (ALERT), Red (EMERGENCY/BLACKOUT) |
| **Metric Cards** | Total generation, total load, system frequency, active buses, line loading % |
| **Telemetry Charts** | Time-series: voltage per bus, frequency, active power (Recharts, 1s update) |
| **Grid Topology Map** | Visual 5-bus topology with animated line flows (XYFlow). Color-coded nodes: green/yellow/red. Healer badge on isolated buses |
| **Alert Panel** | Last 20 alerts with severity badge, affected assets, confidence %, threat category, MITRE ATT&CK tactics, relative timestamps |
| **Healing Timeline** | Active VajraShield events with 6-phase progress bar. Per-event: affected bus, elapsed time, action log |
| **Simulation Controls** | Play/pause, speed slider (0.1x-10x), reset, attack injection UI |

**Mobile responsive**: Full SOC on mobile with drawer navigation, compact cards, responsive grid layout.

---

## 10. API & Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                  │
│     Next.js 16 + React 19 | Tailwind v4 | XYFlow    │
├─────────────────────────────────────────────────────┤
│                     API LAYER                        │
│  REST: /api/simulation/{start,stop,attack,speed}     │
│  SSE:  /api/stream (telemetry, alerts, state)        │
│  Poll: /api/system/status                            │
├─────────────────────────────────────────────────────┤
│                 SIMULATION ENGINE                     │
│  DataGenerator → Telemetry (V, f, P, Q, θ, AMI)     │
│  5 Attack Injectors (FDI, Spoof, Tamper, MaDIoT, Meter) │
├─────────────────────────────────────────────────────┤
│               4-LAYER DETECTION PIPELINE             │
│  Rules (9) → Physics (4) → Stats (Z+CUSUM) → ML/ONNX│
│           └── AlertClassifier Fusion ──┘             │
├─────────────────────────────────────────────────────┤
│                   VAJRASHIELD™                        │
│  FLISR: Detect → Isolate → Reroute → Monitor → Restore │
├─────────────────────────────────────────────────────┤
│                  AMD HARDWARE LAYER                   │
│  Edge: Ryzen AI NPU (XDNA 50 TOPS) + VitisAI        │
│  Dev:  EPYC AVX2+FMA3 | Training: ROCm GPU          │
└─────────────────────────────────────────────────────┘
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/simulation/start` | Start grid simulation |
| POST | `/api/simulation/stop` | Stop simulation |
| POST | `/api/simulation/reset` | Reset all state |
| POST | `/api/simulation/speed` | Set simulation speed |
| POST | `/api/simulation/attack` | Inject attack (type, bus, intensity) |
| GET | `/api/stream` | SSE: telemetry, alerts, system state, shield status |
| GET | `/api/system/status` | Polling: latest telemetry + alert history (50) |

### Event Types (SSE)

```
telemetry        — Per-bus V, f, P, Q, θ, PF, AMI every 1s
system_state     — Aggregate: total gen/load, status, active buses
alert            — Classified threat with severity, confidence, recommendations
simulation_state — Running/paused/stopped
shield_status    — VajraShield enabled/disabled, active healing events
```

---

## 11. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js | 16.1.6 |
| **UI** | React | 19.2.3 |
| **Styling** | TailwindCSS | 4.0 |
| **Charts** | Recharts | 3.7.0 |
| **Topology** | XYFlow | latest |
| **Realtime** | Socket.IO | 4.8.3 |
| **ML Inference** | onnxruntime-node | 1.24.2 |
| **ML Training** | scikit-learn (Python) | latest |
| **ML Export** | skl2onnx + ONNX 1.13 | — |
| **Language** | TypeScript | 5.0 |
| **Testing** | Vitest | 4.0.18 |
| **E2E Testing** | Playwright | 1.58.2 |
| **Package Manager** | pnpm | 8.x |
| **Runtime** | Node.js | 20+ |

---

## 12. Test Coverage

**37 tests passing** across 4 test suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| **DataGenerator** | 8 | Telemetry generation, voltage/frequency ranges, line flows, load curves |
| **Attack Injectors** | 13 | All 5 attack types: injection, intensity scaling, target isolation, cascade effects |
| **Detection Pipeline** | 12 | RuleEngine thresholds, PhysicsEngine violations, StatisticalEngine Z-score/CUSUM, AlertClassifier fusion |
| **Integration** | 4 | End-to-end: normal → attack → detection → classification |

**Commands**: `pnpm test` (Vitest), `pnpm run build` (Turbopack), `pnpm run lint` (ESLint)

---

## 13. Performance Metrics

| Metric | Value | Source |
|--------|-------|--------|
| **Detection latency** | <3 seconds (all 4 layers combined) | Simulation measurement |
| **Full heal cycle** | 16 seconds (algorithmic; +5-15s for real SCADA latency) | VajraShield timing |
| **ML detection rate** | 95.8% on attack data | Isolation Forest evaluation |
| **ML false positive rate** | 0.2% on normal data | Isolation Forest evaluation |
| **Confidence threshold** | ≥0.90 for autonomous action | AlertClassifier config |
| **Inference throughput** | 31,500 inferences/sec | EPYC/AVX2 benchmark |
| **Manual response baseline** | 30-90 minutes | Ukraine 2016 incident (Dragos) |
| **Speedup vs manual** | ~60-180x faster | 16s vs 30-90 min |

---

## 14. Known Limitations

We believe engineering maturity includes acknowledging what the system cannot do:

1. **Simulated environment** — All telemetry is software-generated, not from real SCADA/PMU hardware
2. **Simplified grid topology** — 5-bus model; real Indian grids have 10,000+ nodes per state
3. **No real SCADA integration** — No OPC-UA, IEC 61850, or DNP3 protocol support yet
4. **Simplified load flow** — Not full Newton-Raphson AC power flow; linearized relationships
5. **No transient stability** — Does not model generator swing equations, rotor angle stability
6. **CPU-only inference** — NPU/VitisAI execution provider not yet integrated (model is ONNX-ready)
7. **No encrypted traffic analysis** — Cannot detect C2 communication at the network layer
8. **No multi-substation federation** — Current prototype is single-site; production needs distributed coordination
9. **Training data is synthetic** — ML model trained on generated data, not real attack telemetry
10. **No formal safety certification** — Would need IEC 62351 / NERC CIP compliance for production

---

## 15. Deployment Pathway

### Phase 1: Prototype (Current)
- Simulated 5-bus grid with software telemetry
- ONNX model running on CPU (EPYC/AVX2)
- Web-based SOC dashboard

### Phase 2: Pilot (Near-term)
- OPC-UA adapter for real SCADA telemetry
- Real PMU/RTU data from partner DISCOM
- CERC (Central Electricity Regulatory Commission) compliance module
- Retrain ML on real telemetry patterns

### Phase 3: Edge Deployment (Mid-term)
- AMD Ryzen AI NPU edge nodes at substations
- VitisAI Execution Provider + Quark INT8 quantization
- GIS Mapbox dashboard for geographic grid visualization
- Multi-DISCOM federation with EPYC aggregation backend

### Phase 4: Commercial (Long-term)
- SaaS platform for state DISCOMs (BESCOM, MSEDCL, TPDDL)
- IEC 61850 / NERC CIP / CERC compliance certification
- International grid standard support (IEEE 2030, IEC 62351)
- ROCm GPU training pipeline for continuous model improvement
- Target market: $8.3B (2025) → $22.7B (2034) at 11.7% CAGR (Global Market Insights)

### Target Customers
- **Primary**: State DISCOMs (Distribution Companies) — BESCOM, MSEDCL, TPDDL
- **Secondary**: PGCIL (Power Grid Corporation of India Limited)
- **Tertiary**: Smart meter vendors, industrial consumers with captive power

---

## 16. References & Citations

### Incidents Referenced
- **2020 Mumbai Blackout**: Recorded Future / RedEcho group; confirmed by Maharashtra Cyber Cell and reported by NYT, The Hindu, The Hacker News
- **2015 Ukraine BlackEnergy3**: Dragos OT Incident Response whitepaper; 230,000 customers affected, 30-60 min manual restoration
- **MaDIoT Attack Vector**: Princeton University 2018 research on botnet-based grid manipulation

### Market Data
- **Grid Cybersecurity Market**: $8.3B (2025) → $22.7B (2034) @ 11.7% CAGR — Global Market Insights (Oct 2025)
- **Grid Cybersecurity Market (alternate)**: $9.26B (2025) → $29.70B (2034) @ 13.82% CAGR — Precedence Research
- **Cyberattack frequency**: 1,162 distinct attacks on US utilities in 2024 (Forescout); 1,339 weekly attacks on utility networks Q3 2024 (Check Point Research)

### AMD Hardware Specs
- **Ryzen AI 300/400 Series**: 50-60 TOPS NPU, XDNA 2 architecture, 15-54W cTDP — AMD official specs (CES 2025/2026)
- **XDNA 2 Architecture**: 50 TOPS (INT8), 25 TFLOPS (BF16) — Emergent Mind technical review

### Standards & Frameworks
- **MITRE ATT&CK for ICS**: T0830 (Man-in-the-Middle), T0859 (Valid Accounts), T0855 (Unauthorized Command)
- **IEC 61850**: Communication networks and systems for power utility automation
- **IEC 62351**: Power systems management and associated information exchange — Data and communication security
- **NERC CIP**: North American Electric Reliability Corporation Critical Infrastructure Protection standards

---

*VajraGrid is a prototype research demonstration for AMD Slingshot 2026. It demonstrates the feasibility of multi-layer AI detection + autonomous FLISR healing for critical power grid infrastructure. Production deployment would require real SCADA integration, formal safety certification, and extensive field testing.*
