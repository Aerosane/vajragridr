export { GRID_TOPOLOGY, BUS_MAP, LINE_MAP, getLinesForBus, getAdjacentBuses } from './gridConfig';
export { THRESHOLDS, NOISE, SYSTEM } from './thresholds';

// Derived bus name lookup for UI components
import { GRID_TOPOLOGY } from './gridConfig';
export const BUS_NAMES: Record<string, string> = Object.fromEntries(
  GRID_TOPOLOGY.buses.map(b => [b.id, b.name])
);
