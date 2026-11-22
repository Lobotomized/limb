import { describe, expect, it } from 'vitest';
import { sin, cos, atan2, atan, wrapAngle, angleDiff, PI } from '../src/core/math';
import { Rng, mixSeed } from '../src/core/rng';

describe('deterministic math', () => {
  it('sin/cos match Math within 1e-8 over a wide range', () => {
    for (let x = -50; x <= 50; x += 0.0137) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-8);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-8);
    }
  });
  it('atan2 matches Math.atan2 within 1e-8 in every quadrant', () => {
    for (let a = -3.1; a <= 3.1; a += 0.01) {
      for (const r of [0.001, 1, 250]) {
        const y = r * Math.sin(a);
        const x = r * Math.cos(a);
        expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-8);
      }
    }
    expect(atan2(0, 0)).toBe(0);
    expect(atan2(1, 0)).toBeCloseTo(PI / 2, 12);
    expect(atan(1e9)).toBeCloseTo(PI / 2, 8);
  });
  it('wrapAngle and angleDiff stay in [-PI, PI]', () => {
    for (let a = -40; a < 40; a += 0.3) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-PI - 1e-12);
      expect(w).toBeLessThanOrEqual(PI + 1e-12);
    }
    expect(angleDiff(3, -3)).toBeCloseTo(2 * PI - 6, 12);
  });
});

describe('rng', () => {
  it('is reproducible from a seed and serializable', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    const c = new Rng(0);
    c.state = a.state;
    expect(c.nextU32()).toBe(a.nextU32());
  });
  it('produces values in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
  });
});
