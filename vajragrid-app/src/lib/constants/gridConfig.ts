import type { TopologyConfig } from '../types';

// 5-bus regional smart grid based on simplified IEEE 9-bus topology
export const GRID_TOPOLOGY: TopologyConfig = {
  buses: [
    {
      id: 'BUS-001',
      name: 'Indrapura',
      type: 'SLACK',
      nominalVoltage: 230,
      ratedGeneration: 150,
      ratedLoad: 0,
      meterCount: 0,
      latitude: 28.6139,
      longitude: 77.209,
    },
    {
      id: 'BUS-002',
      name: 'Vajra Solar',
      type: 'PV_GEN',
      nominalVoltage: 230,
      ratedGeneration: 80,
      ratedLoad: 0,
      meterCount: 0,
      latitude: 28.58,
      longitude: 77.15,
    },
    {
      id: 'BUS-003',
      name: 'Shakti Nagar',
      type: 'PQ_LOAD',
      nominalVoltage: 230,
      ratedLoad: 85,
      ratedGeneration: 0,
      meterCount: 52000,
      latitude: 28.65,
      longitude: 77.25,
    },
    {
      id: 'BUS-004',
      name: 'Kavach Grid',
      type: 'PQ_LOAD',
      nominalVoltage: 230,
      ratedLoad: 60,
      ratedGeneration: 0,
      meterCount: 15000,
      latitude: 28.55,
      longitude: 77.3,
    },
    {
      id: 'BUS-005',
      name: 'Sudarshan Hub',
      type: 'PQ_LOAD',
      nominalVoltage: 230,
      ratedLoad: 45,
      ratedGeneration: 0,
      meterCount: 28000,
      latitude: 28.6,
      longitude: 77.35,
    },
  ],
  lines: [
    {
      id: 'TL-01',
      fromBus: 'BUS-001',
      toBus: 'BUS-003',
      resistance: 0.01,
      reactance: 0.085,
      capacity: 200,
      lengthKm: 80,
    },
    {
      id: 'TL-02',
      fromBus: 'BUS-001',
      toBus: 'BUS-002',
      resistance: 0.017,
      reactance: 0.092,
      capacity: 150,
      lengthKm: 120,
    },
    {
      id: 'TL-03',
      fromBus: 'BUS-002',
      toBus: 'BUS-004',
      resistance: 0.032,
      reactance: 0.161,
      capacity: 100,
      lengthKm: 95,
    },
    {
      id: 'TL-04',
      fromBus: 'BUS-003',
      toBus: 'BUS-005',
      resistance: 0.039,
      reactance: 0.17,
      capacity: 100,
      lengthKm: 70,
    },
    {
      id: 'TL-05',
      fromBus: 'BUS-004',
      toBus: 'BUS-005',
      resistance: 0.085,
      reactance: 0.072,
      capacity: 80,
      lengthKm: 50,
    },
    {
      id: 'TL-06',
      fromBus: 'BUS-002',
      toBus: 'BUS-003',
      resistance: 0.009,
      reactance: 0.072,
      capacity: 150,
      lengthKm: 60,
    },
  ],
};

// Map for quick lookups
export const BUS_MAP = new Map(GRID_TOPOLOGY.buses.map((b) => [b.id, b]));
export const LINE_MAP = new Map(GRID_TOPOLOGY.lines.map((l) => [l.id, l]));

// Get all lines connected to a bus
export function getLinesForBus(busId: string) {
  return GRID_TOPOLOGY.lines.filter(
    (l) => l.fromBus === busId || l.toBus === busId
  );
}

// Get adjacent bus IDs
export function getAdjacentBuses(busId: string): string[] {
  const lines = getLinesForBus(busId);
  return lines.map((l) => (l.fromBus === busId ? l.toBus : l.fromBus));
}
