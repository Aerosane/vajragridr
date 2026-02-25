import { describe, it, expect } from 'vitest';
import { generateTelemetry } from '../DataGenerator';
import { injectFDI } from '../attacks/FDIAttack';
import { injectCommandSpoof } from '../attacks/CommandSpoof';
import { injectSensorTamper } from '../attacks/SensorTamper';
import { injectMeterAttack } from '../attacks/MeterAttack';
import { injectMaDIoT } from '../attacks/MaDIoTAttack';

describe('Attack Injectors', () => {
  const baseTelemetry = () => generateTelemetry(50);

  describe('FDI Attack', () => {
    it('distorts voltage on target bus', () => {
      const before = baseTelemetry();
      const after = injectFDI(before, 'BUS-003', 0.9);
      const busBefore = before.find(t => t.busId === 'BUS-003')!;
      const busAfter = after.find(t => t.busId === 'BUS-003')!;
      expect(Math.abs(busAfter.voltage - busBefore.voltage)).toBeGreaterThan(5);
    });

    it('does not affect non-target buses', () => {
      const before = baseTelemetry();
      const after = injectFDI(before, 'BUS-003', 0.9);
      const b1Before = before.find(t => t.busId === 'BUS-001')!;
      const b1After = after.find(t => t.busId === 'BUS-001')!;
      expect(b1After.voltage).toBe(b1Before.voltage);
    });

    it('intensity scales the distortion', () => {
      const base = baseTelemetry();
      const low = injectFDI(base, 'BUS-003', 0.3);
      const high = injectFDI(base, 'BUS-003', 0.9);
      const lowDelta = Math.abs(low.find(t => t.busId === 'BUS-003')!.voltage - base.find(t => t.busId === 'BUS-003')!.voltage);
      const highDelta = Math.abs(high.find(t => t.busId === 'BUS-003')!.voltage - base.find(t => t.busId === 'BUS-003')!.voltage);
      expect(highDelta).toBeGreaterThan(lowDelta);
    });
  });

  describe('Command Spoof', () => {
    it('trips the breaker on target bus', () => {
      const after = injectCommandSpoof(baseTelemetry(), 'BUS-002', 0.8);
      const bus = after.find(t => t.busId === 'BUS-002')!;
      expect(bus.breakerStatus).toBe('TRIP');
    });

    it('reduces voltage on target bus', () => {
      const before = baseTelemetry();
      const after = injectCommandSpoof(before, 'BUS-002', 0.8);
      expect(after.find(t => t.busId === 'BUS-002')!.voltage)
        .toBeLessThan(before.find(t => t.busId === 'BUS-002')!.voltage);
    });
  });

  describe('Sensor Tamper', () => {
    it('drifts voltage progressively over ticks', () => {
      const base = baseTelemetry();
      const early = injectSensorTamper(base, 'BUS-004', 0.5, 10);
      const late = injectSensorTamper(base, 'BUS-004', 0.5, 100);
      const earlyV = early.find(t => t.busId === 'BUS-004')!.voltage;
      const lateV = late.find(t => t.busId === 'BUS-004')!.voltage;
      expect(lateV).toBeGreaterThan(earlyV);
    });
  });

  describe('Meter Attack', () => {
    it('zeroes meter consumption on target bus', () => {
      const after = injectMeterAttack(baseTelemetry(), 'BUS-003', 1.0);
      const bus = after.find(t => t.busId === 'BUS-003')!;
      expect(bus.meterConsumption).toBe(0);
    });

    it('partial intensity reduces but does not zero consumption', () => {
      const base = baseTelemetry();
      const baseBus = base.find(t => t.busId === 'BUS-003')!;
      if (baseBus.meterConsumption > 0) {
        const after = injectMeterAttack(base, 'BUS-003', 0.5);
        const bus = after.find(t => t.busId === 'BUS-003')!;
        expect(bus.meterConsumption).toBeGreaterThan(0);
        expect(bus.meterConsumption).toBeLessThan(baseBus.meterConsumption);
      }
    });
  });

  describe('MaDIoT Attack', () => {
    it('manipulates load on target bus', () => {
      const before = baseTelemetry();
      const after = injectMaDIoT(before, 'BUS-005', 0.8);
      const busBefore = before.find(t => t.busId === 'BUS-005')!;
      const busAfter = after.find(t => t.busId === 'BUS-005')!;
      // MaDIoT should change active power
      expect(busAfter.activePower).not.toBe(busBefore.activePower);
    });
  });
});
