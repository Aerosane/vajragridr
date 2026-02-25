// Detection thresholds — based on Indian Electricity Grid Code (IEGC) / CERC standards

export const THRESHOLDS = {
  voltage: {
    nominal: 230, // kV
    warningLow: 218.5, // -5%
    warningHigh: 241.5, // +5%
    criticalLow: 207, // -10%
    criticalHigh: 253, // +10%
    rateOfChange: 10, // kV/s max normal
  },
  frequency: {
    nominal: 50.0, // Hz
    warningLow: 49.9,
    warningHigh: 50.05,
    criticalLow: 49.5,
    criticalHigh: 50.5,
    rocofWarning: 0.5, // Hz/s
    rocofCritical: 1.0, // Hz/s
  },
  power: {
    balanceThreshold: 0.05, // 5% imbalance tolerance
    loadRampRate: 0.1, // 10% per minute max normal
    forecastDeviation: 0.25, // 25% deviation from forecast
  },
  powerFactor: {
    warning: 0.85,
    critical: 0.8,
  },
  lineLoading: {
    warning: 80, // %
    critical: 95, // %
  },
  transformer: {
    warningTemp: 65, // °C
    criticalTemp: 80, // °C
  },
  statistical: {
    zScoreThreshold: 3.0, // standard deviations
    cusumThreshold: 4.0, // cumulative sum threshold (in σ)
    correlationThreshold: 0.7, // min Pearson r for adjacent buses
    windowSize: 60, // samples for rolling stats
    shortWindow: 15, // samples for fast detection
  },
  ml: {
    anomalyScoreThreshold: 0.65, // Isolation Forest threshold
  },
  meter: {
    discrepancyThreshold: 0.1, // 10% mismatch PMU vs meters
  },
} as const;

// Noise parameters for realistic simulation
export const NOISE = {
  voltage: { mean: 0, stdDev: 1.5 }, // kV
  frequency: { mean: 0, stdDev: 0.015 }, // Hz
  power: { mean: 0, stdDevPercent: 0.02 }, // 2% of rated
  powerFactor: { mean: 0, stdDev: 0.01 },
  temperature: { mean: 0, stdDev: 0.5 }, // °C
} as const;

// System constants
export const SYSTEM = {
  inertiaConstant: 4.0, // H in seconds
  basePower: 230, // MVA
  nominalFrequency: 50.0, // Hz
  voltageRegulationCoeff: 0.05, // k factor
  dataRateMs: 1000, // telemetry interval (1 second)
  maxAlertHistory: 500,
} as const;
