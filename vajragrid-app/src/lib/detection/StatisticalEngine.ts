import { THRESHOLDS } from '@/lib/constants/thresholds';
import type { GridTelemetry } from '@/lib/types/grid';

export interface Anomaly {
  parameter: string;
  value: number;
  zScore: number;
  busId: string;
}

export interface CUSUMResult {
  parameter: string;
  value: number;
  cumulativeSum: number;
  busId: string;
  thresholdExceeded: boolean;
}

export class StatisticalDetector {
  private history: Map<string, GridTelemetry[]> = new Map();
  private cusumState: Map<string, Map<string, number>> = new Map();
  private readonly WINDOW_SIZE = THRESHOLDS.statistical.windowSize;

  addSample(busId: string, telemetry: GridTelemetry) {
    if (!this.history.has(busId)) {
      this.history.set(busId, []);
    }
    const busHistory = this.history.get(busId)!;
    busHistory.push(telemetry);
    if (busHistory.length > this.WINDOW_SIZE) {
      busHistory.shift();
    }
  }

  getZScoreAnomalies(busId: string): Anomaly[] {
    const busHistory = this.history.get(busId);
    if (!busHistory || busHistory.length < 10) return [];

    const latest = busHistory[busHistory.length - 1];
    const anomalies: Anomaly[] = [];
    const parameters: (keyof Pick<GridTelemetry, 'voltage' | 'frequency' | 'activePower'>)[] = ['voltage', 'frequency', 'activePower'];

    parameters.forEach(param => {
      const values = busHistory.map(h => h[param] as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length);

      if (stdDev > 0) {
        const zScore = Math.abs((latest[param] as number) - mean) / stdDev;
        if (zScore > THRESHOLDS.statistical.zScoreThreshold) {
          anomalies.push({
            parameter: param,
            value: latest[param] as number,
            zScore,
            busId,
          });
        }
      }
    });

    return anomalies;
  }

  getCUSUM(busId: string): CUSUMResult[] {
    const busHistory = this.history.get(busId);
    if (!busHistory || busHistory.length < 10) return [];

    const latest = busHistory[busHistory.length - 1];
    const results: CUSUMResult[] = [];
    const parameters: (keyof Pick<GridTelemetry, 'voltage' | 'frequency' | 'activePower'>)[] = ['voltage', 'frequency', 'activePower'];

    if (!this.cusumState.has(busId)) {
      this.cusumState.set(busId, new Map());
    }
    const busCusum = this.cusumState.get(busId)!;

    parameters.forEach(param => {
      const values = busHistory.map(h => h[param] as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length);
      
      const k = 0.5 * stdDev; // slack value
      const currentValue = latest[param] as number;
      
      // Basic upper CUSUM logic: S_i = max(0, S_{i-1} + (x_i - mean - k))
      const prevState = busCusum.get(param) || 0;
      const currentCusum = Math.max(0, prevState + (currentValue - mean - k));
      busCusum.set(param, currentCusum);

      const threshold = THRESHOLDS.statistical.cusumThreshold * stdDev;
      
      results.push({
        parameter: param,
        value: currentValue,
        cumulativeSum: currentCusum,
        busId,
        thresholdExceeded: currentCusum > threshold && threshold > 0,
      });
    });

    return results;
  }

  getCrossCorrelation(bus1Id: string, bus2Id: string): number {
    const h1 = this.history.get(bus1Id);
    const h2 = this.history.get(bus2Id);
    if (!h1 || !h2 || h1.length < 10 || h2.length < 10) return 1.0;

    // Use voltage for cross-correlation as it's the most coupled parameter
    const v1 = h1.map(h => h.voltage);
    const v2 = h2.map(h => h.voltage);
    const length = Math.min(v1.length, v2.length);
    const data1 = v1.slice(-length);
    const data2 = v2.slice(-length);

    return this.calculatePearsonCorrelation(data1, data2);
  }

  getLoadForecastDeviation(busId: string, expectedLoad: number): number {
    const busHistory = this.history.get(busId);
    if (!busHistory || busHistory.length === 0) return 0;

    const currentLoad = Math.abs(busHistory[busHistory.length - 1].activePower);
    if (expectedLoad === 0) return 0;
    
    return Math.abs(currentLoad - expectedLoad) / expectedLoad;
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX) * Math.sqrt(denY);
    return den === 0 ? 0 : num / den;
  }
}
