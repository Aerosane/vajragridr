export {
  processAlerts,
  tickHealing,
  getShieldStatus,
  isBreakerTripped,
  isBusIsolated,
  isLineRerouted,
  setShieldEnabled,
  resetShield,
} from './SelfHealingEngine';
export type { HealingEventDTO } from './SelfHealingEngine';
