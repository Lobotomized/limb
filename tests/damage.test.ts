// Damage rule tests: equal damage, threshold, cooldown, wall hits, heavier/faster = more damage.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup } from './helpers';
import { ballMatch, place, idle, hits, BALL_TUNING as T } from './ball';
import type { SimEvent } from '../src/core/events';
import { damageFromImpact, closingSpeed, reducedMass, pairKey, cooldownReady } from '../src/core/damage';

beforeAll(setup);


describe('damage rule', () => {
  it('formula: impact = closingSpeed * reducedMass; threshold; rounding; cap', () => {
    expect(reducedMass(2, 5)).toBeCloseTo(10 / 7, 12);
    expect(reducedMass(3, null)).toBe(3);
    expect(damageFromImpact(T.impactThreshold, T)).toBe(0);
    expect(damageFromImpact(T.impactThreshold + 10, T)).toBe(Math.round(T.damageScale * 10));
    expect(damageFromImpact(1e6, T)).toBe(T.maxHitDamage);
    const a = { x: 0, y: 0, vx: 5, vy: 0, w: 0 };
    const b = { x: 1, y: 0, vx: -3, vy: 0, w: 0 };
    expect(closingSpeed(a, b, { x: 1, y: 0 }, { x: 0.5, y: 0 })).toBeCloseTo(8, 12);
    expect(closingSpeed(b, a, { x: -1, y: 0 }, { x: 0.5, y: 0 })).toBeCloseTo(8, 12);
    // Separating parts have zero closing speed.
    expect(closingSpeed({ ...a, vx: -1 }, { ...b, vx: 1 }, { x: 1, y: 0 }, { x: 0.5, y: 0 })).toBe(0);
    // A spinning part hits with its tip velocity.
    const spinner = { x: 0, y: 0, vx: 0, vy: 0, w: 10 };
    expect(closingSpeed(spinner, null, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(10, 12);
  });

  it('both parts lose exactly the same damage, whichever one was moving', () => {
    const s = ballMatch(2, 5);
    place(s, 0, -2, 0, 8, 0);
    place(s, 1, 0, 0, 0, 0);
    const ev = idle(s, 30);
    const h = hits(ev);
    expect(h.length).toBe(1);
    const d = h[0]!.damage;
    const expected = damageFromImpact(8 * reducedMass(2, 5), T);
    expect(d).toBe(expected);
    expect(s.game.fighters[0]!.parts[0]!.health).toBe(1000 - d);
    expect(s.game.fighters[1]!.parts[0]!.health).toBe(1000 - d);
    // Mirror: the other ball moving gives the same damage.
    const m = ballMatch(2, 5);
    place(m, 0, 0, 0, 0, 0);
    place(m, 1, 2, 0, -8, 0);
    expect(hits(idle(m, 30))[0]!.damage).toBe(expected);
  });

  it('gentle touches deal nothing', () => {
    const s = ballMatch(2, 2);
    place(s, 0, -1, 0, 1, 0);
    place(s, 1, 0, 0, 0, 0);
    expect(hits(idle(s, 60))).toEqual([]);
    expect(s.game.fighters[1]!.parts[0]!.health).toBe(1000);
  });

  it('heavier or faster impacts deal more damage', () => {
    const dmg = (mA: number, v: number): number => {
      const s = ballMatch(mA, 4);
      place(s, 0, -2, 0, v, 0);
      place(s, 1, 0, 0, 0, 0);
      return hits(idle(s, 40))[0]?.damage ?? 0;
    };
    expect(dmg(2, 10)).toBeGreaterThan(dmg(2, 7));
    expect(dmg(4, 7)).toBeGreaterThan(dmg(2, 7));
  });

  it('the same pair cannot deal damage again within the cooldown', () => {
    const s = ballMatch(3, 3);
    place(s, 0, -1.2, 0, 12, 0);
    place(s, 1, 0, 0, 0, 0);
    let ev = idle(s, 3);
    expect(hits(ev).length).toBe(1);
    const firstTick = hits(ev)[0]!.tick;
    // Separate and smash again immediately (well within 9 ticks).
    place(s, 0, -1.0, 0, 14, 0);
    place(s, 1, 0, 0, 0, 0);
    ev = idle(s, 2);
    expect(hits(ev).length).toBe(0);
    expect(s.game.tick - firstTick).toBeLessThan(T.pairCooldownTicks);
    // After the cooldown the pair deals damage again.
    idle(s, T.pairCooldownTicks);
    place(s, 0, -1.2, 0, 12, 0);
    place(s, 1, 0, 0, 0, 0);
    expect(hits(idle(s, 3)).length).toBe(1);
    expect(cooldownReady({ [pairKey(0, 1, 1, 2)]: 10 }, pairKey(1, 2, 0, 1), 9)).toBe(false);
  });

  it('wall hits damage only the part', () => {
    const s = ballMatch(3, 3);
    place(s, 0, 0, 18, 0, 12); // toward the top wall at y = 20
    place(s, 1, 0, -5, 0, 0);
    const h = hits(idle(s, 30));
    expect(h.length).toBe(1);
    expect(h[0]!.b).toBeNull();
    const d = h[0]!.damage;
    expect(d).toBe(damageFromImpact(12 * 3, T));
    expect(s.game.fighters[0]!.parts[0]!.health).toBe(1000 - d);
    expect(s.game.fighters[1]!.parts[0]!.health).toBe(1000);
  });

  it('big hits cause deterministic hit-stop that freezes physics', () => {
    const s = ballMatch(5, 5);
    place(s, 0, -2, 0, 20, 0);
    place(s, 1, 0, 0, 0, 0);
    let ev: SimEvent[] = [];
    while (hits(ev).length === 0) ev = idle(s, 1);
    expect(s.game.hitStop).toBeGreaterThan(0);
    const before = s.physics.pose(s.game.fighters[1]!.parts[0]!.body);
    idle(s, 1);
    expect(s.physics.pose(s.game.fighters[1]!.parts[0]!.body)).toEqual(before);
  });
});

