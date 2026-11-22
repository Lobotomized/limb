/**
 * The deterministic simulation: `step(state, inputs)` advances one tick (1/60 s) and
 * returns the events of that tick. The state is updated in place; use saveState /
 * restoreState (core/state.ts) for snapshots and rollback.
 */
import type { Ability, ContactPair } from './abilities/ability';
import { AbilityHooks } from './abilities/hooks';
import { crossedRingOut, outsideArena } from './arena';
import { closingSpeed, cooldownReady, damageFromImpact, hitStopFor, pairKey, pruneCooldowns, reducedMass, type BodyKinematics } from './damage';
import { EventSink, type PartRef, type SimEvent } from './events';
import { killPart, updateDebris } from './fighter';
import { compileFighter } from './fighter-compile';
import { ACTION_BUTTONS, EMPTY_INPUT, sanitizeInput, type InputFrame } from './input-frame';
import { updateLocomotion, facingOf } from './locomotion';
import { endRound, startRound, tickCountdown, tickRoundEnd } from './match';
import { activeSpin, updateJoints, updateSlots } from './moves';
import { physicsReady, PhysicsWorld } from './physics';
import { Rng } from './rng';
import type { ArenaDef } from './schema/arena-schema';
import type { FighterDef } from './schema/fighter-schema';
import type { SimContext, SimState } from './state';
import { defaultTuning, type Tuning } from './tuning';

export interface MatchOptions {
  fighters: [FighterDef, FighterDef];
  arena: ArenaDef;
  seed: number;
  tuning?: Tuning;
  abilities?: Ability[];
}

/** Creates a new match at round 1 (countdown). `initPhysics()` must have been awaited. */
export function createMatch(o: MatchOptions): SimState {
  if (!physicsReady()) throw new Error('initPhysics() must be awaited before createMatch()');
  const tuning = o.tuning ?? defaultTuning();
  const abilities = o.abilities ?? [];
  const ctx: SimContext = {
    defs: o.fighters,
    compiled: [compileFighter(o.fighters[0]), compileFighter(o.fighters[1])],
    arena: o.arena,
    tuning,
    abilities,
  };
  const s: SimState = {
    ctx,
    physics: PhysicsWorld.create({ x: 0, y: 0 }, tuning.solverIterations),
    game: {
      tick: 0,
      seed: o.seed >>> 0,
      rng: new Rng(o.seed).state,
      round: 1,
      wins: [0, 0],
      phase: 'countdown',
      phaseTicks: 0,
      hitStop: 0,
      pendingRoundEnd: null,
      lastRoundWinner: null,
      matchWinner: -1,
      fighters: [],
      wallColliders: [],
      cooldowns: {},
      abilities: {},
    },
  };
  for (const a of abilities) s.game.abilities[a.id] = a.initialState(ctx);
  const sink = new EventSink(0);
  startRound(s, sink);
  return s;
}

type Owner = { kind: 'part'; ref: PartRef } | { kind: 'wall' };

function colliderOwners(s: SimState): Map<number, Owner> {
  const m = new Map<number, Owner>();
  for (const h of s.game.wallColliders) m.set(h, { kind: 'wall' });
  for (const f of s.game.fighters) {
    f.parts.forEach((p, i) => {
      if (p.collider >= 0) m.set(p.collider, { kind: 'part', ref: { fighter: f.index, part: i } });
    });
  }
  return m;
}

function refLess(a: PartRef, b: PartRef): number {
  return a.fighter - b.fighter || a.part - b.part;
}

/** Converts raw started-collision handle pairs into sorted part/wall pairs. */
function buildContactPairs(s: SimState, started: Array<[number, number]>): ContactPair[] {
  const owners = colliderOwners(s);
  const pairs: ContactPair[] = [];
  for (const [h1, h2] of started) {
    const o1 = owners.get(h1);
    const o2 = owners.get(h2);
    if (!o1 || !o2) continue;
    if (o1.kind === 'wall' && o2.kind === 'wall') continue;
    if (o1.kind === 'part' && o2.kind === 'part') {
      const [a, ca, b, cb] = refLess(o1.ref, o2.ref) <= 0 ? [o1.ref, h1, o2.ref, h2] : [o2.ref, h2, o1.ref, h1];
      pairs.push({ a, b, colliderA: ca, colliderB: cb });
    } else if (o1.kind === 'part') {
      pairs.push({ a: o1.ref, b: null, colliderA: h1, colliderB: h2 });
    } else if (o2.kind === 'part') {
      pairs.push({ a: o2.ref, b: null, colliderA: h2, colliderB: h1 });
    }
  }
  pairs.sort((x, y) => {
    const d = refLess(x.a, y.a);
    if (d !== 0) return d;
    if (x.b === null && y.b === null) return x.colliderB - y.colliderB;
    if (x.b === null) return 1;
    if (y.b === null) return -1;
    return refLess(x.b, y.b);
  });
  return pairs;
}

/** Kinematics of every attached part at the end of the previous tick. */
function recordKinematics(s: SimState): Map<number, BodyKinematics> {
  const m = new Map<number, BodyKinematics>();
  for (const f of s.game.fighters) {
    for (const p of f.parts) {
      if (p.body < 0) continue;
      const pose = s.physics.pose(p.body);
      const v = s.physics.velocity(p.body);
      m.set(p.body, { x: pose.x, y: pose.y, vx: v.vx, vy: v.vy, w: v.w });
    }
  }
  return m;
}

/** Applies the damage rule to the started contacts. Returns parts that died, in order. */
function applyDamage(s: SimState, pairs: ContactPair[], kin: Map<number, BodyKinematics>, sink: EventSink): { ref: PartRef; point: { x: number; y: number } }[] {
  const g = s.game;
  const t = s.ctx.tuning;
  const deaths: { ref: PartRef; point: { x: number; y: number } }[] = [];
  for (const pair of pairs) {
    const fa = g.fighters[pair.a.fighter]!;
    const pa = fa.parts[pair.a.part]!;
    if (pa.status !== 'attached' || pa.health <= 0) continue;
    const defA = s.ctx.defs[pair.a.fighter]!.parts[pair.a.part]!;
    let pb = null;
    let defB = null;
    if (pair.b) {
      pb = g.fighters[pair.b.fighter]!.parts[pair.b.part]!;
      if (pb.status !== 'attached' || pb.health <= 0) continue;
      defB = s.ctx.defs[pair.b.fighter]!.parts[pair.b.part]!;
    }
    const key = pair.b ? pairKey(pair.a.fighter, pair.a.part, pair.b.fighter, pair.b.part) : pairKey(pair.a.fighter, pair.a.part, -1, -1);
    if (!cooldownReady(g.cooldowns, key, g.tick)) continue;
    const ka = kin.get(pa.body);
    const kb = pb ? kin.get(pb.body) : null;
    if (!ka || (pb && !kb)) continue;
    const info = s.physics.contactInfo(pair.colliderA, pair.colliderB);
    const speed = closingSpeed(ka, kb ?? null, info.normal, info.point);
    const impact = speed * reducedMass(defA.mass, defB ? defB.mass : null);
    const damage = damageFromImpact(impact, t, pair.b ? 1 : t.wallDamageScale);
    if (damage <= 0) continue;
    g.cooldowns[key] = g.tick + t.pairCooldownTicks;
    pa.health = Math.max(0, pa.health - damage);
    fa.stats.takenByPart[pair.a.part]! += damage;
    if (pb && pair.b) {
      pb.health = Math.max(0, pb.health - damage);
      const fb = g.fighters[pair.b.fighter]!;
      fb.stats.takenByPart[pair.b.part]! += damage;
      fb.stats.dealtByPart[pair.b.part]! += damage;
      fa.stats.dealtByPart[pair.a.part]! += damage;
    }
    sink.emit({ type: 'hit', a: pair.a, b: pair.b, damage, impact, point: info.point });
    g.hitStop = Math.max(g.hitStop, hitStopFor(damage, t));
    if (pa.health <= 0) deaths.push({ ref: pair.a, point: info.point });
    if (pb && pair.b && pb.health <= 0) deaths.push({ ref: pair.b, point: info.point });
  }
  return deaths;
}

/** Advances the simulation by one tick. Returns the events of this tick. */
export function step(s: SimState, rawInputs: readonly [InputFrame, InputFrame]): SimEvent[] {
  const inputs = [sanitizeInput(rawInputs[0]), sanitizeInput(rawInputs[1])] as const;
  const g = s.game;
  const sink = new EventSink(g.tick);
  const t = s.ctx.tuning;

  if (g.phase === 'matchOver') {
    g.tick++;
    return sink.events;
  }
  if (g.phase === 'countdown') {
    tickCountdown(s, sink);
    g.fighters.forEach((f, i) => (f.prevButtons = inputs[i]!.buttons));
    g.tick++;
    return sink.events;
  }
  if (g.hitStop > 0) {
    // Frozen: physics is not stepped. Inputs keep arriving; held buttons register afterwards.
    g.hitStop--;
    if (g.hitStop === 0 && g.pendingRoundEnd) {
      const p = g.pendingRoundEnd;
      endRound(s, sink, p.winner, p.reason);
    }
    g.tick++;
    return sink.events;
  }

  const fighting = g.phase === 'fight';
  AbilityHooks.beforeStep(s, sink);
  for (let fi = 0; fi < 2; fi++) {
    const input = fighting ? inputs[fi]! : EMPTY_INPUT;
    const f = g.fighters[fi]!;
    const cf = s.ctx.compiled[fi]!;
    const facing = f.parts[cf.root]!.status === 'attached' ? facingOf(s, fi) : 0;
    updateSlots(s, fi, input, facing, sink);
    let actions = 0;
    ACTION_BUTTONS.forEach((bit, i) => {
      if (input.buttons & bit) actions |= 1 << i;
    });
    AbilityHooks.input(s, sink, fi, actions);
    updateJoints(s, fi);
    updateLocomotion(s, fi, input, activeSpin(f, cf), sink);
    f.prevButtons = input.buttons;
  }

  const kin = recordKinematics(s);
  const started = s.physics.step();
  const pairs = buildContactPairs(s, started);
  AbilityHooks.contact(s, sink, pairs);

  const coreLost = [false, false];
  if (fighting) {
    const deaths = applyDamage(s, pairs, kin, sink);
    for (const d of deaths) {
      const r = killPart(s, d.ref.fighter, d.ref.part, sink, d.point);
      if (r.coreLost) coreLost[d.ref.fighter] = true;
      AbilityHooks.partDied(s, sink, d.ref);
    }
  }
  updateDebris(s, sink, (x, y) => outsideArena(s.ctx.arena, x, y));
  AbilityHooks.afterStep(s, sink);

  if (fighting && !g.pendingRoundEnd) {
    if (coreLost[0] || coreLost[1]) {
      for (let fi = 0; fi < 2; fi++) {
        if (!coreLost[fi]) continue;
        const cf = s.ctx.compiled[fi]!;
        const core = g.fighters[fi]!.parts[cf.core]!;
        const pose = core.body >= 0 ? s.physics.pose(core.body) : { x: 0, y: 0 };
        sink.emit({ type: 'coreDied', fighter: fi, point: { x: pose.x, y: pose.y } });
      }
      const winner = coreLost[0] && coreLost[1] ? null : coreLost[0] ? 1 : 0;
      g.pendingRoundEnd = { winner, reason: winner === null ? 'draw' : 'core' };
      g.hitStop = t.coreDeathHitStopTicks;
    } else {
      const out = [0, 1].map((fi) => {
        const cf = s.ctx.compiled[fi]!;
        const core = g.fighters[fi]!.parts[cf.core]!;
        if (core.body < 0) return false;
        const p = s.physics.pose(core.body);
        return crossedRingOut(s.ctx.arena, p.x, p.y);
      });
      if (out[0] || out[1]) {
        for (let fi = 0; fi < 2; fi++) if (out[fi]) sink.emit({ type: 'ringOut', fighter: fi });
        const winner = out[0] && out[1] ? null : out[0] ? 1 : 0;
        endRound(s, sink, winner, winner === null ? 'draw' : 'ringout');
      }
    }
  } else if (g.phase === 'roundEnd') {
    tickRoundEnd(s, sink);
  }

  if (g.tick % 60 === 0) pruneCooldowns(g.cooldowns, g.tick);
  g.tick++;
  return sink.events;
}
