# VajraGrid — Execution Plan (exec.md)
## AI-Driven Cyber Defense System for Smart Power Infrastructure

---

## 0. SYSTEM ENVIRONMENT

### Dev Machine Specs
| Resource | Specification |
|----------|--------------|
| **OS** | Ubuntu 24.04.3 LTS (Noble Numbat) |
| **CPU** | AMD EPYC 7763 — 16 cores / 32 threads |
| **RAM** | 125 GB |
| **Disk** | 126 GB (109 GB free) |
| **GPU** | None (CPU-only — shapes ML strategy) |
| **Node.js** | v24.11.1 |
| **npm** | 11.6.2 + pnpm 10.23.0 |
| **Python** | 3.12.1 + pip 25.3 |
| **Docker** | 28.5.1 |
| **Git** | 2.52.0 |
| **Go** | 1.25.4 |
| **Java** | OpenJDK 25.0.1 |
| **IDE** | VS Code (remote) |
| **GitHub CLI** | gh available |
| **Jupyter** | JupyterLab 4.5.0 (pre-installed) |

### Key Implications
- **No GPU** → No heavy deep learning. Use lightweight ML (Isolation Forest, statistical methods). ONNX Runtime Web with WASM backend is ideal.
- **125 GB RAM** → Can run large simulations, multiple services simultaneously, heavy build tooling — no constraints.
- **32 threads** → Turbopack and parallel builds will fly.
- **Python 3.12 + Jupyter** → Train ML models in Jupyter notebooks, export to ONNX for browser inference.
- **Docker available** → Can containerize for deployment if needed, but not required for demo.
- **pnpm available** → Faster than npm for installs. Use it.

---

## 1. DEFINITIVE TECH STACK

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Node.js | 24.11.1 | Already installed, exceeds Next.js 16 requirement (20.9+) |
| **Framework** | Next.js | 16.x (latest stable: 16.1.6) | Turbopack default bundler (2-5× faster), React Compiler (auto-memoization), Cache Components |
| **Language** | TypeScript | 5.x (bundled with Next.js 16) | Type-safe grid telemetry models, shared interfaces |
| **Package Manager** | pnpm | 10.23.0 | Pre-installed, faster than npm, strict dependency resolution |
| **Styling** | Tailwind CSS | v4.1.x | CSS-first config (no tailwind.config.js), Oxide engine (100× faster), dark theme via CSS variables |
| **UI Components** | shadcn/ui | 2026 edition | `npx shadcn create` visual builder, Radix primitives, copy-paste ownership |
| **Charts** | Tremor + Recharts | Latest | Tremor for dashboard metric cards, Recharts under the hood for custom time-series |
| **Grid Topology** | React Flow | Latest | Interactive node-based graph for bus topology visualization |
| **Real-time** | Socket.IO | 4.8.3 | WebSocket with auto-reconnect, event-based, battle-tested |
| **ML (Browser)** | ONNX Runtime Web | Latest | Run ONNX models via WebAssembly — no GPU needed, near-native speed |
| **ML (Training)** | scikit-learn + ONNX export | Python 3.12 | Train Isolation Forest in Jupyter → export via `skl2onnx` → load in browser |
| **Storage** | In-memory + JSON | — | No database setup needed. Alert history in JSON files. |
| **Deployment** | Vercel / Local | — | Local for demo, Vercel as backup |

### Install Commands (Day 1, First Hour)
```bash
# Scaffold project
pnpm create next-app@latest vajragrid --typescript --tailwind --app --src-dir --turbopack

cd vajragrid

# shadcn/ui visual builder — pick: dark theme, Lucide icons, zinc base color
pnpm dlx shadcn@latest init

# Core dependencies
pnpm add recharts @tremor/react socket.io socket.io-client @xyflow/react onnxruntime-web

# Dev tools
pnpm add -D @types/node prettier eslint-config-prettier

# Python ML pipeline (one-time setup)
pip3 install scikit-learn skl2onnx onnx numpy pandas jupyter
```

---

## 2. POWER GRID DOMAIN MODEL

### 2.1 What We're Simulating

A **regional smart grid** with 5 substations (buses) based on a simplified IEEE 9-bus topology. This is the smallest system that demonstrates realistic grid behavior: interconnected nodes, power flow, and cascading effects.

### 2.2 Grid Topology

```
                    ┌─────────────┐
                    │  BUS-001    │ ← Generator Bus (Thermal Plant)
                    │  GEN: 150MW │    Voltage: 230kV
                    │  "Indrapura"│    Type: Slack Bus
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │  BUS-002   │ │ TL-01 │ │  BUS-003   │
        │  GEN: 80MW │ │(Line) │ │  LOAD:85MW │
        │  "Vajra    │ │       │ │  "Shakti   │
        │   Solar"   │ │       │ │   Nagar"   │
        └─────┬──────┘ └───────┘ └─────┬──────┘
              │                         │
        ┌─────┴─────────────────────────┴─────┐
        │             TRANSMISSION             │
        │              NETWORK                 │
        ├─────────────────┬───────────────────┤
        │                 │                   │
  ┌─────┴─────┐    ┌─────┴─────┐    ┌────────┴───┐
  │  BUS-004   │    │  BUS-005   │    │            │
  │  LOAD:60MW │    │  LOAD:45MW │    │ FUTURE BUS │
  │  "Kavach   │    │  "Sudarshan│    │ (expansion)│
  │   Grid"    │    │   Hub"     │    │            │
  └────────────┘    └────────────┘    └────────────┘
```

### 2.3 Bus Specifications

| Bus ID | Name | Type | Rated Voltage | Generation (MW) | Load (MW) | Role |
|--------|------|------|--------------|-----------------|----------|------|
| BUS-001 | Indrapura | Slack/Ref | 230 kV | 150 | 0 | Main thermal generator. Sets reference voltage and angle. |
| BUS-002 | Vajra Solar | PV Gen | 230 kV | 80 | 0 | Solar generation bus. Variable output (cloud cover). |
| BUS-003 | Shakti Nagar | PQ Load | 230 kV | 0 | 85 | Major urban load center. Smart meters deployed. |
| BUS-004 | Kavach Grid | PQ Load | 230 kV | 0 | 60 | Industrial district. High power factor. |
| BUS-005 | Sudarshan Hub | PQ Load | 230 kV | 0 | 45 | Commercial district. EV charging infrastructure. |

### 2.4 Transmission Lines

| Line | From → To | Impedance (R+jX) | Length | Capacity |
|------|-----------|-------------------|--------|----------|
| TL-01 | BUS-001 → BUS-003 | 0.01 + j0.085 pu | 80 km | 200 MVA |
| TL-02 | BUS-001 → BUS-002 | 0.017 + j0.092 pu | 120 km | 150 MVA |
| TL-03 | BUS-002 → BUS-004 | 0.032 + j0.161 pu | 95 km | 100 MVA |
| TL-04 | BUS-003 → BUS-005 | 0.039 + j0.170 pu | 70 km | 100 MVA |
| TL-05 | BUS-004 → BUS-005 | 0.085 + j0.072 pu | 50 km | 80 MVA |
| TL-06 | BUS-002 → BUS-003 | 0.009 + j0.072 pu | 60 km | 150 MVA |

### 2.5 Operating Parameters — Normal Ranges

Based on **Indian Electricity Grid Code (IEGC)** and **CERC** standards:

| Parameter | Normal Range | Warning | Critical | Unit |
|-----------|-------------|---------|----------|------|
| **Frequency** | 49.90 – 50.05 Hz | 49.80–49.90 or 50.05–50.10 | <49.80 or >50.10 | Hz |
| **Voltage** | ±5% of nominal (218.5–241.5V at 230V) | ±8% | ±10% (207–253V) | Volts |
| **Power Factor** | 0.85 – 0.99 | 0.80–0.85 | <0.80 | — |
| **Line Loading** | 0–80% capacity | 80–95% | >95% | % |
| **Rate of Change of Frequency (RoCoF)** | <0.5 Hz/s | 0.5–1.0 Hz/s | >1.0 Hz/s | Hz/s |
| **Voltage THD** | <5% | 5–8% | >8% | % |
| **Transformer Temperature** | 40–65°C | 65–80°C | >80°C | °C |

### 2.6 Physics Model (Simplified for Simulation)

#### Frequency-Load Relationship
```
Δf = -ΔP_load / (2H × S_base × f₀)

Where:
  Δf         = frequency deviation (Hz)
  ΔP_load    = load-generation imbalance (MW)
  H          = system inertia constant (typically 3-5 seconds)
  S_base     = system base power (MVA)
  f₀         = nominal frequency (50 Hz)
```

In plain terms: **If load exceeds generation by 1%, frequency drops by ~0.1 Hz.** This is the fundamental relationship attackers exploit.

#### Voltage-Power Relationship
```
V ≈ V_nominal × (1 - k × (P_load/P_rated))

Where:
  k ≈ 0.05 (voltage regulation coefficient)
```

Simplified: **Higher load → lower voltage.** If voltage and load diverge, someone is injecting false data.

#### Power Balance
```
P_gen_total = P_load_total + P_losses

At all times. If this doesn't hold → physics violation → attack indicator.
```

### 2.7 Daily Load Curve (24-hour Pattern)

```
Load (%)
100│                              ╭──╮
 90│                           ╭──╯  ╰──╮
 80│                        ╭──╯        ╰──╮
 70│          ╭──╮       ╭──╯              ╰──╮
 60│       ╭──╯  ╰──╮╭──╯                    ╰──╮
 50│    ╭──╯        ╰╯                          ╰╮
 40│ ╭──╯                                        ╰╮
 30│─╯                                             ╰─
   └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──
     0  2  4  6  8 10 12 14 16 18 20 22 24  (hour)
      Night  Dawn Morning  Noon  Afternoon Evening Night

Key points:
- MINIMUM: ~30% at 03:00 (night trough)
- MORNING PEAK: ~70% at 09:00 (industrial start)
- MIDDAY DIP: ~60% at 13:00 (lunch)
- EVENING PEAK: ~100% at 19:00 (residential + commercial)
- FALLOFF: gradual decline from 21:00
```

#### Load Curve Math (TypeScript)
```typescript
function dailyLoadFactor(hour: number): number {
  // Composite of residential + commercial + industrial curves
  const baseLoad = 0.30;
  const morningRamp = 0.25 * Math.max(0, Math.sin((hour - 5) * Math.PI / 8));
  const eveningPeak = 0.40 * Math.exp(-0.5 * Math.pow((hour - 19) / 2.5, 2));
  const middayActivity = 0.15 * Math.exp(-0.5 * Math.pow((hour - 12) / 4, 2));
  return Math.min(1.0, baseLoad + morningRamp + eveningPeak + middayActivity);
}
```

### 2.8 SCADA Telemetry Data Model

This is what flows through the system every second:

```typescript
interface GridTelemetry {
  // Identity
  busId: string;              // "BUS-001" through "BUS-005"
  timestamp: string;          // ISO 8601: "2026-02-25T13:00:00.000Z"
  sequenceNumber: number;     // Monotonically increasing

  // Electrical measurements (per bus)
  voltage: number;            // kV (nominal: 230)
  frequency: number;          // Hz (nominal: 50.00)
  phaseAngle: number;         // degrees (-180 to 180)
  activePower: number;        // MW (positive = generation, negative = load)
  reactivePower: number;      // MVAR
  current: number;            // Amperes
  powerFactor: number;        // 0.0 to 1.0

  // Line measurements (outgoing lines from this bus)
  lineFlows: LineFlow[];

  // Equipment health
  transformerTemp: number;    // °C
  breakerStatus: 'CLOSED' | 'OPEN' | 'TRIP';

  // Smart meter aggregate (for load buses only)
  meterCount: number;         // Number of smart meters reporting
  meterConsumption: number;   // Aggregated consumption (MWh)

  // Metadata
  dataQuality: 'GOOD' | 'SUSPECT' | 'BAD';
  source: 'PMU' | 'RTU' | 'SMART_METER';
}

interface LineFlow {
  lineId: string;             // "TL-01" through "TL-06"
  fromBus: string;
  toBus: string;
  activePowerFlow: number;    // MW
  reactivePowerFlow: number;  // MVAR
  current: number;            // Amperes
  loadingPercent: number;     // 0-100%
  losses: number;             // MW
}

interface SystemState {
  timestamp: string;
  totalGeneration: number;    // MW
  totalLoad: number;          // MW
  totalLosses: number;        // MW
  systemFrequency: number;    // Hz (system-wide)
  generationLoadBalance: number; // Should be ~0
  activeBuses: number;        // Should be 5
  activeLines: number;        // Should be 6
  systemStatus: 'NOMINAL' | 'ALERT' | 'EMERGENCY' | 'BLACKOUT';
}
```

**Data rate**: 1 telemetry packet per bus per second (5 packets/sec total). This mimics PMU reporting rates (real PMUs do 30-60 samples/sec, but 1/sec is sufficient for demo and easier to visualize).

---

## 3. ATTACK SCENARIOS — DETAILED SPECIFICATIONS

### 3.1 Attack #1: False Data Injection (FDI)

**Real-world basis**: Attacker compromises SCADA communication channel and injects falsified sensor readings into the state estimator. This can cause operators to make wrong control decisions.

**What the simulation does**:
```typescript
function injectFDI(clean: GridTelemetry, config: FDIConfig): GridTelemetry {
  // Targeted bus: BUS-003 (major load center)
  // Attack vector: Voltage readings inflated to mask overload condition
  return {
    ...clean,
    voltage: clean.voltage + config.bias,        // +15 to +30 kV above actual
    phaseAngle: clean.phaseAngle + config.angleBias, // ±5-15°
    dataQuality: 'GOOD',  // Attacker marks data as trustworthy
  };
}
```

**Observable signature**:
- Sudden voltage jump on one bus that doesn't correlate with load change
- Phase angle inconsistency with adjacent buses
- Power balance equation violation: P ≠ V × I × cos(φ)
- Adjacent bus readings don't shift (no physical coupling observed)

**Detection methods**:
1. **Physics check**: If Bus-003 voltage jumps +20kV, connected buses MUST also shift. If they don't → false data.
2. **Rate-of-change**: Voltage changing >5kV/sec is physically impossible without a fault.
3. **State estimation residual**: Run simplified weighted least squares (WLS). If residual > threshold → bad data.
4. **Cross-correlation**: Pearson correlation between adjacent bus voltages should be >0.85. If it drops → injection.

### 3.2 Attack #2: Command Spoofing / Breaker Manipulation

**Real-world basis**: The 2015 Ukraine BlackEnergy attack. Attackers sent unauthorized commands to open circuit breakers, causing cascading outages. Sandworm group (Russian GRU Unit 74455) compromised SCADA HMI systems.

**What the simulation does**:
```typescript
function injectCommandSpoof(state: SystemState): SystemState {
  // Attack: Unauthorized breaker trip on TL-01 (BUS-001 → BUS-003)
  // Effect: BUS-003 loses its primary supply path
  return {
    ...state,
    buses: state.buses.map(bus => {
      if (bus.id === 'BUS-003') {
        return {
          ...bus,
          voltage: bus.voltage * 0.65,  // Voltage sags to 65% (under-voltage)
          activePower: bus.activePower * 0.4,  // Partial supply via alternate path
          breakerStatus: 'TRIP',
        };
      }
      return bus;
    }),
    lines: state.lines.map(line => {
      if (line.lineId === 'TL-01') {
        return { ...line, activePowerFlow: 0, current: 0, loadingPercent: 0 };
      }
      // Adjacent lines overload as they pick up slack
      if (line.lineId === 'TL-06') {
        return { ...line, loadingPercent: Math.min(120, line.loadingPercent * 1.8) };
      }
      return line;
    }),
  };
}
```

**Observable signature**:
- Breaker status changes without corresponding protection relay event
- No fault current detected before breaker opened (no physical reason)
- Cascading: adjacent lines suddenly overloaded
- Voltage collapse on isolated bus

**Detection methods**:
1. **Command authentication**: No valid control command logged → unauthorized
2. **Protection relay correlation**: Breaker tripped but no overcurrent/undervoltage relay activated
3. **Topology change detection**: Grid topology changed unexpectedly
4. **Cascading analysis**: Multiple line overloads following single breaker event

### 3.3 Attack #3: Load Manipulation (MaDIoT — Manipulation of Demand via IoT)

**Real-world basis**: Research from Princeton University (2018) demonstrated that botnets of high-wattage IoT devices (water heaters, AC units, EV chargers) could synchronously toggle demand to destabilize grid frequency.

**What the simulation does**:
```typescript
function injectMaDIoT(clean: GridTelemetry[], config: MaDIoTConfig): GridTelemetry[] {
  // All load buses simultaneously spike by 40-60%
  // This causes frequency to drop as generators can't ramp fast enough
  const loadMultiplier = 1.4 + Math.random() * 0.2; // 1.4-1.6×

  return clean.map(bus => {
    if (bus.activePower < 0) { // Load bus (negative = consuming)
      const newLoad = bus.activePower * loadMultiplier;
      const loadImbalance = newLoad - bus.activePower;
      // Frequency drops due to load-generation imbalance
      // Δf = -ΔP / (2H × S_base × f₀)
      const freqDrop = -loadImbalance / (2 * 4 * 230 * 50); // H=4s
      return {
        ...bus,
        activePower: newLoad,
        frequency: bus.frequency + freqDrop,
        current: bus.current * loadMultiplier,
      };
    }
    return bus;
  });
}
```

**Observable signature**:
- Simultaneous load spike across ALL load buses (not natural — loads don't correlate this tightly)
- System frequency drops sharply (>0.5 Hz/s RoCoF)
- Generator outputs ramp but can't keep up
- Oscillatory behavior as generators hunt for equilibrium

**Detection methods**:
1. **Cross-bus correlation**: Load on all buses spiking simultaneously has correlation >0.95 → unnatural
2. **RoCoF threshold**: Rate of change of frequency >1.0 Hz/s → emergency
3. **Load ramp rate**: Normal load changes at ~1-2% per minute. >10% per minute → manipulation
4. **Demand forecast deviation**: Actual demand vs forecast model diverges by >30%

### 3.4 Attack #4: Sensor Tampering (Slow Drift)

**Real-world basis**: Stealthy attack where attacker gradually biases sensor calibration over hours/days to evade threshold-based detection. By the time the reading is obviously wrong, the operator has been conditioned to the new baseline.

**What the simulation does**:
```typescript
function injectSensorTamper(clean: GridTelemetry, elapsed: number): GridTelemetry {
  // elapsed = seconds since attack started
  // Slow linear drift: 0.05 kV per second on voltage
  // After 60 seconds: 3kV drift. After 200 seconds: 10kV drift
  const drift = 0.05 * elapsed;
  return {
    ...clean,
    voltage: clean.voltage + drift,
    // Also subtly adjust current to maintain apparent P=V×I consistency
    current: clean.current * (clean.voltage / (clean.voltage + drift)),
  };
}
```

**Observable signature**:
- Very slow, monotonic drift in one direction (no mean-reversion)
- Passes instant threshold checks for a long time
- Eventually crosses bounds
- Statistical: the mean of a sliding window keeps shifting (non-stationary)

**Detection methods**:
1. **CUSUM (Cumulative Sum)**: Detects small persistent shifts that Z-score misses. Ideal for slow drift.
2. **Sliding window mean comparison**: Compare 5-min mean vs 30-min mean. If divergence grows monotonically → drift.
3. **Stationarity test**: Simplified ADF-like test — if data isn't mean-reverting → alarm.
4. **Physics cross-check**: Slowly the P=V×I×cosφ consistency degrades as the attacker can't perfectly fake all parameters.

### 3.5 Attack #5: Smart Meter Compromise

**Real-world basis**: Smart meter firmware hacking to report zero or reduced consumption — energy theft at scale. Also used to mask actual load conditions from grid operators.

**What the simulation does**:
```typescript
function injectMeterAttack(clean: GridTelemetry): GridTelemetry {
  // BUS-003 smart meters compromised — report zero consumption
  // But actual load still exists (current still flows)
  return {
    ...clean,
    meterConsumption: 0,            // Meters say zero
    meterCount: clean.meterCount,   // Same number of meters
    // BUT: actual bus-level measurements remain correct
    activePower: clean.activePower, // Bus PMU still shows real load
    current: clean.current,         // Real current still flows
  };
}
```

**Observable signature**:
- Smart meter aggregate reads 0 MW but bus-level PMU reads -85 MW → discrepancy
- Revenue anomaly: zero billing but power still flowing
- Load balance: sum of smart meters ≠ bus-level measurement

**Detection methods**:
1. **Cross-source validation**: Compare meter_aggregate vs PMU reading. If |PMU - meters| > 10% → compromise.
2. **Statistical dropout**: If meters suddenly all read zero simultaneously → coordinated attack.
3. **Revenue analytics**: Zero consumption on a weekday at 14:00 from 50,000 meters → impossible.

---

## 4. DETECTION ENGINE — ARCHITECTURE

### 4.1 Three-Layer Detection Pipeline

```
Telemetry In (1/sec)
       │
       ▼
┌──────────────────┐
│  LAYER 1: RULES  │  ← Instant (< 100ms)
│  Threshold checks │
│  Rate-of-change  │
│  Bounds checking │
└────────┬─────────┘
         │ Pass-through + flags
         ▼
┌──────────────────┐
│ LAYER 2: PHYSICS │  ← Fast (< 500ms)
│  P=V×I×cosφ     │
│  Cross-bus corr  │
│  Power balance   │
│  Topology check  │
└────────┬─────────┘
         │ Pass-through + flags
         ▼
┌──────────────────┐
│ LAYER 3: ML/STAT │  ← Near-real-time (< 2s)
│  Isolation Forest │
│  CUSUM detector  │
│  Z-score (3σ)    │
│  Forecast model  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ALERT CLASSIFIER │
│  Correlate flags │
│  Assign severity │
│  Identify attack │
│  Generate reco.  │
└──────────────────┘
         │
         ▼
    Alert Event → WebSocket → Dashboard
```

### 4.2 Rule Definitions (Layer 1)

```typescript
interface Rule {
  id: string;
  name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  check: (current: GridTelemetry, previous: GridTelemetry) => boolean;
  message: string;
}

const RULES: Rule[] = [
  {
    id: 'R001',
    name: 'VOLTAGE_OUT_OF_BOUNDS',
    severity: 'HIGH',
    check: (d) => d.voltage < 207 || d.voltage > 253,
    message: 'Voltage outside ±10% tolerance on {busId}',
  },
  {
    id: 'R002',
    name: 'FREQUENCY_CRITICAL',
    severity: 'CRITICAL',
    check: (d) => d.frequency < 49.5 || d.frequency > 50.5,
    message: 'System frequency critical deviation: {frequency}Hz',
  },
  {
    id: 'R003',
    name: 'VOLTAGE_RATE_OF_CHANGE',
    severity: 'HIGH',
    check: (d, prev) => Math.abs(d.voltage - prev.voltage) > 10,
    message: 'Voltage rate-of-change exceeded 10kV/s on {busId}',
  },
  {
    id: 'R004',
    name: 'ROCOF_EXCEEDED',
    severity: 'CRITICAL',
    check: (d, prev) => Math.abs(d.frequency - prev.frequency) > 0.5,
    message: 'Rate of Change of Frequency >0.5 Hz/s — possible generation loss',
  },
  {
    id: 'R005',
    name: 'ZERO_METER_READING',
    severity: 'MEDIUM',
    check: (d) => d.meterConsumption === 0 && Math.abs(d.activePower) > 10,
    message: 'Smart meter aggregate zero but bus load detected on {busId}',
  },
  {
    id: 'R006',
    name: 'BREAKER_UNEXPECTED',
    severity: 'CRITICAL',
    check: (d, prev) => d.breakerStatus === 'TRIP' && prev.breakerStatus === 'CLOSED',
    message: 'Unexpected breaker trip on {busId} — no preceding fault detected',
  },
  {
    id: 'R007',
    name: 'LINE_OVERLOAD',
    severity: 'HIGH',
    check: (d) => d.lineFlows.some(l => l.loadingPercent > 95),
    message: 'Transmission line overload >95% capacity',
  },
  {
    id: 'R008',
    name: 'POWER_FACTOR_LOW',
    severity: 'LOW',
    check: (d) => d.powerFactor < 0.80,
    message: 'Power factor below 0.80 on {busId}',
  },
  {
    id: 'R009',
    name: 'TRANSFORMER_OVERHEAT',
    severity: 'HIGH',
    check: (d) => d.transformerTemp > 80,
    message: 'Transformer temperature critical: {transformerTemp}°C on {busId}',
  },
];
```

### 4.3 Physics Consistency Checks (Layer 2)

```typescript
interface PhysicsCheck {
  id: string;
  name: string;
  check: (buses: GridTelemetry[], lines: LineFlow[]) => PhysicsViolation | null;
}

const PHYSICS_CHECKS: PhysicsCheck[] = [
  {
    id: 'P001',
    name: 'POWER_BALANCE',
    // Total generation must equal total load + losses (within 5%)
    check: (buses) => {
      const totalGen = sum(buses.filter(b => b.activePower > 0).map(b => b.activePower));
      const totalLoad = sum(buses.filter(b => b.activePower < 0).map(b => Math.abs(b.activePower)));
      const imbalance = Math.abs(totalGen - totalLoad) / totalGen;
      if (imbalance > 0.05) return { type: 'POWER_IMBALANCE', value: imbalance };
      return null;
    },
  },
  {
    id: 'P002',
    name: 'VOLTAGE_COUPLING',
    // Adjacent bus voltages must be correlated (within ±15% of each other)
    check: (buses, lines) => {
      for (const line of lines) {
        const fromBus = buses.find(b => b.busId === line.fromBus);
        const toBus = buses.find(b => b.busId === line.toBus);
        if (fromBus && toBus) {
          const ratio = fromBus.voltage / toBus.voltage;
          if (ratio > 1.15 || ratio < 0.85) {
            return { type: 'VOLTAGE_DECOUPLING', buses: [fromBus.busId, toBus.busId] };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'P003',
    name: 'POWER_EQUATION_CONSISTENCY',
    // P ≈ V × I × cos(φ) — must hold for each bus
    check: (buses) => {
      for (const bus of buses) {
        const computed = bus.voltage * bus.current * bus.powerFactor / 1000; // kW to MW scaling
        const reported = Math.abs(bus.activePower);
        if (reported > 1 && Math.abs(computed - reported) / reported > 0.15) {
          return { type: 'POWER_EQUATION_VIOLATION', busId: bus.busId };
        }
      }
      return null;
    },
  },
  {
    id: 'P004',
    name: 'FREQUENCY_CONSENSUS',
    // All buses must report similar frequency (within 0.1 Hz)
    check: (buses) => {
      const freqs = buses.map(b => b.frequency);
      const maxDiff = Math.max(...freqs) - Math.min(...freqs);
      if (maxDiff > 0.1) {
        return { type: 'FREQUENCY_DISAGREEMENT', maxDiff };
      }
      return null;
    },
  },
];
```

### 4.4 Statistical/ML Detection (Layer 3)

| Method | Detects | Implementation |
|--------|---------|---------------|
| **Z-Score (3σ)** | Sudden anomalies | Rolling 60-sample window per bus per parameter. Flag if |z| > 3 |
| **CUSUM** | Slow drift | Cumulative sum of deviations from mean. Flag if CUSUM > threshold (4σ) |
| **Cross-Bus Correlation** | FDI, coordinated attacks | Pearson correlation between adjacent bus voltages over 30-sample window. Flag if ρ < 0.7 (normally >0.85) |
| **Isolation Forest (ONNX)** | Complex multi-dimensional anomalies | Trained on normal data features: [voltage, frequency, power, RoCoF, power_factor, voltage_deviation_from_mean, load_forecast_error]. Score > 0.65 → anomaly |
| **Load Forecast Deviation** | MaDIoT, meter attacks | Compare actual load vs expected from daily curve. Flag if deviation > 25% |

### 4.5 Alert Data Model

```typescript
interface ThreatAlert {
  id: string;                           // UUID
  timestamp: string;                    // ISO 8601
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  threatCategory: ThreatCategory;
  title: string;                        // "False Data Injection Detected"
  description: string;                  // Detailed explanation
  affectedAssets: string[];             // ["BUS-003", "TL-01"]
  detectionLayers: string[];            // ["RULE:R001", "PHYSICS:P002", "ML:IsolationForest"]
  confidence: number;                   // 0.0 - 1.0
  indicators: Indicator[];              // Evidence
  recommendation: string;              // "Isolate BUS-003 from SCADA network..."
  mitreTactic: string;                  // MITRE ATT&CK for ICS mapping
  status: 'ACTIVE' | 'INVESTIGATING' | 'MITIGATED' | 'FALSE_POSITIVE';
}

type ThreatCategory =
  | 'FALSE_DATA_INJECTION'
  | 'COMMAND_SPOOFING'
  | 'LOAD_MANIPULATION'
  | 'SENSOR_TAMPERING'
  | 'SMART_METER_COMPROMISE'
  | 'UNKNOWN_ANOMALY';

interface Indicator {
  parameter: string;    // "voltage"
  busId: string;        // "BUS-003"
  expected: number;     // 230
  actual: number;       // 258
  deviation: string;    // "+12.2%"
}
```

---

## 5. PROJECT STRUCTURE

```
vajragrid/
├── src/
│   ├── app/                          # Next.js 16 App Router
│   │   ├── layout.tsx                # Root layout — dark theme, fonts
│   │   ├── page.tsx                  # Main dashboard (command center)
│   │   ├── globals.css               # Tailwind v4 CSS-first theme
│   │   ├── api/
│   │   │   ├── simulation/
│   │   │   │   ├── start/route.ts    # POST — start simulation
│   │   │   │   ├── stop/route.ts     # POST — stop simulation
│   │   │   │   ├── attack/route.ts   # POST — inject attack
│   │   │   │   └── reset/route.ts    # POST — reset to normal
│   │   │   ├── alerts/
│   │   │   │   ├── route.ts          # GET — alert history
│   │   │   │   └── [id]/route.ts     # GET — single alert details
│   │   │   └── system/
│   │   │       └── status/route.ts   # GET — system state
│   │   └── operator/
│   │       └── page.tsx              # Operator console (attack controls)
│   │
│   ├── components/                   # UI Components
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── dashboard/
│   │   │   ├── CommandCenter.tsx      # Main layout container
│   │   │   ├── SystemStatusBar.tsx    # Top bar: status, uptime, threats
│   │   │   ├── GridTopologyMap.tsx    # React Flow — 5 bus interactive map
│   │   │   ├── BusNode.tsx            # Custom React Flow node for each bus
│   │   │   ├── TransmissionLine.tsx   # Custom edge with flow animation
│   │   │   ├── TelemetryCharts.tsx    # Real-time voltage/frequency/power charts
│   │   │   ├── AlertPanel.tsx         # Scrolling threat feed
│   │   │   ├── AlertDetail.tsx        # Expanded alert with indicators
│   │   │   └── MetricCards.tsx        # Tremor metric cards
│   │   └── operator/
│   │       ├── AttackControlPanel.tsx  # Buttons to trigger attacks
│   │       └── SimulationControls.tsx  # Speed, pause, reset
│   │
│   ├── lib/                          # Core logic (shared)
│   │   ├── types/
│   │   │   ├── grid.ts               # GridTelemetry, LineFlow, SystemState
│   │   │   ├── alerts.ts             # ThreatAlert, ThreatCategory
│   │   │   └── simulation.ts         # AttackConfig, SimulationState
│   │   │
│   │   ├── simulation/               # Person A's domain
│   │   │   ├── GridModel.ts           # 5-bus topology definition
│   │   │   ├── PowerFlowEngine.ts     # Simplified power flow calculator
│   │   │   ├── DataGenerator.ts       # Normal telemetry generator
│   │   │   ├── LoadCurve.ts           # 24-hour load profile
│   │   │   ├── NoiseGenerator.ts      # Gaussian noise + occasional transients
│   │   │   └── attacks/
│   │   │       ├── FDIAttack.ts
│   │   │       ├── CommandSpoof.ts
│   │   │       ├── MaDIoTAttack.ts
│   │   │       ├── SensorTamper.ts
│   │   │       └── MeterAttack.ts
│   │   │
│   │   ├── detection/                # Person B's domain
│   │   │   ├── RuleEngine.ts          # Layer 1: threshold rules
│   │   │   ├── PhysicsEngine.ts       # Layer 2: physics consistency
│   │   │   ├── StatisticalEngine.ts   # Layer 3a: Z-score, CUSUM, correlation
│   │   │   ├── MLEngine.ts            # Layer 3b: ONNX Isolation Forest
│   │   │   ├── AlertClassifier.ts     # Combine signals → attack classification
│   │   │   └── AlertStore.ts          # In-memory alert history
│   │   │
│   │   ├── realtime/
│   │   │   ├── SocketServer.ts        # Socket.IO server setup
│   │   │   └── SocketClient.ts        # Client-side hook: useGridTelemetry()
│   │   │
│   │   └── constants/
│   │       ├── gridConfig.ts          # Bus specs, line specs, topology
│   │       └── thresholds.ts          # All detection thresholds
│   │
│   └── hooks/                        # React hooks
│       ├── useGridTelemetry.ts        # Subscribe to real-time data
│       ├── useAlerts.ts               # Subscribe to alert feed
│       └── useSystemStatus.ts         # Subscribe to system state
│
├── ml/                               # Python ML pipeline
│   ├── generate_training_data.py      # Generate normal + attack labeled data
│   ├── train_isolation_forest.py      # Train model
│   ├── export_to_onnx.py             # Export to ONNX format
│   └── model/
│       └── anomaly_detector.onnx      # Trained model for browser
│
├── public/
│   ├── models/
│   │   └── anomaly_detector.onnx      # Served to browser
│   └── sounds/
│       └── alert.mp3                  # Alert notification sound
│
├── tailwind.css                       # Tailwind v4 CSS-first config
├── next.config.ts                     # Next.js 16 config
├── package.json
├── tsconfig.json
└── README.md
```

---

## 6. WORKSTREAM DIVISION — TEAM OF 3

### Person A: Simulation & Data Engine
**Owns**: `src/lib/simulation/`, `src/lib/types/`, `src/lib/constants/`, API routes
**Deliverables by day**:

| Day | Deliverable |
|-----|------------|
| 1 | Grid topology model, normal data generator with load curve + noise, WebSocket server streaming telemetry |
| 2 | All 5 attack injectors working, API routes for start/stop/attack/reset |
| 3 | Fine-tune realism: cascading effects, transient responses, solar variability on BUS-002 |
| 4 | Demo sequence: pre-programmed attack timeline for automated demo mode |
| 5 | Bug fixes, demo rehearsal support |

### Person B: Detection Engine & Backend
**Owns**: `src/lib/detection/`, `ml/`, ONNX model
**Deliverables by day**:

| Day | Deliverable |
|-----|------------|
| 1 | Rule engine (all 9 rules), alert data model, alert store |
| 2 | Physics engine (all 4 checks), alert classifier |
| 3 | Statistical engine (Z-score, CUSUM, correlation), ML training pipeline in Jupyter |
| 4 | ONNX model trained and loaded in browser, confidence scoring tuned |
| 5 | False positive reduction, demo rehearsal support |

### Person C: Dashboard & Visualization
**Owns**: `src/app/`, `src/components/`, `src/hooks/`, styling
**Deliverables by day**:

| Day | Deliverable |
|-----|------------|
| 1 | Project scaffold (Next.js 16 + Tailwind v4 + shadcn), layout, system status bar, one real-time chart |
| 2 | Grid topology map (React Flow with 5 buses + 6 lines), alert panel, attack control panel |
| 3 | Full telemetry charts (voltage, frequency, power), metric cards, alert detail view |
| 4 | Polish: animations, color transitions (green→amber→red), alert sounds, responsive layout |
| 5 | Final polish, demo mode button, presentation slides support |

### Integration Contract (Agreed Day 1, Hour 1)

Everyone codes to these shared interfaces in `src/lib/types/`:
```typescript
// Simulation → Detection → Dashboard event bus
interface SimulationEvent {
  type: 'telemetry' | 'system_state';
  data: GridTelemetry | SystemState;
}

interface DetectionEvent {
  type: 'alert' | 'alert_update';
  data: ThreatAlert;
}

// Socket.IO channels
// 'grid:telemetry'   → SimulationEvent (1/sec per bus)
// 'grid:system'      → SystemState (1/sec)
// 'grid:alert'       → DetectionEvent (on detection)
```

---

## 7. DAY-BY-DAY BUILD SCHEDULE

### Day 1: Foundation (8 hours)

**Hour 1-2: Setup**
- Person C scaffolds project, pushes to GitHub
- All clone, verify `pnpm dev` works
- Agree on interfaces in `src/lib/types/`

**Hour 2-4: Parallel Build**
- A: GridModel.ts + DataGenerator.ts + LoadCurve.ts → generates fake telemetry
- B: RuleEngine.ts + AlertStore.ts → processes telemetry, stores alerts
- C: Layout, SystemStatusBar, one Recharts line chart

**Hour 4-6: Integration**
- A: WebSocket server streaming telemetry
- C: useGridTelemetry hook consuming WebSocket
- First "data flowing to chart" milestone ✅

**Hour 6-8: Polish Day 1**
- A: Noise generator, realistic voltage/frequency curves
- B: All 9 rules implemented and unit-tested against mock data
- C: Chart showing live voltage + frequency for one bus

**Day 1 Milestone**: Live data streaming from simulation → detection → dashboard. One chart updating in real-time.

### Day 2: Core Features (8 hours)

**Hour 1-4:**
- A: All 5 attack injectors + API routes
- B: Physics engine (4 checks) + alert classifier
- C: Grid topology map (React Flow) + alert panel

**Hour 4-6:**
- Integration: Trigger attack via API → detection fires → alert appears on dashboard
- Grid map buses change color on alert

**Hour 6-8:**
- A: Attack control panel API integration
- B: Confidence scoring logic
- C: Operator console page with attack buttons

**Day 2 Milestone**: Full attack → detect → alert → visualize loop working for at least 2 attack types.

### Day 3: Intelligence (8 hours)

**Hour 1-4:**
- A: Fine-tune attack realism (cascading effects, timing)
- B: Statistical engine (Z-score + CUSUM + correlation) + ML training in Jupyter
- C: Multi-chart dashboard (voltage, frequency, power per bus)

**Hour 4-6:**
- B: Export Isolation Forest to ONNX, load in browser
- C: Alert detail panel, metric cards (Tremor)

**Hour 6-8:**
- Integration testing: all 5 attacks detected correctly
- Fix false positives / missed detections

**Day 3 Milestone**: All 5 attacks implemented and detected. ML model running in browser. Dashboard shows comprehensive data.

### Day 4: Polish & Demo (8 hours)

**Hour 1-3:**
- C: Visual polish — transitions, animations, dark theme refinement
- A: Demo sequence mode (automated attack timeline)
- B: Tune detection thresholds, reduce false positives

**Hour 3-5:**
- C: Alert sounds, pulsing animations on threatened buses
- A+B: Edge case testing

**Hour 5-8:**
- Full demo rehearsal (3 run-throughs)
- Fix any issues found during rehearsal
- Record backup video of working demo

**Day 4 Milestone**: Demo-ready system. Automated demo sequence plays perfectly.

### Day 5: Competition Day (4 hours prep)

**Hour 1-2:**
- Final bug fixes
- Verify demo on presentation machine
- Deploy to Vercel as backup

**Hour 2-4:**
- Presentation rehearsal (timing, transitions, talking points)
- Prepare answers for likely judge questions
- Confidence check: every team member can explain any part

---

## 8. DEMO SCRIPT

### Screen Layout During Demo
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ VAJRAGRID COMMAND CENTER          │ 🟢 NOMINAL │ THREATS: 0 │
│ Autonomous Threat Detection          │ UPTIME: 47:23:15        │
├──────────────────────────────────────┴─────────────────────────┤
│                                                                │
│         [INTERACTIVE GRID TOPOLOGY MAP]                        │
│                                                                │
│    🟢 BUS-001 ═══════ 🟢 BUS-003 ═══════ 🟢 BUS-005          │
│    Indrapura         Shakti Nagar        Sudarshan Hub         │
│    GEN:148MW    ═══  LOAD:83MW     ═══   LOAD:44MW            │
│        │                 │                    │                │
│    🟢 BUS-002 ══════════╝═══════════ 🟢 BUS-004               │
│    Vajra Solar                       Kavach Grid               │
│    GEN:78MW                          LOAD:59MW                 │
│                                                                │
├────────────────────────────┬───────────────────────────────────┤
│ SCADA TELEMETRY           │ THREAT INTELLIGENCE FEED           │
│ [Voltage Chart ~~~]       │                                    │
│ [Frequency Chart ~~~]     │  No active threats                 │
│ [Power Chart ~~~]         │  System operating within normal    │
│                           │  parameters                        │
└────────────────────────────┴───────────────────────────────────┘
```

### Narration Flow (5 minutes)

**[0:00-0:30]** — HOOK
> "In December 2015, Russian hackers took down the Ukrainian power grid — 230,000 people lost electricity in winter. In 2024, cyberattacks on Ukraine's energy grid surged 70%. VajraGrid is our answer: real-time AI-powered cyber defense for smart power infrastructure."

**[0:30-1:30]** — NORMAL OPERATIONS
> "You're looking at a live simulation of 5 interconnected substations. All buses are green. Voltage at 230kV ±2%, frequency locked at 50.00Hz. Watch the real-time telemetry — this is what normal grid behavior looks like."
*Point at: smooth charts, green nodes, steady metrics*

**[1:30-2:30]** — ATTACK 1: FALSE DATA INJECTION
> "Now I'm going to simulate a sophisticated attacker who has compromised the SCADA channel to Substation 3 — Shakti Nagar, our main urban load center."
*Click: Inject FDI Attack on BUS-003*
> "Watch — the voltage reading on Bus 3 just spiked to 258kV. But VajraGrid caught it in under 2 seconds. Three detection layers fired:"
> "Rule engine: voltage out of bounds. Physics engine: no corresponding change on adjacent buses — physically impossible. ML engine: anomaly score 0.91."
*Point at: red node, alert panel, detection layer badges*

**[2:30-3:30]** — ATTACK 2: LOAD MANIPULATION (MaDIoT)
> "This next attack is scarier. A botnet of 50,000 compromised IoT devices — smart water heaters, EV chargers — simultaneously spikes demand across the entire grid."
*Click: Inject MaDIoT Attack*
> "Frequency is dropping — 49.8... 49.5... 49.2 Hz. All load buses are red. VajraGrid detected the coordinated nature of this attack — all buses spiking simultaneously with 0.97 correlation, which never happens naturally. Alert: CRITICAL."
*Point at: frequency chart diving, all nodes going red*

**[3:30-4:15]** — ATTACK 3: STEALTH SENSOR TAMPERING
*Click: Reset, then Inject Sensor Tamper*
> "This is the hardest one to detect. The attacker is slowly drifting voltage readings by 0.05kV per second. Simple threshold checks miss this for a long time. But VajraGrid uses CUSUM — a statistical method that accumulates tiny deviations. Watch..."
*Wait 30 seconds*
> "There — MEDIUM alert, escalating to HIGH. VajraGrid caught a stealthy attack that threshold-based systems would miss for hours."

**[4:15-5:00]** — WRAP-UP
> "VajraGrid detected all 5 attack categories — including false data injection, command spoofing, MaDIoT, sensor tampering, and smart meter compromise — with an average detection time under 3 seconds. It uses a three-layer architecture: rule-based policy enforcement, physics-consistency validation, and an AI behavioral analytics engine running entirely in the browser."
> "This is built on open standards: IEC 62351 for security, IEEE C37.118 for synchrophasor data, and aligned with NERC CIP compliance requirements."
> "VajraGrid: defending the grid at machine speed."

---

## 9. JUDGE Q&A PREPARATION

| Likely Question | Answer |
|----------------|--------|
| "How is this different from existing SCADA security?" | "Existing SCADA security is perimeter-based — firewalls, VPNs. VajraGrid operates at the data layer, validating that sensor readings are physically consistent. Even if an attacker is inside the network, we catch the false data." |
| "Would this work on a real grid?" | "The detection principles are sound — physics-based validation and statistical anomaly detection are used in research and some production systems. Our simulation uses realistic IEEE bus parameters and CERC-standard thresholds. The bridge to production would be integrating with IEC 61850 data feeds and NERC CIP compliance." |
| "Why not just use deep learning?" | "We deliberately chose interpretable methods. A grid operator needs to trust and understand why an alert fired. Our three-layer approach gives explainable detections: 'voltage exceeded bounds' + 'physics violation on these buses' + 'ML anomaly score 0.91'. A black-box DNN can't do that." |
| "What about false positives?" | "Our three-layer approach is specifically designed to reduce false positives. A single threshold breach is just a warning. We require corroboration from physics checks and statistical analysis before escalating to CRITICAL. Confidence scoring combines evidence from all layers." |
| "How does the ML work?" | "We trained an Isolation Forest on 1000+ samples of normal grid behavior. It learns the normal operating envelope in 7-dimensional feature space. When attacked data falls outside that envelope, it gets a high anomaly score. The model runs in-browser via ONNX Runtime WebAssembly." |
| "What standards does this comply with?" | "We reference IEC 62351 for SCADA security, IEEE C37.118 for synchrophasor measurement, IEC 61850 for substation communication, and NERC CIP-003-11 for cybersecurity management controls." |

---

## 10. RISK MITIGATION

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| ML model doesn't train well | Medium | Rule-based + physics detection works without ML. ML is a bonus layer. |
| React Flow performance with animations | Low | Limit to 5 nodes. Use CSS animations, not JS. |
| WebSocket instability | Low | Socket.IO has auto-reconnect. Add reconnection indicator in UI. |
| Charts lag with real-time data | Medium | Buffer last 120 data points only. Use Recharts `isAnimationActive={false}` for real-time mode. |
| Next.js 16 breaking changes | Low | We're starting fresh, not migrating. Follow docs exactly. |
| Tailwind v4 CSS-first unfamiliar | Medium | shadcn handles most of it. Custom theme is just CSS variables. |
| Demo fails on presentation day | High | Record backup video on Day 4. Deploy to Vercel. Have local copy ready. |
| Team member sick/blocked | Medium | Every module has clear interfaces. Any member can pick up another's work with the interface contracts. |

---

## 11. PRESENTATION ENHANCEMENT

### Naming Convention (Use These Everywhere in UI)

| Internal Term | Professional Term |
|--------------|------------------|
| Dashboard | **Command Center** |
| Alerts | **Threat Intelligence Feed** |
| Detection engine | **Behavioral Analytics Engine** |
| Rule checks | **Policy Enforcement Layer** |
| Physics checks | **Cyber-Physical Validation Matrix** |
| ML model | **Autonomous Anomaly Classifier** |
| Data stream | **SCADA Telemetry Feed** |
| Attack buttons | **Threat Simulation Console** |
| Normal state | **NOMINAL** |
| Bus | **Critical Node / Protected Asset** |
| Lines | **Transmission Corridors** |

### Visual Design Directives
- **Background**: `#0a0e1a` (near-black navy) — every SOC uses this
- **Primary accent**: Electric blue `#3b82f6`
- **Nominal**: `#10b981` (emerald green)
- **Warning**: `#f59e0b` (amber)
- **Critical**: `#ef4444` (red) with pulse animation
- **Fonts**: Inter for UI, JetBrains Mono for telemetry readings
- **Cards**: Subtle glass morphism with `backdrop-blur-sm bg-white/5 border border-white/10`
- **Charts**: Dark background, thin bright lines, no grid lines (clean)
- **Grid map**: Dark background, glowing connections, pulsing nodes
- **Scrolling log**: Monospace, newest at top, auto-scroll, timestamp prefix

---

*This plan is built for a team that ships. The tech is validated, the domain is researched, the schedule is tight but realistic. Execute with discipline — merge code daily, test against the demo script nightly, and rehearse until the demo is muscle memory.*

*VajraGrid: Defending the grid at machine speed. ⚡*
