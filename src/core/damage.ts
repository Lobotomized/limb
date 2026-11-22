/**
 * The damage rule.
 *
 * When two parts start touching:
 *   closingSpeed = relative velocity at the contact point along the contact normal,
 *                  using velocities from the END OF THE PREVIOUS TICK
 *   reducedMass  = m1*m2/(m1+m2)       (wall: the part's own mass)
 *   impact       = closingSpeed * reducedMass
 *   damage       = round(damageScale * max(0, impact - impactThreshold)), capped at maxHitDamage
 * BOTH parts lose exactly `damage`. Wall hits damage only the part.
 * The same pair cannot deal damage again for pairCooldownTicks.
 */
import type { Vec2 } from './math';
import type { Tuning } from './tuning';

export interface BodyKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
}

/** Velocity of a body at a world point (v + w × r). */
export function pointVelocity(k: BodyKinematics, p: Vec2): Vec2 {
  const rx = p.x - k.x;
  const ry = p.y - k.y;
  return { x: k.vx - k.w * ry, y: k.vy + k.w * rx };
}

/**
 * Closing speed of A toward B along normal n (pointing from A to B). Never negative.
 * `b` null = a static wall.
 */
export function closingSpeed(a: BodyKinematics, b: BodyKinematics | null, normal: Vec2, point: Vec2): number {
  const va = pointVelocity(a, point);
  const vb = b ? pointVelocity(b, point) : { x: 0, y: 0 };
  const rel = (va.x - vb.x) * normal.x + (va.y - vb.y) * normal.y;
  return rel > 0 ? rel : 0;
}

export function reducedMass(m1: number, m2: number | null): number {
  return m2 === null ? m1 : (m1 * m2) / (m1 + m2);
}

/** Impact (N·s-like units) to integer damage. */
export function damageFromImpact(impact: number, t: Tuning, scale = 1): number {
  const raw = t.damageScale * scale * Math.max(0, impact - t.impactThreshold);
  return Math.min(t.maxHitDamage, Math.round(raw));
}

/** Hit-stop ticks for a hit of this damage (0 for small hits, up to hitStopMaxTicks). */
export function hitStopFor(damage: number, t: Tuning): number {
  if (damage < t.hitStopMinDamage) return 0;
  const k = Math.min(1, (damage - t.hitStopMinDamage) / Math.max(1, t.bigHitDamage - t.hitStopMinDamage));
  return Math.max(1, Math.round(k * t.hitStopMaxTicks));
}

/** Cooldown key for a part pair or a part-wall pair. Order-independent. */
export function pairKey(f1: number, p1: number, f2: number, p2: number): string {
  if (f2 < 0) return `${f1}.${p1}|wall`;
  return f1 < f2 || (f1 === f2 && p1 <= p2) ? `${f1}.${p1}|${f2}.${p2}` : `${f2}.${p2}|${f1}.${p1}`;
}

/** True if the pair may deal damage at `tick`; drops expired entries lazily. */
export function cooldownReady(cooldowns: Record<string, number>, key: string, tick: number): boolean {
  const until = cooldowns[key];
  return until === undefined || tick >= until;
}

/** Removes expired cooldown entries (keeps the state small and the hash stable). */
export function pruneCooldowns(cooldowns: Record<string, number>, tick: number): void {
  for (const k of Object.keys(cooldowns).sort()) {
    if ((cooldowns[k] as number) <= tick) delete cooldowns[k];
  }
}
