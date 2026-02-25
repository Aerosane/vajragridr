// 24-hour daily load curve — composite of residential, commercial, industrial patterns

/**
 * Returns load factor (0.0-1.0) for a given hour of day.
 * Realistic Indian grid pattern with evening peak.
 */
export function dailyLoadFactor(hour: number): number {
  const baseLoad = 0.3;
  // Morning ramp: industrial starts at 6AM, peaks around 9-10AM
  const morningRamp =
    0.25 * Math.max(0, Math.sin(((hour - 5) * Math.PI) / 8));
  // Evening peak: residential + commercial, centered at 7PM
  const eveningPeak =
    0.4 * Math.exp(-0.5 * Math.pow((hour - 19) / 2.5, 2));
  // Midday activity: offices, commercial
  const middayActivity =
    0.15 * Math.exp(-0.5 * Math.pow((hour - 12) / 4, 2));
  return Math.min(1.0, baseLoad + morningRamp + eveningPeak + middayActivity);
}

/**
 * Solar generation factor (0.0-1.0) based on time of day.
 * Peaks at noon, zero at night.
 */
export function solarGenerationFactor(hour: number): number {
  if (hour < 6 || hour > 18) return 0;
  // Bell curve centered at noon
  return Math.exp(-0.5 * Math.pow((hour - 12) / 3, 2));
}

/**
 * Get simulated hour from tick count.
 * 1 tick = 1 second in simulation.
 * Full day cycle = 1440 ticks (1 tick = 1 minute of simulated time).
 * This means 24 hours passes in 24 real minutes for demo purposes.
 */
export function tickToHour(tick: number): number {
  return (tick % 1440) / 60; // 0-24 hour range
}
