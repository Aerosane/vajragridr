"""
VajraGrid ML Pipeline — Train Isolation Forest → Export ONNX

Generates physics-correlated normal grid telemetry with realistic daily load
curves, trains an Isolation Forest with tighter decision boundaries, and
exports to ONNX format for server-side inference via onnxruntime-node.

Features per bus (6 features):
  0: voltage (kV)
  1: frequency (Hz)
  2: activePower (MW)
  3: reactivePower (MVAR)
  4: voltageAngle (degrees)
  5: powerFactor

Output: anomaly score (float, lower = more anomalous)

Training methodology:
  - Normal data uses physics-correlated features (P ≈ V·I·cosφ relationship)
  - 24h daily load curves (Indian grid NLDC profile) with seasonal variation
  - Tight noise bands matching real PMU/SCADA measurement precision
  - Attack data based on documented attack patterns (Ukraine 2015, Stuxnet,
    MSU/ORNL ICS dataset attack profiles, NREL SAGA report signatures)
"""

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnxruntime as ort
import os
import json

np.random.seed(42)

# Grid bus configs (matching gridConfig.ts)
BUSES = {
    'BUS-001': {'type': 'SLACK', 'nominalV': 230, 'basePower': 60},
    'BUS-002': {'type': 'PV_GEN', 'nominalV': 230, 'basePower': 35},
    'BUS-003': {'type': 'PQ_LOAD', 'nominalV': 230, 'basePower': -25},
    'BUS-004': {'type': 'PQ_LOAD', 'nominalV': 230, 'basePower': -18},
    'BUS-005': {'type': 'PQ_LOAD', 'nominalV': 230, 'basePower': -15},
}

N_SAMPLES = 20000  # Normal operating samples per bus
N_FEATURES = 6
N_ATTACK_SAMPLES = 2000  # More attack samples for robust validation


def indian_grid_load_curve(hours: np.ndarray) -> np.ndarray:
    """Realistic Indian grid daily load profile (NLDC pattern).
    Peak: 10-14h and 18-22h. Trough: 02-06h."""
    base = 0.6
    morning_peak = 0.25 * np.exp(-0.5 * ((hours - 11) / 2.5) ** 2)
    evening_peak = 0.35 * np.exp(-0.5 * ((hours - 20) / 2.0) ** 2)
    night_dip = -0.15 * np.exp(-0.5 * ((hours - 3) / 2.0) ** 2)
    return base + morning_peak + evening_peak + night_dip


def generate_normal_data(n_samples: int) -> np.ndarray:
    """Generate physics-correlated normal grid telemetry with daily curves."""
    data = np.zeros((n_samples * len(BUSES), N_FEATURES))

    for i, (bus_id, cfg) in enumerate(BUSES.items()):
        start = i * n_samples
        end = (i + 1) * n_samples
        n = n_samples

        # Simulate multiple days of 24h operation
        hours = np.linspace(0, 24 * 7, n) % 24  # 7 days of data
        load_factor = indian_grid_load_curve(hours)

        # Add small seasonal + weather noise
        seasonal = 1.0 + 0.05 * np.sin(np.linspace(0, 2 * np.pi, n))
        weather_noise = np.random.normal(1.0, 0.02, n)
        combined_factor = load_factor * seasonal * weather_noise

        base = cfg['basePower']

        # Active power: bus-type-aware with realistic load curve
        active_power = base * combined_factor + np.random.normal(0, abs(base) * 0.03, n)
        data[start:end, 2] = active_power

        # Reactive power: physically correlated (Q = P × tan(φ), φ ≈ 18° → tan ≈ 0.33)
        pf_base = 0.95 if cfg['type'] != 'PQ_LOAD' else 0.92
        tan_phi = np.sqrt(1 - pf_base**2) / pf_base
        data[start:end, 3] = active_power * tan_phi + np.random.normal(0, 0.5, n)

        # Power factor: derived from P and Q (physically consistent)
        s_apparent = np.sqrt(active_power**2 + data[start:end, 3]**2)
        s_apparent = np.where(s_apparent < 0.01, 0.01, s_apparent)
        data[start:end, 5] = np.clip(np.abs(active_power) / s_apparent, 0.85, 1.0)

        # Voltage: load-dependent droop (heavier load → slightly lower voltage)
        load_droop = -0.008 * (combined_factor - 0.6) * cfg['nominalV']
        data[start:end, 0] = cfg['nominalV'] + load_droop + np.random.normal(0, 1.5, n)

        # Frequency: system-wide with tight coupling (PMU precision ±0.005Hz)
        freq_droop = -0.02 * (combined_factor - 0.75)  # Frequency drops under heavy load
        data[start:end, 1] = 50.0 + freq_droop + np.random.normal(0, 0.015, n)

        # Voltage angle: load-dependent (heavier load → larger angle)
        data[start:end, 4] = -2.0 * (combined_factor - 0.6) + np.random.normal(0, 1.0, n)

    return data


def generate_attack_samples(n_samples: int = N_ATTACK_SAMPLES) -> np.ndarray:
    """Generate attack samples based on documented ICS attack patterns.

    Attack profiles derived from:
    - Ukraine 2015 BlackEnergy (command injection, breaker manipulation)
    - Stuxnet-style (subtle frequency manipulation)
    - MSU/ORNL dataset (FDI on voltage/power measurements)
    - NREL SAGA report (DER manipulation, sensor spoofing)
    """
    chunk = n_samples // 8
    attacks_list = []

    # 1. FDI — Voltage bias injection (MSU/ORNL pattern: +15-40kV offset)
    n = chunk
    v_bias = np.random.uniform(15, 40, n)
    attacks_list.append(np.column_stack([
        230 + v_bias + np.random.normal(0, 2, n),       # voltage: biased high
        50.0 + np.random.normal(0, 0.015, n),            # frequency: normal (stealthy)
        np.random.normal(-25, 2, n),                      # power: normal
        np.random.normal(-8, 1, n),                       # reactive: normal
        np.random.normal(0, 1, n),                        # angle: normal
        np.random.normal(0.94, 0.02, n),                  # PF: normal
    ]))

    # 2. FDI — Voltage suppression (attacker lowers readings to mask overload)
    n = chunk
    attacks_list.append(np.column_stack([
        230 - np.random.uniform(20, 50, n),               # voltage: biased low
        50.0 + np.random.normal(0, 0.015, n),
        np.random.normal(-25, 2, n),
        np.random.normal(-8, 1, n),
        np.random.normal(0, 1, n),
        np.random.normal(0.94, 0.02, n),
    ]))

    # 3. Frequency manipulation (Stuxnet-style: subtle but persistent)
    n = chunk
    freq_offset = np.random.choice([-1, 1], n) * np.random.uniform(0.3, 1.5, n)
    attacks_list.append(np.column_stack([
        np.random.normal(230, 1.5, n),
        50.0 + freq_offset,                               # frequency: clearly off
        np.random.normal(-25, 2, n),
        np.random.normal(-8, 1, n),
        np.random.normal(0, 1, n),
        np.random.normal(0.94, 0.02, n),
    ]))

    # 4. MaDIoT power surge (coordinated load increase)
    n = chunk
    surge = np.random.uniform(1.8, 3.0, n)
    base_p = -25.0
    attacks_list.append(np.column_stack([
        np.random.normal(220, 4, n),                      # voltage sags under load
        np.random.normal(49.7, 0.08, n),                  # frequency dips
        base_p * surge + np.random.normal(0, 2, n),       # power: 1.8-3× normal
        base_p * surge * 0.4 + np.random.normal(0, 1, n), # reactive follows
        np.random.normal(-5, 3, n),                       # angle shifts
        np.clip(np.random.normal(0.80, 0.05, n), 0.6, 0.95), # PF degrades
    ]))

    # 5. Command spoofing — breaker trip (Ukraine 2015: power drops to near-zero)
    n = chunk
    attacks_list.append(np.column_stack([
        np.random.uniform(5, 50, n),                      # voltage collapses
        np.random.normal(50.0, 0.05, n),                  # frequency: grid still running
        np.random.uniform(-2, 2, n),                      # power: near zero
        np.random.uniform(-1, 1, n),                      # reactive: near zero
        np.random.normal(0, 8, n),                        # angle: erratic
        np.random.uniform(0.1, 0.5, n),                   # PF: garbage
    ]))

    # 6. Sensor tampering — frozen/stuck values with slight miscalibration
    #    Real frozen sensors lock at slightly off-nominal values and break
    #    the natural inter-feature correlations (P ≠ V·I·cosφ)
    n = chunk
    frozen_v = np.random.choice([225, 226, 234, 235, 238], n)  # Off-nominal freeze points
    frozen_p = np.random.uniform(-30, -10, n)
    frozen_q = np.random.uniform(-15, -2, n)
    # Key: PF should be |P|/sqrt(P²+Q²) but frozen sensors report inconsistent PF
    attacks_list.append(np.column_stack([
        frozen_v.astype(float) + np.random.normal(0, 0.01, n),
        np.random.choice([49.95, 50.0, 50.05], n).astype(float) + np.random.normal(0, 0.001, n),
        frozen_p + np.random.normal(0, 0.01, n),
        frozen_q + np.random.normal(0, 0.01, n),
        np.random.choice([-3, -1, 2, 4], n).astype(float) + np.random.normal(0, 0.01, n),
        np.random.uniform(0.70, 0.82, n),  # PF doesn't match P/Q (physics violation)
    ]))

    # 7. Coordinated multi-vector (FDI + frequency + power — sophisticated APT)
    n = chunk
    attacks_list.append(np.column_stack([
        np.random.normal(250, 8, n),                      # voltage: biased
        49.0 + np.random.normal(0, 0.2, n),               # frequency: shifted
        np.random.normal(-50, 8, n),                      # power: anomalous
        np.random.normal(-18, 4, n),                      # reactive: anomalous
        np.random.normal(12, 6, n),                       # angle: large deviation
        np.clip(np.random.normal(0.75, 0.08, n), 0.4, 0.95), # PF: degraded
    ]))

    # 8. Replay attack — stale data from wrong time (load/voltage mismatch)
    #    Replayed data has correct-looking individual values but the cross-feature
    #    correlations are wrong (e.g., high load but high voltage = impossible)
    n = n_samples - 7 * chunk
    attacks_list.append(np.column_stack([
        np.random.normal(233, 1.5, n),                    # voltage: slightly high (night-time level)
        50.0 + np.random.normal(0, 0.015, n),
        np.random.uniform(-40, -30, n),                    # power: peak-load level
        np.random.uniform(-14, -10, n),                    # reactive: heavy
        np.random.normal(-4, 2, n),                        # angle: heavy-load angle
        np.clip(np.random.normal(0.88, 0.03, n), 0.75, 0.95),  # PF: degraded from heavy load
    ]))

    return np.vstack(attacks_list)

def main():
    print("=" * 60)
    print("VajraGrid ML Pipeline v2 — Enhanced Isolation Forest Training")
    print("=" * 60)

    # Generate training data (normal only — unsupervised)
    print(f"\n[1/6] Generating {N_SAMPLES} normal samples per bus ({len(BUSES)} buses)...")
    normal_data = generate_normal_data(N_SAMPLES)
    print(f"  Training data shape: {normal_data.shape}")
    print(f"  Voltage range: [{normal_data[:, 0].min():.1f}, {normal_data[:, 0].max():.1f}] kV")
    print(f"  Frequency range: [{normal_data[:, 1].min():.4f}, {normal_data[:, 1].max():.4f}] Hz")

    # Normalize features for better isolation boundaries
    print("\n[2/6] Normalizing features (StandardScaler)...")
    scaler = StandardScaler()
    normal_scaled = scaler.fit_transform(normal_data)
    print(f"  Scaler means: {np.round(scaler.mean_, 2)}")
    print(f"  Scaler stds:  {np.round(scaler.scale_, 2)}")

    # Train Isolation Forest with tuned hyperparameters
    print("\n[3/6] Training Isolation Forest (200 trees, 2048 samples)...")
    model = IsolationForest(
        n_estimators=200,
        max_samples=2048,
        contamination=0.005,  # Tighter: expect 0.5% noise in normal data
        max_features=N_FEATURES,  # Use all features per tree
        random_state=42,
        n_jobs=-1,
    )
    model.fit(normal_scaled)
    print("  Model trained successfully")

    # Validate on attack data
    print(f"\n[4/6] Validating on {N_ATTACK_SAMPLES} attack samples...")
    attack_data = generate_attack_samples(N_ATTACK_SAMPLES)
    attack_scaled = scaler.transform(attack_data)

    normal_test = normal_scaled[:1000]
    normal_scores = model.score_samples(normal_test)
    attack_scores = model.score_samples(attack_scaled)

    normal_mean = np.mean(normal_scores)
    attack_mean = np.mean(attack_scores)
    normal_detected = np.sum(model.predict(normal_test) == -1)
    attack_detected = np.sum(model.predict(attack_scaled) == -1)

    print(f"  Normal data - mean score: {normal_mean:.4f}, false positives: {normal_detected}/1000 ({normal_detected/10:.1f}%)")
    print(f"  Attack data - mean score: {attack_mean:.4f}, detected: {attack_detected}/{N_ATTACK_SAMPLES} ({attack_detected/N_ATTACK_SAMPLES*100:.1f}%)")

    # Per-attack-type breakdown
    chunk = N_ATTACK_SAMPLES // 8
    attack_names = ['FDI (V+bias)', 'FDI (V-bias)', 'Freq manip', 'MaDIoT surge',
                    'Cmd spoof', 'Sensor freeze', 'Multi-vector', 'Replay']
    print("\n  Per-attack detection rates:")
    for j, name in enumerate(attack_names):
        s = j * chunk
        e = s + chunk if j < 7 else N_ATTACK_SAMPLES
        pred = model.predict(attack_scaled[s:e])
        det = np.sum(pred == -1)
        total = e - s
        print(f"    {name:16s}: {det}/{total} ({det/total*100:.1f}%)")

    # Build sklearn Pipeline (scaler + model) for single ONNX export
    from sklearn.pipeline import Pipeline
    pipe = Pipeline([('scaler', scaler), ('iforest', model)])

    # Export to ONNX
    print("\n[5/6] Exporting to ONNX format...")
    initial_type = [('float_input', FloatTensorType([None, N_FEATURES]))]
    onnx_model = convert_sklearn(
        pipe,
        initial_types=initial_type,
        target_opset={'': 13, 'ai.onnx.ml': 3},
        options={id(model): {'score_samples': True}}
    )

    output_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
    os.makedirs(output_dir, exist_ok=True)
    onnx_path = os.path.join(output_dir, 'anomaly_detector.onnx')

    with open(onnx_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    file_size = os.path.getsize(onnx_path) / 1024
    print(f"  Model saved to: {onnx_path} ({file_size:.1f} KB)")

    # Verify ONNX model (feed raw unscaled data — pipeline includes scaler)
    print("\n[6/6] Verifying ONNX model...")
    session = ort.InferenceSession(onnx_path)
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]

    # Test with raw normal data (scaler is baked into the ONNX pipeline)
    test_normal = normal_data[:10].astype(np.float32)
    test_attack = attack_data[:10].astype(np.float32)

    normal_results = session.run(output_names, {input_name: test_normal})
    attack_results = session.run(output_names, {input_name: test_attack})

    print(f"  Input: {input_name} → shape {test_normal.shape}")
    print(f"  Outputs: {output_names}")
    print(f"  Normal scores (first 5): {normal_results[-1][:5].flatten()}")
    print(f"  Attack scores (first 5): {attack_results[-1][:5].flatten()}")

    # Save model metadata
    threshold = float(np.percentile(normal_scores, 2))  # 2nd percentile = tighter boundary
    metadata = {
        'features': ['voltage', 'frequency', 'activePower', 'reactivePower', 'voltageAngle', 'powerFactor'],
        'n_features': N_FEATURES,
        'input_name': input_name,
        'output_names': output_names,
        'normal_score_mean': float(normal_mean),
        'normal_score_std': float(np.std(normal_scores)),
        'threshold': threshold,
        'training_samples': len(normal_data),
        'attack_detection_rate': float(attack_detected / N_ATTACK_SAMPLES),
        'false_positive_rate': float(normal_detected / 1000),
        'model_version': '2.0',
        'scaler_embedded': True,
        'attack_types_validated': attack_names,
    }
    meta_path = os.path.join(output_dir, 'model_metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\n  Metadata saved to: {meta_path}")

    print("\n" + "=" * 60)
    print("✅ ML Pipeline v2 Complete!")
    print(f"   Model: {onnx_path} ({file_size:.1f} KB)")
    print(f"   Detection rate: {attack_detected/N_ATTACK_SAMPLES*100:.1f}%")
    print(f"   False positive rate: {normal_detected/10:.1f}%")
    print(f"   Threshold: {threshold:.4f}")
    print("=" * 60)

if __name__ == '__main__':
    main()
