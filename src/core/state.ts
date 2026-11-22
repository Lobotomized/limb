/**
 * Game state types, save/restore and hashing.
 *
 * The full simulation state is: the Rapier world (binary snapshot) + `GameState`
 * (plain JSON-compatible data). `SimContext` is immutable match configuration
 * (fighter definitions, arena, tuning, abilities) and is never serialized.
 */
import type { ArenaDef } from './schema/arena-schema';
import type { FighterDef } from './schema/fighter-schema';
import type { Tuning } from './tuning';
import type { CompiledFighter } from './fighter-compile';
import type { Ability } from './abilities/ability';
import { PhysicsWorld } from './physics';
import { Hasher } from './hash';

export type PartStatus = 'attached' | 'debris' | 'removed';

export interface PartState {
  health: number;
  status: PartStatus;
  /** Rapier handles (stable across snapshot/restore). -1 once removed. */
  body: number;
  collider: number;
  /** Tick the part was lost (died or detached), -1 while attached. */
  lostTick: number;
  /** True if the part's own health reached 0 (vs. lost through an ancestor). */
  killed: boolean;
}

export interface JointState {
  /** Rapier joint handle, -1 when the joint no longer exists. */
  handle: number;
  /** Current motor target (moves toward `goal` at a limited speed). */
  commanded: number;
  goal: number;
  /** Speed (rad/s) used to travel toward `goal`. */
  speed: number;
  /** Return speed (rad/s) to use after the move driving this joint is released. */
  returnSpeed: number;
}

/** The move a fighter is performing (one at a time) and the next one buffered. */
export interface ActionState {
  /** Index into def.moves of the active move, -1 if none. */
  move: number;
  /** Current phase of the active move. */
  phase: number;
  /** Ticks spent in the current phase. */
  phaseTick: number;
  /** True while the button that started the active move is still held. */
  held: boolean;
  /** Move pressed during the active one (starts when it ends, if still fresh), -1 if none. */
  queued: number;
  queuedTick: number;
}

export interface FighterStats {
  /** Damage each own part dealt to enemy parts. */
  dealtByPart: number[];
  /** Damage each own part took (from enemy parts and walls). */
  takenByPart: number[];
  moveUses: number[];
  dashes: number;
}

export interface FighterState {
  index: number;
  defId: string;
  parts: PartState[];
  joints: JointState[];
  action: ActionState;
  prevButtons: number;
  dashCooldown: number;
  /** Last facing target (radians), used when the aim stick is released. */
  aimAngle: number;
  stats: FighterStats;
}

export type MatchPhase = 'countdown' | 'fight' | 'roundEnd' | 'matchOver';

export interface GameState {
  tick: number;
  seed: number;
  /** RNG state (see core/rng.ts). */
  rng: number;
  round: number;
  wins: [number, number];
  phase: MatchPhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  hitStop: number;
  /** Round result waiting for the core-death hit-stop to finish. */
  pendingRoundEnd: { winner: number | null; reason: 'core' | 'ringout' | 'draw' } | null;
  lastRoundWinner: number | null;
  matchWinner: number;
  fighters: FighterState[];
  wallColliders: number[];
  /** Damage cooldowns: pair key -> first tick at which the pair may deal damage again. */
  cooldowns: Record<string, number>;
  /** Serializable state of each ability, by ability id. */
  abilities: Record<string, unknown>;
}

export interface SimContext {
  defs: [FighterDef, FighterDef];
  compiled: [CompiledFighter, CompiledFighter];
  arena: ArenaDef;
  tuning: Tuning;
  abilities: Ability[];
}

export interface SimState {
  ctx: SimContext;
  game: GameState;
  physics: PhysicsWorld;
}

export interface Snapshot {
  tick: number;
  game: GameState;
  physics: Uint8Array;
}

function cloneGame(g: GameState): GameState {
  return structuredClone(g);
}

/** Saves the complete simulation state. */
export function saveState(s: SimState): Snapshot {
  return { tick: s.game.tick, game: cloneGame(s.game), physics: s.physics.snapshot() };
}

/** Restores a snapshot in place (the previous physics world is freed). */
export function restoreState(s: SimState, snap: Snapshot): void {
  const old = s.physics;
  s.physics = PhysicsWorld.fromSnapshot(snap.physics);
  old.free();
  s.game = cloneGame(snap.game);
}

/** Creates an independent copy of a simulation (own physics world). */
export function cloneSim(s: SimState): SimState {
  return { ctx: s.ctx, game: cloneGame(s.game), physics: PhysicsWorld.fromSnapshot(s.physics.snapshot()) };
}

/**
 * Hash of the full state. By default hashes game state + every live body's exact pose and
 * velocity bits (cheap, catches any divergence). `full` also hashes the raw Rapier snapshot.
 */
export function hashState(s: SimState, full = false): string {
  const h = new Hasher();
  h.value(s.game);
  for (const f of s.game.fighters) {
    for (const p of f.parts) {
      if (p.body < 0 || p.status === 'removed') continue;
      const pose = s.physics.pose(p.body);
      const vel = s.physics.velocity(p.body);
      h.num(pose.x).num(pose.y).num(pose.angle).num(vel.vx).num(vel.vy).num(vel.w);
    }
  }
  if (full) h.bytes(s.physics.snapshot());
  return h.hex();
}
