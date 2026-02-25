// Gaussian noise generator for realistic sensor readings

/**
 * Box-Muller transform for Gaussian random numbers.
 */
export function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * stdDev + mean;
}

/**
 * Add Gaussian noise to a value.
 */
export function addNoise(
  value: number,
  stdDev: number,
  clampMin?: number,
  clampMax?: number
): number {
  let noisy = value + gaussianRandom(0, stdDev);
  if (clampMin !== undefined) noisy = Math.max(clampMin, noisy);
  if (clampMax !== undefined) noisy = Math.min(clampMax, noisy);
  return noisy;
}

/**
 * Add percentage-based noise.
 */
export function addPercentNoise(
  value: number,
  stdDevPercent: number
): number {
  return value * (1 + gaussianRandom(0, stdDevPercent));
}

/**
 * Occasional random transients (spikes that last 1-3 ticks).
 * Returns 0 most of the time, small spike occasionally.
 */
export function transientNoise(probability: number = 0.005): number {
  if (Math.random() < probability) {
    return gaussianRandom(0, 3);
  }
  return 0;
}
