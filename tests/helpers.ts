/** Shared helpers for headless simulation tests. */
import { initPhysics } from '../src/core/physics';
import { createMatch, step } from '../src/core/simulation';
import { emptyInput, type InputFrame } from '../src/core/input-frame';
import type { ArenaDef } from '../src/core/schema/arena-schema';
import type { SimEvent } from '../src/core/events';
import type { SimState } from '../src/core/state';
import type { Ability } from '../src/core/abilities/ability';
import { getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';
import { defaultTuning, type Tuning } from '../src/core/tuning';
import { wrapAngle } from '../src/core/math';

export async function setup(): Promise<void> {
  await initPhysics();
}

/** A big closed box: no ring-outs, fighters far apart. Good for isolated movement tests. */
export const BIG_BOX: ArenaDef = {
  id: 'testbox',
  name: 'Test box',
  width: 40,
  height: 40,
  sides: { left: 'wall', right: 'wall', top: 'wall', bottom: 'wall' },
  wallThickness: 1,
  spawns: [
    { x: -10, y: 0, angle: 0 },
    { x: 10, y: 0, angle: 3.141592653589793 },
  ],
  cameraMargin: 1,
};

export interface MatchSetup {
  a?: string;
  b?: string;
  arena?: ArenaDef;
  seed?: number;
  tuning?: Partial<Tuning>;
  abilities?: Ability[];
  skipCountdown?: boolean;
}

export function newMatch(o: MatchSetup = {}): SimState {
  const s = createMatch({
    fighters: [getFighter(o.a ?? 'humanoid').def, getFighter(o.b ?? 'humanoid').def],
    arena: o.arena ?? getArena('default'),
    seed: o.seed ?? 1,
    tuning: { ...defaultTuning(), ...(o.tuning ?? {}) },
    abilities: o.abilities ?? [],
  });
  if (o.skipCountdown !== false) runIdle(s, s.ctx.tuning.countdownTicks);
  return s;
}

export function runIdle(s: SimState, ticks: number): SimEvent[] {
  return run(s, ticks, () => [emptyInput(), emptyInput()]);
}

export function run(s: SimState, ticks: number, inputs: (tick: number) => [InputFrame, InputFrame]): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...step(s, inputs(s.game.tick)));
  return out;
}

export function input(p: Partial<InputFrame>): InputFrame {
  return { ...emptyInput(), ...p };
}

/** Relative angle (child - parent) of a joint, measured from the bodies. */
export function jointAngle(s: SimState, fighter: number, jointId: string): number {
  const cf = s.ctx.compiled[fighter]!;
  const ji = cf.jointIndex.get(jointId)!;
  const f = s.game.fighters[fighter]!;
  const pa = s.physics.pose(f.parts[cf.jointParent[ji]!]!.body).angle;
  const ca = s.physics.pose(f.parts[cf.jointChild[ji]!]!.body).angle;
  return wrapAngle(ca - pa);
}

export function partIndex(s: SimState, fighter: number, partId: string): number {
  return s.ctx.compiled[fighter]!.partIndex.get(partId)!;
}

export function rootSpeed(s: SimState, fighter: number): number {
  const cf = s.ctx.compiled[fighter]!;
  const v = s.physics.velocity(s.game.fighters[fighter]!.parts[cf.root]!.body);
  return Math.sqrt(v.vx * v.vx + v.vy * v.vy);
}

/** Moves every attached part of a fighter by (dx, dy), zeroing velocities. */
export function translateFighter(s: SimState, fighter: number, dx: number, dy: number): void {
  for (const p of s.game.fighters[fighter]!.parts) {
    if (p.body < 0) continue;
    const pose = s.physics.pose(p.body);
    s.physics.setPose(p.body, pose.x + dx, pose.y + dy, pose.angle);
  }
}
