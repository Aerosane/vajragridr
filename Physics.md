# VajraGrid Physics Engine Documentation

> Every equation, threshold, constant, and physical model in the VajraGrid simulation and detection pipeline.

---

## Table of Contents

1. [Grid Topology Model](#1-grid-topology-model)
2. [Time Model](#2-time-model)
3. [Load & Generation Curves](#3-load--generation-curves)
4. [Telemetry Generation Physics](#4-telemetry-generation-physics)
5. [Noise Model](#5-noise-model)
6. [Line Flow Model](#6-line-flow-model)
7. [System State Computation](#7-system-state-computation)
8. [Detection Layer 1: Rule Engine](#8-detection-layer-1-rule-engine)
9. [Detection Layer 2: Physics Engine](#9-detection-layer-2-physics-engine)
10. [Detection Layer 3: Statistical Engine](#10-detection-layer-3-statistical-engine)
11. [Detection Layer 4: ML Detector](#11-detection-layer-4-ml-detector)
12. [Alert Classifier (Threat Fusion)](#12-alert-classifier-threat-fusion)
13. [Attack Injection Models](#13-attack-injection-models)
14. [VajraShield Self-Healing (FLISR)](#14-vajrashield-self-healing-flisr)
15. [Physical Constants Reference](#15-physical-constants-reference)

---

## 1. Grid Topology Model

VajraGrid simulates a **5-bus regional smart grid** inspired by a simplified IEEE 9-bus topology. All buses operate at 230 kV nominal voltage.

### Bus Definitions

| Bus ID  | Name          | Type    | Rated Gen (MW) | Rated Load (MW) | Smart Meters | Coordinates (lat, lon)  |
|---------|---------------|---------|----------------|------------------|--------------|-------------------------|
| BUS-001 | Indrapura     | SLACK   | 150            | 0                | 0            | 28.6139, 77.2090        |
| BUS-002 | Vajra Solar   | PV_GEN  | 80             | 0                | 0            | 28.5800, 77.1500        |
| BUS-003 | Shakti Nagar  | PQ_LOAD | 0              | 85               | 52,000       | 28.6500, 77.2500        |
| BUS-004 | Kavach Grid   | PQ_LOAD | 0              | 60               | 15,000       | 28.5500, 77.3000        |
| BUS-005 | Sudarshan Hub | PQ_LOAD | 0              | 45               | 28,000       | 28.6000, 77.3500        |

**Bus types:**
- **SLACK**: Reference bus. Absorbs generation-load mismatch. Maintains system balance.
- **PV_GEN**: Solar photovoltaic generator. Output follows solar irradiance curve.
- **PQ_LOAD**: Load bus. Consumes power per daily demand curve. Has smart meters.

### Transmission Lines

| Line ID | From    | To      | R (p.u.) | X (p.u.) | Capacity (MW) | Length (km) |
|---------|---------|---------|-----------|-----------|---------------|-------------|
| TL-01   | BUS-001 | BUS-003 | 0.010     | 0.085     | 200           | 80          |
| TL-02   | BUS-001 | BUS-002 | 0.017     | 0.092     | 150           | 120         |
| TL-03   | BUS-002 | BUS-004 | 0.032     | 0.161     | 100           | 95          |
| TL-04   | BUS-003 | BUS-005 | 0.039     | 0.170     | 100           | 70          |
| TL-05   | BUS-004 | BUS-005 | 0.085     | 0.072     | 80            | 50          |
| TL-06   | BUS-002 | BUS-003 | 0.009     | 0.072     | 150           | 60          |

The topology forms a meshed network with 6 lines connecting 5 buses, providing redundant paths for load rerouting during fault isolation.

---

## 2. Time Model

```
1 tick = 1 second of real time = 1 minute of simulated time
1440 ticks = 24 hours simulated = 24 minutes real time
```

**Conversion:**
```
hour(tick) = (tick mod 1440) / 60    // Range: [0, 24)
```

This compression means a full 24-hour grid cycle runs in 24 real-time minutes, suitable for live demo.

---

## 3. Load & Generation Curves

### Daily Load Factor

Composite of residential, commercial, and industrial patterns following the Indian grid NLDC profile:

```
loadFactor(h) = min(1.0, baseLoad + morningRamp + eveningPeak + middayActivity)
```

Where:
- `baseLoad = 0.3` (constant base demand)
- `morningRamp = 0.25 * max(0, sin((h - 5) * pi / 8))` (industrial 6 AM start, peaks 9-10 AM)
- `eveningPeak = 0.40 * exp(-0.5 * ((h - 19) / 2.5)^2)` (residential + commercial, peaks 7 PM)
- `middayActivity = 0.15 * exp(-0.5 * ((h - 12) / 4)^2)` (office hours)

Output range: [0.3, 1.0]. Peak at ~19:00 IST.

### Solar Generation Factor

Bell curve centered at solar noon:

```
solarFactor(h) = 0                                   if h < 6 or h > 18
                 exp(-0.5 * ((h - 12) / 3)^2)        otherwise
```

Output range: [0, 1.0]. Peak at 12:00, zero before 6 AM and after 6 PM.

### ML Training Load Curve

The training pipeline uses a slightly different profile to ensure diversity:

```
profile(h) = 0.60
           + 0.25 * exp(-0.5 * ((h - 11) / 2.5)^2)     // morning peak
           + 0.35 * exp(-0.5 * ((h - 20) / 2.0)^2)      // evening peak
           - 0.15 * exp(-0.5 * ((h - 3) / 2.0)^2)       // night dip
```

---

## 4. Telemetry Generation Physics

Each tick generates a `GridTelemetry` object per bus. All physics is in `DataGenerator.ts`.

### Active Power (P)

**SLACK bus:**
```
P_slack = totalLoad - solarGen + losses + noise
totalLoad = SUM(ratedLoad_i * loadFactor) for all PQ_LOAD buses
solarGen  = SUM(ratedGen_i * solarFactor) for all PV_GEN buses
losses    = totalLoad * 0.03              (3% transmission losses)
noise     ~ N(0, 0.02 * P_slack)          (2% Gaussian)
```

**PV_GEN bus:**
```
P_solar = ratedGeneration * solarFactor * (1 + N(0, 0.06))
```
Note: Solar noise is 3x higher than load noise (cloud variability).

**PQ_LOAD bus:**
```
P_load = -(ratedLoad * loadFactor * (1 + N(0, 0.02)))
```
Negative sign indicates consumption.

### Reactive Power (Q)

```
Q_slack  = P_slack * 0.2     (typical reactive ratio for slack)
Q_solar  = P_solar * 0.05    (near-unity PF for inverter-based)
Q_load   = P_load * 0.3      (typical inductive load ratio)
```

### Power Factor (PF)

```
PF_slack  = 0.98              (fixed)
PF_solar  = 0.99              (fixed)
PF_load   = N(0.92, 0.01)    clamped to [0.8, 1.0]
```

### Voltage (V)

```
V = V_nominal + loadEffect + transientNoise + N(0, 1.5 kV)
```

Where:
- `V_nominal = 230 kV` (all buses)
- `loadEffect = -k * loadFactor * 5` for PQ_LOAD buses only
- `k = 0.05` (voltage regulation coefficient)
- `transientNoise`: random spike with P(spike) = 0.005, magnitude ~ N(0, 3 kV)
- Result clamped to [200, 260] kV

**Isolated bus (VajraShield active):**
```
V_isolated = N(0, 2)   clamped to [0, 10] kV    (voltage collapse)
```

### Frequency (f)

System-wide frequency with per-bus jitter:
```
f = N(50.0 Hz, 0.015 Hz)   clamped to [49.5, 50.5] Hz
```

### Current (I)

Derived from power and voltage (3-phase):
```
I = |P| * 1000 / (V * sqrt(3))     [Amperes]
```

### Phase Angle (delta)

```
delta_slack = 0 degrees          (reference bus)
delta_load  = N(-5 * loadFactor, 2)   clamped to [-30, 30] degrees
```

### Transformer Temperature

```
T_ambient = 25 + 10 * sin((hour - 6) * pi / 12)     // hotter in afternoon
T_transformer = N(T_ambient + 20 * loadFactor, 0.5)  clamped to [20, 100] C
```

### Smart Meter Consumption

```
meterConsumption = |P_load| * (1 + N(0, 0.02))   for PQ_LOAD buses
                 = 0                               for other buses
```

---

## 5. Noise Model

All noise uses **Box-Muller Gaussian** generation:

```
z = sqrt(-2 * ln(u1)) * cos(2 * pi * u2)     where u1, u2 ~ Uniform(0,1)
noise = z * stdDev + mean
```

### Noise Parameters

| Parameter     | Mean | Std Dev     | Unit  | Notes                     |
|---------------|------|-------------|-------|---------------------------|
| Voltage       | 0    | 1.5         | kV    | PMU measurement noise     |
| Frequency     | 0    | 0.015       | Hz    | PMU precision +/-0.005 Hz |
| Power         | 0    | 2% of rated | MW    | SCADA measurement noise   |
| Power Factor  | 0    | 0.01        | -     | Meter precision           |
| Temperature   | 0    | 0.5         | C     | Sensor noise              |

### Transient Noise

```
transient(P=0.005) = N(0, 3 kV)   with probability 0.5%
                   = 0              otherwise
```

Simulates random voltage spikes from switching events, capacitor banks, etc.

---

## 6. Line Flow Model

For each transmission line connected to a bus:

```
flowDirection = +1 if line.fromBus == bus.id, else -1
flowMW        = (|P_bus| / 3) * flowDirection * (1 + N(0, 0.05))
flowMVAR      = flowMW * 0.15
lineCurrent   = |flowMW| * 1000 / (V * sqrt(3))
loading%      = min(|flowMW| / lineCapacity * 100, 120)
lineLosses    = |flowMW| * R * 0.01
```

**Simplification:** Power is split equally across all 3 connected lines per bus rather than using full AC power flow (Newton-Raphson). This is acknowledged as a simulation simplification.

**Tripped/Isolated lines:** All flow values = 0.

---

## 7. System State Computation

Aggregated from all bus telemetry each tick:

```
totalGeneration = SUM(P_i) for all P_i > 0
totalLoad       = SUM(|P_i|) for all P_i < 0
totalLosses     = |totalGeneration - totalLoad|
systemFrequency = AVG(f_i) across all buses
balance         = (totalGeneration - totalLoad) / totalGeneration
```

**System Status Logic:**
```
|f_system - 50| > 0.5 Hz  -->  EMERGENCY
|f_system - 50| > 0.1 Hz  -->  ALERT
otherwise                  -->  NOMINAL
```

---

## 8. Detection Layer 1: Rule Engine

Nine deterministic threshold rules based on **Indian Electricity Grid Code (IEGC) / CERC standards**:

### Rule 1: Voltage Bounds
```
V < 207 kV (-10%)  -->  CRITICAL  (RULE_VOLT_CRIT_LOW)
V > 253 kV (+10%)  -->  CRITICAL  (RULE_VOLT_CRIT_HIGH)
V < 218.5 or V > 241.5 kV (+-5%)  -->  MEDIUM  (RULE_VOLT_WARN)
```

### Rule 2: Frequency Critical
```
f < 49.5 Hz  -->  CRITICAL  (RULE_FREQ_CRIT_LOW)
f > 50.5 Hz  -->  CRITICAL  (RULE_FREQ_CRIT_HIGH)
```

### Rule 3: Voltage Rate-of-Change
```
|V_current - V_previous| > 10 kV/s  -->  HIGH  (RULE_VOLT_ROC)
```

### Rule 4: Rate of Change of Frequency (RoCoF)
```
|f_current - f_previous| > 1.0 Hz/s  -->  CRITICAL  (RULE_ROCOF_CRIT)
|f_current - f_previous| > 0.5 Hz/s  -->  MEDIUM   (RULE_ROCOF_WARN)
```

### Rule 5: Zero Meter Reading
```
|P| > 1.0 MW AND meterConsumption == 0  -->  HIGH  (RULE_ZERO_METER)
```

### Rule 6: Unexpected Breaker Trip
```
breakerStatus == 'TRIP'  -->  CRITICAL  (RULE_BREAKER_TRIP)
```

### Rule 7: Line Overload
```
loading% > 95%  -->  CRITICAL  (RULE_LINE_OVERLOAD_CRIT)
loading% > 80%  -->  MEDIUM   (RULE_LINE_OVERLOAD_WARN)
```

### Rule 8: Low Power Factor
```
PF < 0.80  -->  HIGH  (RULE_PF_CRIT)
PF < 0.85  -->  LOW   (RULE_PF_WARN)
```

### Rule 9: Transformer Overheat
```
T > 80 C  -->  CRITICAL  (RULE_TEMP_CRIT)
T > 65 C  -->  MEDIUM   (RULE_TEMP_WARN)
```

---

## 9. Detection Layer 2: Physics Engine

Four physics-based consistency checks that detect violations of fundamental electrical laws:

### Check 1: System Power Balance

```
totalGen = SUM(P_i) for P_i > 0
totalLoad = SUM(|P_i|) for P_i < 0
totalLosses = SUM(lineLosses) / 2     (each line counted from both ends)
totalDemand = totalLoad + totalLosses
imbalance% = |totalGen - totalDemand| / max(totalGen, totalDemand)

imbalance% > 5%  -->  PHYS_PWR_BALANCE violation
```

**Physics basis:** Conservation of energy. In any closed electrical system, generation must equal consumption plus losses at all times.

### Check 2: Voltage Coupling

```
For each pair of adjacent buses connected by a line:
  diffPercent = |V_bus1 - V_bus2| / V_nominal

  diffPercent > 15%  -->  PHYS_VOLT_COUPLING violation
```

**Physics basis:** Kirchhoff's voltage law. Adjacent buses on the same grid cannot have wildly different voltages due to transformer tap regulation and impedance constraints.

### Check 3: Power Equation Consistency

```
For each bus:
  calculatedP = V * I * PF / 1000     (apparent power relationship)
  actualP = |reported P|
  diffPercent = |calculatedP - actualP| / max(calculatedP, actualP)

  diffPercent > 15% AND max > 0.1 MW  -->  PHYS_EQUATION_CONSISTENCY violation
```

**Physics basis:** `P = V * I * cos(phi)`. If a sensor is tampered, the reported V, I, and P won't satisfy this fundamental relationship.

### Check 4: Frequency Consensus

```
maxFreq = max(f_i) across all buses
minFreq = min(f_i) across all buses

maxFreq - minFreq > 0.1 Hz  -->  PHYS_FREQ_CONSENSUS violation
```

**Physics basis:** In a synchronous AC grid, all buses operate at the same electrical frequency. A divergence > 0.1 Hz indicates either a sensor attack or an islanding event.

---

## 10. Detection Layer 3: Statistical Engine

Stateful per-bus anomaly detection using rolling windows.

### Z-Score Anomaly Detection

For each parameter (voltage, frequency, activePower) on each bus:

```
window = last 60 samples (WINDOW_SIZE = 60)
mu     = mean(window)
sigma  = stddev(window)

z = |x_current - mu| / sigma

z > 3.0  -->  anomaly detected
```

**Minimum samples required:** 10 (insufficient data returns no anomalies).

### CUSUM (Cumulative Sum) Detection

Upper one-sided CUSUM for detecting persistent shifts:

```
k = 0.5 * sigma          (slack parameter)
S_i = max(0, S_{i-1} + (x_i - mu - k))
threshold = 4.0 * sigma

S_i > threshold  -->  shift detected
```

**Parameters monitored:** voltage, frequency, activePower per bus.

CUSUM is particularly effective against **slow-drift attacks** (Sensor Tampering) that stay below Z-score thresholds but accumulate over time.

### Pearson Cross-Correlation

Detects decoupling between adjacent buses:

```
r(X, Y) = SUM((x_i - mean_x)(y_i - mean_y)) / (sqrt(SUM((x_i - mean_x)^2)) * sqrt(SUM((y_i - mean_y)^2)))
```

Computed on voltage time series between all 6 line-connected bus pairs:
- BUS-001 <-> BUS-003
- BUS-001 <-> BUS-002
- BUS-002 <-> BUS-004
- BUS-003 <-> BUS-005
- BUS-004 <-> BUS-005
- BUS-002 <-> BUS-003

```
r < 0.7  -->  suspicious decoupling (possible targeted attack on one bus)
```

### Load Forecast Deviation

```
deviation = |actualLoad - expectedLoad| / expectedLoad

deviation > 0.25  -->  25% forecast deviation flagged
```

---

## 11. Detection Layer 4: ML Detector

### Model: Isolation Forest (ONNX)

**Architecture:**
- 200 decision trees (`n_estimators = 200`)
- Max 2048 samples per tree (`max_samples = 2048`)
- All 6 features per tree (`max_features = 6`)
- Contamination: 0.5% (expected noise in training data)
- StandardScaler embedded in ONNX pipeline

**Features (6-dimensional):**

| Index | Feature        | Unit    | Normal Range           |
|-------|----------------|---------|------------------------|
| 0     | voltage        | kV      | ~225-235               |
| 1     | frequency      | Hz      | ~49.97-50.03           |
| 2     | activePower    | MW      | -85 to +150 (bus-dep.) |
| 3     | reactivePower  | MVAR    | proportional to P      |
| 4     | phaseAngle     | degrees | -5 to +5               |
| 5     | powerFactor    | -       | 0.85-1.0               |

**Training Data:**
- 100,000 normal samples (20,000 per bus x 5 buses)
- 7-day simulated operation with daily load curves
- Physics-correlated features (P = V*I*cos(phi) relationship maintained)

**Scoring:**
```
score = model.score_samples(features)    // lower = more anomalous
threshold = -0.5302                       // 2nd percentile of normal scores
isAnomaly = (score < threshold)
```

**Confidence calculation:**
```
distFromThreshold = threshold - score
normalRange = normal_score_std * 3        // 3-sigma range

if anomaly:
  confidence = clamp(0.5 + (distFromThreshold / normalRange) * 0.5, 0.5, 1.0)
else:
  confidence = clamp(0.5 - (|distFromThreshold| / normalRange) * 0.5, 0.0, 0.5)
```

**Performance (from training):**
- Normal score mean: -0.4432
- Normal score std: 0.0324
- Attack detection rate: 95.8%
- False positive rate: 0.2%

**ONNX Runtime Configuration (optimized for AMD EPYC):**
```
executionProviders: ['cpu']
graphOptimizationLevel: 'all'
intraOpNumThreads: 4
interOpNumThreads: 1
```

---

## 12. Alert Classifier (Threat Fusion)

The AlertClassifier fuses signals from all 4 detection layers to classify threats into 6 categories:

### Category 1: FALSE_DATA_INJECTION (FDI)

**Required signals (minimum 2 corroborating):**
- Physics: CONSISTENCY or COUPLING violation
- Statistical: >1 parameter anomalous (Z-score)
- Rules: VOLT_ROC or ROCOF_CRIT

**Confidence:**
```
confidence = 0.7 + (hasPhysics ? 0.2 : 0) + (hasStats ? 0.1 : 0)
```
Range: [0.8, 1.0]. MITRE ICS: T0830 (Man-in-the-Middle).

### Category 2: COMMAND_SPOOFING

**Required signals:**
- Breaker TRIP detected (RULE_BREAKER_TRIP)
- No other electrical violations on that bus (ruling out legitimate fault)

**Confidence:** 0.85 (fixed). MITRE ICS: T0859 (Valid Accounts).

### Category 3: SENSOR_TAMPERING

**Required signals:**
- Zero meter reading with active power (RULE_ZERO_METER)

**Confidence:** 0.90 (fixed). MITRE ICS: T0839 (Modify Parameter).

### Category 4: LOAD_MANIPULATION (MaDIoT)

**Required signals:**
- System power imbalance (PHYS_PWR_BALANCE)
- Load forecast deviation > 25%

**Confidence:** 0.75 (fixed). MITRE ICS: T0831 (Data of Physical Processes).

### Category 5: SMART_METER_COMPROMISE

**Required signals:**
- Zero meter reading (RULE_ZERO_METER)
- Bus has > 100 smart meters (distinguishes from generator buses)

**Confidence:** 0.80 (fixed). MITRE ICS: T0816 (Device/File/Data Deletion).

### Category 6: ANOMALOUS_BEHAVIOR (ML-generated)

**Required signals:**
- ML Isolation Forest detects anomaly (score < threshold)

**Severity mapping:**
```
confidence > 0.8  -->  CRITICAL
confidence > 0.6  -->  HIGH
otherwise         -->  MEDIUM
```

### Category 7: UNKNOWN_ANOMALY (fallback)

CRITICAL rule violations not matching any specific attack pattern. Confidence: 0.60.

---

## 13. Attack Injection Models

Five cyber-attack simulations based on documented ICS attack patterns:

### Attack 1: False Data Injection (FDI)

**Reference:** MSU/ORNL ICS dataset, NREL SAGA report

```
V_attacked = V_true + bias + N(0, 2)
  where bias = 15 + intensity * 20     // +15 to +35 kV offset

delta_attacked = delta_true + angleBias
  where angleBias = 5 + intensity * 15  // +5 to +20 degrees

dataQuality = 'GOOD'                    // attacker masks the injection
```

**Detection path:** Physics Engine (V*I*PF inconsistency) + Statistical (Z-score spike).

### Attack 2: Command Spoofing

**Reference:** Ukraine 2015 BlackEnergy attack

```
// Target bus:
V_target *= (1 - intensity * 0.55)      // voltage drops
P_target *= dropFactor * 0.6            // power drops
breakerStatus = 'TRIP'
lineFlows to/from target = 0            // all flows zeroed

// Adjacent buses:
V_adjacent *= 0.92                      // voltage sag
lineFlows.loading *= 1.6                // overload compensating
lineFlows.power *= 1.5
```

**Detection path:** Rule Engine (BREAKER_TRIP without prior fault) -> AlertClassifier.

### Attack 3: MaDIoT (Manipulation of Demand via IoT)

**Reference:** Princeton University 2018 research

```
loadMultiplier = 1.3 + intensity * 0.4    // 1.3x to 1.7x normal

// Load buses:
P_load *= loadMultiplier
I *= loadMultiplier
V -= (loadMultiplier - 1) * 8 kV          // voltage sag

// Frequency drop (swing equation):
df = -(loadMultiplier - 1) * P / (2 * H * S_base * f_nominal) * 50
  where H = 4.0 s (inertia constant)
        S_base = 230 MVA
        f_nominal = 50 Hz
```

**Detection path:** Physics (power imbalance) + Rules (frequency/voltage) + Statistical.

### Attack 4: Sensor Tampering (Slow Drift)

**Reference:** General ICS sensor manipulation literature. Stealthiest attack type.

```
driftRate = 0.04 + intensity * 0.12        // 0.04-0.16 kV per tick
drift = driftRate * elapsedTicks           // accumulates over time

V_tampered = V_true + drift
I_compensated = I_true * (V_true / V_tampered) * 0.98   // imperfect compensation
```

The 0.98 factor means the attacker *attempts* to maintain P=V*I*cos(phi) consistency but introduces a growing 2% error per tick. Over time, this triggers the Physics Engine's consistency check and CUSUM's cumulative shift detection.

**Detection path:** CUSUM (cumulative drift) + Physics (growing P/V/I inconsistency).

### Attack 5: Smart Meter Compromise

**Reference:** AMI infrastructure attack research

```
meterConsumption *= (1 - intensity)        // intensity=1.0 -> all meters report 0
// PMU readings unchanged -> creates detectable discrepancy
```

**Detection path:** Rule Engine (ZERO_METER + active power) -> AlertClassifier (bus meter count > 100).

---

## 14. VajraShield Self-Healing (FLISR)

**FLISR = Fault Location, Isolation, Service Restoration**

### Phase Timing

| Phase      | Duration (ticks/seconds) | Action                              |
|------------|--------------------------|-------------------------------------|
| DETECTING  | 1                        | Threat confirmed, scope assessed    |
| ISOLATING  | 2                        | Trip breakers on all lines to bus   |
| REROUTING  | 2                        | Redistribute load via alternate paths |
| MONITORING | 8                        | Verify containment, watch persistence |
| RESTORING  | 3                        | Re-close breakers, normalize flow   |
| RESTORED   | 0                        | Complete, move to history           |

**Total healing cycle: 16 seconds**

### Trigger Condition

Only CRITICAL or HIGH severity alerts trigger VajraShield. Duplicate healing for the same bus is prevented.

### Isolation Logic

```
For each line L connected to affected bus B:
  trippedBreakers.add(L.id)
  isolatedLines.push(L.id)
isolatedBuses.add(B.id)
```

DataGenerator respects this state: isolated buses get V -> ~0 kV, P -> 0, all line flows -> 0.

### Alternate Path Finding

```
1. Get adjacentBuses of isolated bus
2. Find all lines NOT touching isolated bus that connect to adjacent buses
3. Find all lines between pairs of adjacent buses
4. These form the alternate topology for rerouting
```

### Load Redistribution

Capacity-proportional distribution across neighboring buses:

```
For each neighbor N of isolated bus B:
  line = line connecting B and N
  share = line.capacity / totalCapacity_of_all_neighbor_lines
  redistributedLoad_N = B.ratedLoad * share
```

**Example:** If BUS-003 (85 MW) is isolated:
- TL-01 (BUS-001, 200 MW capacity) gets 200/(200+150) * 85 = 48.6 MW
- TL-06 (BUS-002, 150 MW capacity) gets 150/(200+150) * 85 = 36.4 MW

### Restoration

After MONITORING phase confirms containment:
```
For each isolatedLine:
  trippedBreakers.delete(lineId)
For each reroutedPath:
  reroutedLines.delete(lineId)
isolatedBuses.delete(busId)
```

---

## 15. Physical Constants Reference

### System Constants

| Constant                    | Symbol | Value     | Unit    | Source                   |
|-----------------------------|--------|-----------|---------|--------------------------|
| Inertia Constant            | H      | 4.0       | seconds | Typical thermal plant    |
| Base Power                  | S_base | 230       | MVA     | System-level             |
| Nominal Frequency           | f_0    | 50.0      | Hz      | Indian Grid (IEGC)       |
| Nominal Voltage             | V_nom  | 230       | kV      | EHV transmission         |
| Voltage Regulation Coeff.   | k      | 0.05      | -       | Droop characteristic     |
| Transmission Losses         | -      | 3%        | -       | Simplified model         |
| Telemetry Interval          | -      | 1000      | ms      | 1 Hz data rate           |
| Max Alert History           | -      | 500       | alerts  | Buffer limit             |

### Detection Thresholds Summary

| Parameter         | Warning     | Critical    | Standard           |
|-------------------|-------------|-------------|--------------------|
| Voltage           | +/-5% (230) | +/-10% (230)| IEGC/CERC          |
| Frequency         | -           | +/-0.5 Hz   | IEGC (49.5-50.5)   |
| RoCoF             | 0.5 Hz/s    | 1.0 Hz/s    | ENTSO-E/CERC       |
| Line Loading      | 80%         | 95%         | Thermal limit       |
| Power Factor      | 0.85        | 0.80        | CERC minimum        |
| Transformer Temp  | 65 C        | 80 C        | IEC 60076           |
| Power Balance     | -           | 5%          | N-1 criterion       |
| Voltage Coupling  | -           | 15%         | Transformer limits  |
| Power Consistency | -           | 15%         | P=VIcos(phi)        |
| Frequency Spread  | -           | 0.1 Hz      | Synchronous grid    |
| Z-Score           | -           | 3.0 sigma   | Standard practice   |
| CUSUM Slack       | 0.5 sigma   | 4.0 sigma   | Page's test         |
| Correlation       | 0.7         | -           | Pearson r minimum   |
| ML Anomaly Score  | -           | -0.5302     | 2nd percentile      |
| Meter Discrepancy | -           | 10%         | AMI accuracy req.   |

---

*Document auto-generated from VajraGrid source code analysis. All equations verified against `vajragrid-app/src/lib/` implementation.*
