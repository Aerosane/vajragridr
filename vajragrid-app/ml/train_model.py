"""
VajraGrid ML Pipeline — Train Isolation Forest → Export ONNX
Generates synthetic normal grid telemetry, trains an Isolation Forest,
and exports to ONNX format for browser-side inference via onnxruntime-web.

Features per bus (6 features):
  0: voltage (kV)
  1: frequency (Hz)  
  2: activePower (MW)
  3: reactivePower (MVAR)
  4: voltageAngle (degrees)
  5: powerFactor

Output: anomaly score (float, lower = more anomalous)
"""

import numpy as np
from sklearn.ensemble import IsolationForest
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

N_SAMPLES = 10000  # Normal operating samples
N_FEATURES = 6

def generate_normal_data(n_samples: int) -> np.ndarray:
    """Generate synthetic normal power grid telemetry."""
    data = np.zeros((n_samples * len(BUSES), N_FEATURES))
    
    for i, (bus_id, cfg) in enumerate(BUSES.items()):
        start = i * n_samples
        end = (i + 1) * n_samples
        
        # Voltage: normal ~230kV ± 3kV noise
        data[start:end, 0] = np.random.normal(cfg['nominalV'], 3.0, n_samples)
        
        # Frequency: normal ~50Hz ± 0.03Hz
        data[start:end, 1] = np.random.normal(50.0, 0.03, n_samples)
        
        # Active power: based on bus type with load curve variation
        hour_factor = np.sin(np.linspace(0, 4 * np.pi, n_samples)) * 0.15 + 1.0
        base = cfg['basePower']
        data[start:end, 2] = base * hour_factor + np.random.normal(0, abs(base) * 0.05, n_samples)
        
        # Reactive power: ~30% of active
        data[start:end, 3] = data[start:end, 2] * 0.3 + np.random.normal(0, 1.0, n_samples)
        
        # Voltage angle: small deviations
        data[start:end, 4] = np.random.normal(0, 2.0, n_samples)
        
        # Power factor: high for normal operation
        data[start:end, 5] = np.clip(np.random.normal(0.95, 0.02, n_samples), 0.8, 1.0)
    
    return data

def generate_attack_samples(n_samples: int = 500) -> np.ndarray:
    """Generate attack samples for validation."""
    attacks = np.zeros((n_samples, N_FEATURES))
    
    # FDI: voltage spike
    fdi = n_samples // 5
    attacks[:fdi, 0] = np.random.normal(260, 5, fdi)  # Abnormal voltage
    attacks[:fdi, 1] = np.random.normal(50.0, 0.03, fdi)
    attacks[:fdi, 2] = np.random.normal(-25, 2, fdi)
    attacks[:fdi, 3] = np.random.normal(-7, 1, fdi)
    attacks[:fdi, 4] = np.random.normal(0, 2, fdi)
    attacks[:fdi, 5] = np.random.normal(0.95, 0.02, fdi)
    
    # Frequency manipulation
    freq = n_samples // 5
    attacks[fdi:fdi+freq, 0] = np.random.normal(230, 3, freq)
    attacks[fdi:fdi+freq, 1] = np.random.normal(49.5, 0.1, freq)  # Abnormal freq
    attacks[fdi:fdi+freq, 2] = np.random.normal(-25, 2, freq)
    attacks[fdi:fdi+freq, 3] = np.random.normal(-7, 1, freq)
    attacks[fdi:fdi+freq, 4] = np.random.normal(0, 2, freq)
    attacks[fdi:fdi+freq, 5] = np.random.normal(0.95, 0.02, freq)
    
    # Power surge (MaDIoT)
    power = n_samples // 5
    s = fdi + freq
    attacks[s:s+power, 0] = np.random.normal(225, 5, power)
    attacks[s:s+power, 1] = np.random.normal(49.8, 0.05, power)
    attacks[s:s+power, 2] = np.random.normal(-45, 3, power)  # Abnormal load
    attacks[s:s+power, 3] = np.random.normal(-15, 2, power)
    attacks[s:s+power, 4] = np.random.normal(0, 3, power)
    attacks[s:s+power, 5] = np.random.normal(0.85, 0.05, power)
    
    # Sensor drift
    drift = n_samples // 5
    s2 = s + power
    attacks[s2:s2+drift, 0] = np.random.normal(240, 8, drift)  # Drifting voltage
    attacks[s2:s2+drift, 1] = np.random.normal(50.1, 0.08, drift)
    attacks[s2:s2+drift, 2] = np.random.normal(-25, 2, drift)
    attacks[s2:s2+drift, 3] = np.random.normal(-7, 1, drift)
    attacks[s2:s2+drift, 4] = np.random.normal(5, 4, drift)  # Large angle
    attacks[s2:s2+drift, 5] = np.random.normal(0.88, 0.04, drift)
    
    # Mixed attack
    rest = n_samples - fdi - freq - power - drift
    s3 = s2 + drift
    attacks[s3:, 0] = np.random.normal(255, 10, rest)
    attacks[s3:, 1] = np.random.normal(49.7, 0.15, rest)
    attacks[s3:, 2] = np.random.normal(-40, 5, rest)
    attacks[s3:, 3] = np.random.normal(-12, 3, rest)
    attacks[s3:, 4] = np.random.normal(8, 5, rest)
    attacks[s3:, 5] = np.random.normal(0.82, 0.06, rest)
    
    return attacks

def main():
    print("=" * 50)
    print("VajraGrid ML Pipeline — Isolation Forest Training")
    print("=" * 50)
    
    # Generate training data (normal only)
    print(f"\n[1/5] Generating {N_SAMPLES} normal samples per bus ({len(BUSES)} buses)...")
    normal_data = generate_normal_data(N_SAMPLES)
    print(f"  Training data shape: {normal_data.shape}")
    
    # Train Isolation Forest
    print("\n[2/5] Training Isolation Forest...")
    model = IsolationForest(
        n_estimators=100,
        max_samples=min(1000, len(normal_data)),
        contamination=0.01,  # Expect 1% anomalies in normal data (noise)
        random_state=42,
        n_jobs=-1,
    )
    model.fit(normal_data)
    print("  Model trained successfully")
    
    # Validate on attack data
    print("\n[3/5] Validating on attack samples...")
    attack_data = generate_attack_samples(500)
    normal_scores = model.score_samples(normal_data[:500])
    attack_scores = model.score_samples(attack_data)
    
    normal_mean = np.mean(normal_scores)
    attack_mean = np.mean(attack_scores)
    normal_detected = np.sum(model.predict(normal_data[:500]) == -1)
    attack_detected = np.sum(model.predict(attack_data) == -1)
    
    print(f"  Normal data - mean score: {normal_mean:.4f}, false positives: {normal_detected}/500 ({normal_detected/5:.1f}%)")
    print(f"  Attack data - mean score: {attack_mean:.4f}, detected: {attack_detected}/500 ({attack_detected/5:.1f}%)")
    
    # Export to ONNX
    print("\n[4/5] Exporting to ONNX format...")
    initial_type = [('float_input', FloatTensorType([None, N_FEATURES]))]
    onnx_model = convert_sklearn(
        model, 
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
    
    # Verify ONNX model
    print("\n[5/5] Verifying ONNX model...")
    session = ort.InferenceSession(onnx_path)
    input_name = session.get_inputs()[0].name
    output_names = [o.name for o in session.get_outputs()]
    
    test_input = normal_data[:5].astype(np.float32)
    results = session.run(output_names, {input_name: test_input})
    
    print(f"  Input: {input_name} → shape {test_input.shape}")
    print(f"  Outputs: {output_names}")
    print(f"  Test scores: {results[-1][:5].flatten()}")
    
    # Save model metadata
    metadata = {
        'features': ['voltage', 'frequency', 'activePower', 'reactivePower', 'voltageAngle', 'powerFactor'],
        'n_features': N_FEATURES,
        'input_name': input_name,
        'output_names': output_names,
        'normal_score_mean': float(normal_mean),
        'normal_score_std': float(np.std(normal_scores)),
        'threshold': float(np.percentile(normal_scores, 5)),  # 5th percentile of normal = anomaly boundary
        'training_samples': len(normal_data),
        'attack_detection_rate': float(attack_detected / 500),
    }
    meta_path = os.path.join(output_dir, 'model_metadata.json')
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\n  Metadata saved to: {meta_path}")
    
    print("\n" + "=" * 50)
    print("✅ ML Pipeline Complete!")
    print(f"   Model: {onnx_path}")
    print(f"   Detection rate: {attack_detected/5:.1f}%")
    print(f"   False positive rate: {normal_detected/5:.1f}%")
    print("=" * 50)

if __name__ == '__main__':
    main()
