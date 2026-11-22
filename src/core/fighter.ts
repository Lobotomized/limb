/**
 * Building fighters in the physics world from their definitions, part health,
 * and detachment (a dead part leaves the body together with everything attached through it).
 */
import type { CompiledFighter } from './fighter-compile';
import { subtree } from './fighter-compile';
import type { EventSink } from './events';
import { vadd, vrotate, clamp, type Vec2 } from './math';
import type { PhysicsWorld, CollisionRole } from './physics';
import type { FighterState, PartState, SimState } from './state';
import type { Tuning } from './tuning';

export function fighterRole(index: number): CollisionRole {
  return index === 0 ? 'fighter0' : 'fighter1';
}

/** Per-fighter damping: heavier fighters keep momentum longer (feel slower to stop and turn). */
export function fighterDamping(cf: CompiledFighter, t: Tuning): { linear: number; angular: number } {
  const scale = clamp(t.dampingReferenceMass / cf.totalMass, t.dampingScaleMin, t.dampingScaleMax);
  return { linear: t.linearDamping * scale, angular: t.angularDamping * scale };
}

/** World pose of every part in the idle pose, given the root pose. */
export function idlePoses(cf: CompiledFighter, x: number, y: number, angle: number): { x: number; y: number; angle: number }[] {
  const poses: { x: number; y: number; angle: number }[] = cf.def.parts.map(() => ({ x: 0, y: 0, angle: 0 }));
  poses[cf.root] = { x, y, angle };
  for (const p of cf.bfsOrder) {
    if (p === cf.root) continue;
    const ji = cf.parentJoint[p] as number;
    const j = cf.def.joints[ji]!;
    const parent = poses[cf.parentPart[p] as number]!;
    const childAngle = parent.angle + j.idleAngle;
    const anchorWorld: Vec2 = vadd({ x: parent.x, y: parent.y }, vrotate({ x: j.anchorParent[0], y: j.anchorParent[1] }, parent.angle));
    const offset = vrotate({ x: j.anchorChild[0], y: j.anchorChild[1] }, childAngle);
    poses[p] = { x: anchorWorld.x - offset.x, y: anchorWorld.y - offset.y, angle: childAngle };
  }
  return poses;
}

/** Creates all bodies and joints for a fighter at the given spawn pose. */
export function buildFighter(physics: PhysicsWorld, cf: CompiledFighter, index: number, spawn: { x: number; y: number; angle: number }, t: Tuning): FighterState {
  const def = cf.def;
  const poses = idlePoses(cf, spawn.x, spawn.y, spawn.angle);
  const damping = fighterDamping(cf, t);
  const parts: PartState[] = def.parts.map((p, i) => {
    const pose = poses[i]!;
    const h = physics.createPartBody({
      x: pose.x,
      y: pose.y,
      angle: pose.angle,
      shape: p.shape,
      mass: p.mass,
      role: fighterRole(index),
      linearDamping: damping.linear,
      angularDamping: damping.angular,
      restitution: t.partRestitution,
      friction: t.partFriction,
    });
    return { health: p.maxHealth, status: 'attached', body: h.body, collider: h.collider, lostTick: -1, killed: false };
  });
  const joints = def.joints.map((j, ji) => {
    const handle = physics.createRevolute(
      parts[cf.jointParent[ji] as number]!.body,
      parts[cf.jointChild[ji] as number]!.body,
      { x: j.anchorParent[0], y: j.anchorParent[1] },
      { x: j.anchorChild[0], y: j.anchorChild[1] },
      j.limits,
    );
    return { handle, commanded: j.idleAngle, goal: j.idleAngle, speed: t.defaultReturnSpeed, returnSpeed: t.defaultReturnSpeed };
  });
  return {
    index,
    defId: def.id,
    parts,
    joints,
    slots: [0, 1, 2, 3].map(() => ({ held: false, move: -1, pressTick: -1 })),
    prevButtons: 0,
    dashCooldown: 0,
    aimAngle: spawn.angle,
    stats: {
      dealtByPart: def.parts.map(() => 0),
      takenByPart: def.parts.map(() => 0),
      moveUses: def.moves.map(() => 0),
      dashes: 0,
    },
  };
}

/** True if the part is attached to the body and has health left. */
export function partAlive(f: FighterState, part: number): boolean {
  const p = f.parts[part];
  return !!p && p.status === 'attached' && p.health > 0;
}

export interface DetachResult {
  coreLost: boolean;
}

/**
 * Kills a part (health reached 0): it detaches together with every part attached only
 * through it. Lost parts become debris that collides only with walls.
 */
export function killPart(s: SimState, fighter: number, part: number, sink: EventSink, point: Vec2): DetachResult {
  const f = s.game.fighters[fighter]!;
  const cf = s.ctx.compiled[fighter]!;
  const p = f.parts[part]!;
  if (p.status !== 'attached') return { coreLost: false };
  p.health = 0;
  p.killed = true;
  // Cut the joint to the parent; the subtree stays jointed to the dead part as one chunk.
  const pj = cf.parentJoint[part] as number;
  if (pj >= 0) {
    const js = f.joints[pj]!;
    if (js.handle >= 0) s.physics.removeJoint(js.handle);
    js.handle = -1;
  }
  let coreLost = false;
  for (const q of subtree(cf, part)) {
    const qs = f.parts[q]!;
    if (qs.status !== 'attached') continue;
    qs.status = 'debris';
    qs.lostTick = s.game.tick;
    s.physics.setRole(qs.collider, 'debris');
    s.physics.setDamping(qs.body, s.ctx.tuning.debrisLinearDamping, s.ctx.tuning.debrisAngularDamping);
    if (q === part) sink.emit({ type: 'partDied', ref: { fighter, part }, point });
    else sink.emit({ type: 'partDetached', ref: { fighter, part: q } });
    if (q === cf.core) coreLost = true;
  }
  // Cancel held moves that need a lost part.
  for (const slot of f.slots) {
    if (slot.move < 0) continue;
    const m = cf.moves[slot.move]!;
    if (m.requires.some((r) => f.parts[r]!.status !== 'attached')) {
      slot.move = -1;
      slot.held = false;
    }
  }
  return { coreLost };
}

/** Removes debris whose lifetime has passed or that left the arena. */
export function updateDebris(s: SimState, sink: EventSink, outside: (x: number, y: number) => boolean): void {
  const t = s.ctx.tuning;
  for (const f of s.game.fighters) {
    f.parts.forEach((p, i) => {
      if (p.status !== 'debris') return;
      const pose = s.physics.pose(p.body);
      if (s.game.tick - p.lostTick >= t.debrisTicks || outside(pose.x, pose.y)) {
        s.physics.removeBody(p.body);
        p.status = 'removed';
        p.body = -1;
        p.collider = -1;
        sink.emit({ type: 'debrisRemoved', ref: { fighter: f.index, part: i } });
        // Joints whose bodies were removed no longer exist in Rapier.
        const cf = s.ctx.compiled[f.index]!;
        f.joints.forEach((j, ji) => {
          if (cf.jointParent[ji] === i || cf.jointChild[ji] === i) j.handle = -1;
        });
      }
    });
  }
}
