/** A one-part "ball" fighter for precise physics/damage tests. */
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { BIG_BOX, runIdle } from './helpers';
import { createMatch, step } from '../src/core/simulation';
import { defaultTuning } from '../src/core/tuning';
import { emptyInput } from '../src/core/input-frame';
import type { FighterDef } from '../src/core/schema/fighter-schema';
import type { SimState } from '../src/core/state';
import type { SimEvent } from '../src/core/events';

export function ballFighter(id: string, mass: number, health: number, radius = 0.4): FighterDef {
  return {
    id,
    name: id,
    description: '',
    parts: [{ id: 'ball', name: 'Ball', shape: { kind: 'circle', radius }, mass, maxHealth: health }],
    joints: [],
    rootPart: 'ball',
    corePart: 'ball',
    moves: [],
    locomotion: { walkSpeed: 1, walkForce: 1, turnSpeed: 1, turnTorque: 1, dashImpulse: 1 },
  };
}

export const BALL_TUNING = { ...defaultTuning(), linearDamping: 0, angularDamping: 0, partRestitution: 0.2 };

export function ballMatch(mA: number, mB: number, hA = 1000, hB = 1000): SimState {
  const s = createMatch({ fighters: [ballFighter('a', mA, hA), ballFighter('b', mB, hB)], arena: BIG_BOX, seed: 1, tuning: { ...BALL_TUNING } });
  runIdle(s, BALL_TUNING.countdownTicks);
  return s;
}

export function place(s: SimState, fi: number, x: number, y: number, vx: number, vy: number): void {
  const body = s.game.fighters[fi]!.parts[0]!.body;
  s.physics.setPose(body, x, y, 0);
  s.physics.world.getRigidBody(body).setLinvel(new RAPIER.Vector2(vx, vy), true);
}

export function idle(s: SimState, n: number): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...step(s, [emptyInput(), emptyInput()]));
  return ev;
}

export const hits = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit');
