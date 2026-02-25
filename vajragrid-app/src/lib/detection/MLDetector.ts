/**
 * ML Anomaly Detector — ONNX Runtime Web inference
 * Loads Isolation Forest model trained on normal grid telemetry.
 * Runs in the detection pipeline as Layer 4 (ML-based).
 */
import type { GridTelemetry } from '@/lib/types';

// Model paths (used by loadModel at runtime via path.join)
const MODEL_PATH = 'public/models/anomaly_detector.onnx';
const METADATA_PATH = 'public/models/model_metadata.json';

interface ModelMetadata {
  features: string[];
  n_features: number;
  input_name: string;
  output_names: string[];
  normal_score_mean: number;
  normal_score_std: number;
  threshold: number;
  training_samples: number;
  attack_detection_rate: number;
}

export interface MLAnomaly {
  busId: string;
  score: number;
  isAnomaly: boolean;
  confidence: number;
  features: number[];
}

// State stored in globalThis for Next.js module survival
const g = globalThis as unknown as {
  __vajraMLSession?: unknown;
  __vajraMLMetadata?: ModelMetadata;
  __vajraMLLoading?: boolean;
  __vajraMLFailed?: boolean;
};

/**
 * Extract the 6 features from telemetry for the model.
 * Order must match training: [voltage, frequency, activePower, reactivePower, voltageAngle, powerFactor]
 */
function extractFeatures(t: GridTelemetry): number[] {
  return [
    t.voltage,
    t.frequency,
    t.activePower,
    t.reactivePower,
    t.phaseAngle,
    t.powerFactor,
  ];
}

/**
 * Initialize the ONNX Runtime session (server-side only).
 * Uses dynamic import since onnxruntime-node is server-only.
 */
async function initModel(): Promise<boolean> {
  if (g.__vajraMLSession) return true;
  if (g.__vajraMLLoading) return false;
  if (g.__vajraMLFailed) return false;

  g.__vajraMLLoading = true;

  try {
    // Load metadata
    const fs = await import('fs');
    const path = await import('path');
    
    const modelPath = path.join(process.cwd(), MODEL_PATH);
    const metaPath = path.join(process.cwd(), METADATA_PATH);

    if (!fs.existsSync(modelPath)) {
      console.warn('[ML] Model file not found at', modelPath);
      g.__vajraMLFailed = true;
      g.__vajraMLLoading = false;
      return false;
    }

    const metaRaw = fs.readFileSync(metaPath, 'utf-8');
    g.__vajraMLMetadata = JSON.parse(metaRaw);

    // Load ONNX Runtime (server-side Node.js)
    const ort = await import('onnxruntime-node');
    
    // Create optimized session for AMD EPYC (AVX2 vectorization, 4 intra-op threads)
    g.__vajraMLSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
    });

    console.log('[ML] ONNX model loaded successfully');
    g.__vajraMLLoading = false;
    return true;
  } catch (err) {
    console.warn('[ML] Failed to load ONNX model:', err);
    g.__vajraMLFailed = true;
    g.__vajraMLLoading = false;
    return false;
  }
}

/**
 * Run ML anomaly detection on all bus telemetry.
 * Returns anomaly scores for each bus.
 */
export async function runMLDetection(telemetry: GridTelemetry[]): Promise<MLAnomaly[]> {
  const ready = await initModel();
  if (!ready || !g.__vajraMLSession || !g.__vajraMLMetadata) {
    return []; // ML layer unavailable, gracefully degrade
  }

  try {
    const session = g.__vajraMLSession as {
      run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
    };
    const metadata = g.__vajraMLMetadata;
    const ort = await import('onnxruntime-node');

    // Build batch input: [n_buses, 6]
    const features = telemetry.map(extractFeatures);
    const flatData = new Float32Array(features.flat());
    const inputTensor = new ort.Tensor('float32', flatData, [telemetry.length, metadata.n_features]);

    // Run inference
    const results = await session.run({ [metadata.input_name]: inputTensor });

    // Extract scores (score_samples output from Isolation Forest)
    const scoreOutput = results['score_samples'];
    const scores = scoreOutput?.data ?? new Float32Array(telemetry.length);

    return telemetry.map((t, i) => {
      const score = Number(scores[i]);
      const isAnomaly = score < metadata.threshold;
      // Confidence: how far below threshold (normalized)
      const distFromThreshold = metadata.threshold - score;
      const normalRange = metadata.normal_score_std * 3;
      const confidence = isAnomaly
        ? Math.min(1, Math.max(0.5, 0.5 + (distFromThreshold / normalRange) * 0.5))
        : Math.max(0, Math.min(0.5, 0.5 - (Math.abs(distFromThreshold) / normalRange) * 0.5));

      return {
        busId: t.busId,
        score,
        isAnomaly,
        confidence,
        features: features[i],
      };
    });
  } catch (err) {
    console.warn('[ML] Inference error:', err);
    return [];
  }
}

/**
 * Check if the ML model is loaded and ready.
 */
export function isMLReady(): boolean {
  return !!g.__vajraMLSession;
}
