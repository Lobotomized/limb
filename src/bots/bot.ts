/**
 * Utility-AI bot. A bot is a deterministic function of (state, fighter, memory, rng) that
 * returns the same InputFrame a human would produce. It never touches the simulation.
 *
 * Every `decisionInterval` ticks it scores options (approach, strafe, retreat, guard, each
 * available attack move) using what it perceived `reactionDelay` ticks ago: distance, which
 * own/enemy parts are healthy, the fighter's bot hints, core safety, facing, and ring-out
 * edges (stay away from its own edge, herd the opponent toward theirs). On hard it prefers
 * health trades: attacking with a part that has more health than the part it will hit.
 */
import { distanceToRingOut } from '../core/arena';
import { partAlive, posesFor } from '../core/fighter';
import { subtree, type CompiledFighter } from '../core/fighter-compile';
import { AimMode, ATTACK_BUTTONS, Button, quantizeAxis, type InputFrame } from '../core/input-frame';
import { facingOf } from '../core/locomotion';
import { atan2, clamp, cos, sin, type Vec2 } from '../core/math';
import { moveAvailable } from '../core/moves';
import { Rng, mixSeed } from '../core/rng';
import { MOVE_BUTTONS, type FighterBotHints, type MoveDirection } from '../core/schema/fighter-schema';
import type { SimState } from '../core/state';
import { botHintsFor } from '../registry/fighters';
import { DIFFICULTIES, type Difficulty, type DifficultyId } from './difficulty';

// ------------------------------------------------------------------ static model

interface MoveModel {
  index: number;
  /** Attack button bit. */
  button: number;
  direction: MoveDirection;
  name: string;
  /** Position (root-local, facing +x) of the striking part at the move's farthest point, including drive travel. */
  strike: Vec2;
  /** The part doing the hitting. */
  attackPart: number;
  /** Ticks to keep the button held (through hold phases). */
  holdTicks: number;
  /** Ticks until the move is over (no new move can start before). */
  totalTicks: number;
  isGuard: boolean;
  isAttack: boolean;
  /** Spins far enough to sweep a ring around the root. */
  spin: boolean;
  /** Estimated body travel (root-local) from drive phases. */
  travel: Vec2;
}

interface BotModel {
  moves: MoveModel[];
  /** Local angle of the shield parts' centroid (aim offset that presents them). */
  shieldAngle: number;
}

/** Hold phases are held this long past their minimum (bots don't charge forever). */
const BOT_EXTRA_HOLD = 8;
const BOT_GUARD_HOLD = 30;

function buildModel(cf: CompiledFighter, hints: FighterBotHints): BotModel {
  const def = cf.def;
  const idle = def.joints.map((j) => j.idleAngle);
  const moves = cf.moves.map((m) => {
    const name = def.moves[m.index]!.name;
    const isGuard = hints.guardMoves.includes(name);
    // Parts the move swings: everything below the joints it drives.
    const swung = [...new Set(m.joints.flatMap((ji) => subtree(cf, cf.jointChild[ji] as number)))];
    let attackPart = cf.root;
    let strike: Vec2 = { x: 0, y: 0 };
    let best = -Infinity;
    let travelX = 0;
    let travelY = 0;
    let spinAngle = 0;
    let holdTicks = 0;
    let total = 0;
    let holdSeen = false;
    const allHold = m.phases.every((ph) => ph.hold);
    let prev = [...idle];
    for (const ph of m.phases) {
      const extra = ph.hold ? (isGuard ? BOT_GUARD_HOLD : ph.spin !== null ? 0 : BOT_EXTRA_HOLD) : 0;
      total += ph.ticks + extra;
      if (!holdSeen) holdTicks += ph.ticks + extra;
      if (ph.hold) holdSeen = true;
      if (ph.drive) {
        // Roughly 70 % of the commanded speed is reached on average (acceleration).
        travelX += (ph.drive[0] * ph.ticks * 0.7) / 60;
        travelY += (ph.drive[1] * ph.ticks * 0.7) / 60;
      }
      if (ph.spin !== null) spinAngle += (Math.abs(ph.spin) * ph.ticks) / 60;
      const target = [...idle];
      for (const t of ph.targets) target[t.joint] = t.angle;
      const from = prev;
      prev = target;
      // Wind-ups and guards (hold phases) are not where a move hits, unless it is all holding.
      if (ph.hold && !allHold && ph.spin === null) continue;
      // A forward drive hits with whatever leads along it; otherwise the swung part reaching farthest.
      const lunge = ph.drive !== null && ph.drive[0] > 2 ? ph.drive : null;
      const ll = lunge ? Math.sqrt(lunge[0] * lunge[0] + lunge[1] * lunge[1]) : 1;
      const candidates = lunge ? cf.bfsOrder : swung;
      // Swings hit mid-arc as well as at the end: sample halfway and the final pose.
      for (const frac of [0.5, 1]) {
        const poses = posesFor(cf, 0, 0, 0, target.map((ang, ji) => from[ji]! + (ang - from[ji]!) * frac));
        for (const pi of candidates) {
          const pose = poses[pi]!;
          const x = pose.x + travelX;
          const y = pose.y + travelY;
          const score = lunge ? 100 + (x * lunge[0] + y * lunge[1]) / ll : x * x + y * y;
          if (score > best) {
            best = score;
            attackPart = pi;
            strike = { x, y };
          }
        }
      }
    }
    if (!holdSeen) holdTicks = 2;
    return {
      index: m.index,
      button: ATTACK_BUTTONS[MOVE_BUTTONS.indexOf(m.button)] as number,
      direction: m.direction,
      name,
      strike,
      attackPart,
      holdTicks,
      totalTicks: total,
      isGuard,
      isAttack: !isGuard && (hints.attackMoves.length === 0 || hints.attackMoves.includes(name)),
      spin: spinAngle > 3,
      travel: { x: travelX, y: travelY },
    };
  });
  let sx = 0;
  let sy = 0;
  const idlePose = posesFor(cf, 0, 0, 0, idle);
  for (const id of hints.shieldParts) {
    const i = cf.partIndex.get(id);
    if (i === undefined) continue;
    sx += idlePose[i]!.x;
    sy += idlePose[i]!.y;
  }
  return { moves, shieldAngle: sx === 0 && sy === 0 ? 0 : atan2(sy, sx) };
}

// ------------------------------------------------------------------ perception

interface PartObs {
  x: number;
  y: number;
  alive: boolean;
  health: number;
}

interface Observation {
  tick: number;
  oppCore: Vec2;
  oppRoot: Vec2;
  oppParts: PartObs[];
  oppHolding: boolean;
}

function observe(s: SimState, opp: number): Observation {
  const f = s.game.fighters[opp]!;
  const cf = s.ctx.compiled[opp]!;
  const parts = f.parts.map((p, i) => {
    if (p.body < 0) return { x: 0, y: 0, alive: false, health: 0 };
    const pose = s.physics.pose(p.body);
    return { x: pose.x, y: pose.y, alive: partAlive(f, i), health: p.health };
  });
  return {
    tick: s.game.tick,
    oppCore: { x: parts[cf.core]!.x, y: parts[cf.core]!.y },
    oppRoot: { x: parts[cf.root]!.x, y: parts[cf.root]!.y },
    oppParts: parts,
    oppHolding: f.action.move >= 0,
  };
}

// ------------------------------------------------------------------ memory

type Mode = 'approach' | 'strafe' | 'retreat' | 'hold-distance' | 'ram';

export interface BotMemory {
  history: Observation[];
  nextDecision: number;
  mode: Mode;
  strafeSign: number;
  aimNoise: number;
  /** Move to press next tick (-1 none). */
  pending: number;
  /** Attack button bit being held (-1 none). */
  heldButton: number;
  holdUntil: number;
  attackReadyAt: number;
  dashDir: Vec2 | null;
  prevButtons: number;
  /** Last tick an attack move was chosen (used to break stalemates by ramming). */
  lastAttackTick: number;
  /** Opponent total health at the last progress mark, and when it was taken. */
  progressHealth: number;
  progressTick: number;
  ramUntil: number;
}

export function createBotMemory(): BotMemory {
  return { history: [], nextDecision: 0, mode: 'approach', strafeSign: 1, aimNoise: 0, pending: -1, heldButton: -1, holdUntil: 0, attackReadyAt: 0, dashDir: null, prevButtons: 0, lastAttackTick: -1, progressHealth: Infinity, progressTick: 0, ramUntil: 0 };
}

// ------------------------------------------------------------------ the bot

export class Bot {
  readonly memory = createBotMemory();
  readonly rng: Rng;
  private readonly model: BotModel;

  constructor(
    sim: SimState,
    readonly fighter: number,
    readonly difficulty: Difficulty,
    seed: number,
    readonly hints: FighterBotHints = botHintsFor(sim.ctx.defs[fighter]!.id),
  ) {
    this.rng = new Rng(mixSeed(seed, fighter + 1, 0xb07));
    this.model = buildModel(sim.ctx.compiled[fighter]!, hints);
  }

  /** Produces this tick's input. Call exactly once per simulated tick. */
  input(s: SimState): InputFrame {
    return botInput(s, this.fighter, this.memory, this.rng, this.difficulty, this.hints, this.model);
  }
}

export function createBot(sim: SimState, fighter: number, difficulty: DifficultyId, seed: number): Bot {
  return new Bot(sim, fighter, DIFFICULTIES[difficulty], seed);
}

/** Without a usable attack for this long, the bot rams the opponent (breaks stalemates). */
const RAM_AFTER_TICKS = 300;
/** Opponent health must drop by this much to count as progress. */
const PROGRESS_HEALTH = 10;
const NO_PROGRESS_TICKS = 900;
const RAM_TICKS = 120;
/** Moves whose drive would end closer than this (m) to our own ring-out edge are skipped. */
const SAFE_EDGE = 1.0;

const IDLE: InputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimMode: AimMode.AUTO, buttons: 0 };

function dirVector(dir: MoveDirection, facing: number): Vec2 {
  if (dir === 'neutral') return { x: 0, y: 0 };
  const sign = dir === 'forward' ? 1 : -1;
  return { x: sign * cos(facing), y: sign * sin(facing) };
}

/** Pure bot step: (state, fighter, memory, rng) -> input. */
export function botInput(s: SimState, fi: number, mem: BotMemory, rng: Rng, diff: Difficulty, hints: FighterBotHints, model: BotModel): InputFrame {
  const g = s.game;
  const me = g.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  const opp = 1 - fi;
  const rootPart = me.parts[cf.root]!;
  if (g.phase !== 'fight' || rootPart.status !== 'attached' || g.fighters[opp]!.parts[s.ctx.compiled[opp]!.core]!.body < 0) {
    mem.history.length = 0;
    mem.heldButton = -1;
    mem.pending = -1;
    mem.prevButtons = 0;
    return { ...IDLE };
  }

  // ---- perception with reaction delay
  mem.history.push(observe(s, opp));
  while (mem.history.length > diff.reactionDelay + 1) mem.history.shift();
  const seen = mem.history[0]!;
  const rp = s.physics.pose(rootPart.body);
  const myPos = { x: rp.x, y: rp.y };
  const facing = facingOf(s, fi);
  const coreBody = me.parts[cf.core]!.body;
  const corePose = coreBody >= 0 ? s.physics.pose(coreBody) : rp;
  const toOpp = { x: seen.oppCore.x - myPos.x, y: seen.oppCore.y - myPos.y };
  const dist = Math.sqrt(toOpp.x * toOpp.x + toOpp.y * toOpp.y);
  const dirOpp = dist > 1e-6 ? { x: toOpp.x / dist, y: toOpp.y / dist } : { x: 1, y: 0 };
  const angleToOpp = atan2(toOpp.y, toOpp.x);
  const arena = s.ctx.arena;
  const myCoreHp = me.parts[cf.core]!.health / cf.def.parts[cf.core]!.maxHealth;

  /** Would this move's drive carry our core within SAFE_EDGE of our own ring-out edge? */
  const drivesOut = (m: MoveModel): boolean => {
    if (m.travel.x === 0 && m.travel.y === 0) return false;
    const c = cos(facing);
    const sn = sin(facing);
    return distanceToRingOut(arena, corePose.x + m.travel.x * c - m.travel.y * sn, corePose.y + m.travel.x * sn + m.travel.y * c) < SAFE_EDGE;
  };

  // ---- decisions
  if (g.tick >= mem.nextDecision && mem.heldButton < 0 && mem.pending < 0 && me.action.move < 0) {
    mem.nextDecision = g.tick + diff.decisionInterval;
    mem.aimNoise = rng.range(-diff.aimNoise, diff.aimNoise);
    if (diff.healthTrades) {
      // Flank toward the opponent's weakest attached part (e.g. a thin back plate).
      let weakest = -1;
      let weakestHp = Infinity;
      seen.oppParts.forEach((p, i) => {
        if (p.alive && p.health < weakestHp) {
          weakestHp = p.health;
          weakest = i;
        }
      });
      if (weakest >= 0) {
        const wp = seen.oppParts[weakest]!;
        const toWeak = { x: wp.x - seen.oppRoot.x, y: wp.y - seen.oppRoot.y };
        const toMe = { x: myPos.x - seen.oppRoot.x, y: myPos.y - seen.oppRoot.y };
        // Cross product sign: which way round the opponent brings us toward the weak side.
        const cross = toMe.x * toWeak.y - toMe.y * toWeak.x;
        mem.strafeSign = cross >= 0 ? 1 : -1;
      }
    } else if (rng.chance(0.08)) mem.strafeSign = -mem.strafeSign;
    const ideal = hints.idealDistance;
    const noise = (): number => rng.range(0, diff.choiceNoise);
    let bestScore = -1;
    let bestMove = -1;
    let bestMode: Mode = 'approach';
    const consider = (score: number, mode: Mode, move = -1): void => {
      if (score > bestScore) {
        bestScore = score;
        bestMode = mode;
        bestMove = move;
      }
    };
    consider((dist > ideal ? 0.5 + 0.3 * (dist - ideal) : 0.05) + noise(), 'approach');
    consider(0.3 + noise(), dist > ideal * 1.4 ? 'approach' : 'strafe');
    consider((myCoreHp < 0.3 && dist < ideal ? 0.65 : 0.04) + noise(), 'retreat');
    if (g.tick >= mem.attackReadyAt) {
      const oppCf = s.ctx.compiled[opp]!;
      // Guard: one option, only when an enemy strike is coming and our core is in reach.
      const guard = model.moves.find((m) => m.isGuard && moveAvailable(me, cf, m.index) && !drivesOut(m));
      const coreDist = Math.sqrt((seen.oppRoot.x - corePose.x) * (seen.oppRoot.x - corePose.x) + (seen.oppRoot.y - corePose.y) * (seen.oppRoot.y - corePose.y));
      if (guard && seen.oppHolding && coreDist < hints.reach + 0.6 && rng.chance(diff.guardChance)) {
        consider(0.45 + 0.9 * (1 - myCoreHp) + noise(), 'hold-distance', guard.index);
      }
      for (const m of model.moves) {
        if (!m.isAttack || !moveAvailable(me, cf, m.index) || drivesOut(m)) continue;
        // Where the striking part ends up if the move were done now (facing the aim).
        // Spin moves sweep a full ring at the strike radius instead of one point.
        const c = cos(facing);
        const sn = sin(facing);
        const sx = myPos.x + m.strike.x * c - m.strike.y * sn;
        const sy = myPos.y + m.strike.x * sn + m.strike.y * c;
        const ringR = Math.sqrt(m.strike.x * m.strike.x + m.strike.y * m.strike.y);
        let nearest = -1;
        let nd = Infinity;
        seen.oppParts.forEach((p, i) => {
          if (!p.alive) return;
          const d = m.spin
            ? Math.abs(Math.sqrt((p.x - myPos.x) * (p.x - myPos.x) + (p.y - myPos.y) * (p.y - myPos.y)) - ringR)
            : Math.sqrt((p.x - sx) * (p.x - sx) + (p.y - sy) * (p.y - sy));
          if (d < nd) {
            nd = d;
            nearest = i;
          }
        });
        if (nearest < 0) continue;
        const hit = clamp(1 - (nd - 0.15) / 0.55, 0, 1);
        if (hit <= 0) continue;
        // Spins hit whatever is around (often just limb tips), so they are worth a bit less.
        let value = (1 + (nearest === oppCf.core ? 2 : 0)) * (m.spin ? 0.7 : 1);
        if (diff.healthTrades) {
          // The key strategy: hit with parts that can afford the equal damage.
          const mine = me.parts[m.attackPart]!.health;
          const theirs = seen.oppParts[nearest]!.health;
          value += clamp((mine - theirs) / 60, -1, 1) * 0.4;
          if (mine < 20 && nearest !== oppCf.core) value -= 0.8;
        }
        consider(hit * value + noise(), 'hold-distance', m.index);
      }
    }
    const usableAttacks = model.moves.filter((m) => m.isAttack && moveAvailable(me, cf, m.index)).length;
    if (mem.lastAttackTick < 0 || dist > ideal + 1) mem.lastAttackTick = g.tick;
    // Progress check: if the opponent hasn't lost health for a while, charge (stalemate breaker).
    const oppHealth = seen.oppParts.reduce((sum, p) => sum + (p.alive ? p.health : 0), 0);
    if (oppHealth < mem.progressHealth - PROGRESS_HEALTH) {
      mem.progressHealth = oppHealth;
      mem.progressTick = g.tick;
    } else if (g.tick - mem.progressTick > NO_PROGRESS_TICKS) {
      mem.ramUntil = g.tick + RAM_TICKS;
      mem.progressTick = g.tick;
      mem.progressHealth = oppHealth;
    }
    if (g.tick < mem.ramUntil) {
      bestMode = 'ram';
      bestMove = -1;
    } else if (bestMove >= 0) mem.lastAttackTick = g.tick;
    else if (usableAttacks === 0 || g.tick - mem.lastAttackTick > RAM_AFTER_TICKS) bestMode = 'ram';
    mem.mode = bestMode;
    mem.pending = bestMove;

    // Dash decisions.
    if (me.dashCooldown === 0) {
      const myEdge = distanceToRingOut(arena, corePose.x, corePose.y);
      const oppEdge = distanceToRingOut(arena, seen.oppCore.x, seen.oppCore.y);
      const toCenter = { x: -corePose.x, y: -corePose.y };
      const tl = Math.sqrt(toCenter.x * toCenter.x + toCenter.y * toCenter.y) || 1;
      if (myEdge < 1.6 && rng.chance(diff.dashChance)) mem.dashDir = { x: toCenter.x / tl, y: toCenter.y / tl };
      else if (oppEdge < 2.2 && dist < hints.idealDistance + 1.3 && oppEdge < myEdge && rng.chance(diff.dashChance)) mem.dashDir = dirOpp;
      else if (bestMode === 'approach' && dist > hints.idealDistance + 2.5 && rng.chance(diff.dashChance * 0.4)) mem.dashDir = dirOpp;
      else if (bestMode === 'ram' && dist < hints.idealDistance + 1.5 && rng.chance(Math.max(0.3, diff.dashChance))) mem.dashDir = dirOpp;
    }
  }

  // ---- movement vector
  let mv: Vec2;
  const ideal = hints.idealDistance;
  const oppEdge = distanceToRingOut(arena, seen.oppCore.x, seen.oppCore.y);
  if (mem.mode === 'approach' || mem.mode === 'hold-distance') {
    let target = seen.oppCore;
    if (oppEdge < 3) {
      // Herd: approach from the arena-center side so hits push them out.
      const ol = Math.sqrt(seen.oppCore.x * seen.oppCore.x + seen.oppCore.y * seen.oppCore.y) || 1;
      target = { x: seen.oppCore.x - (seen.oppCore.x / ol) * ideal * 0.6, y: seen.oppCore.y - (seen.oppCore.y / ol) * ideal * 0.6 };
    }
    const tx = target.x - myPos.x;
    const ty = target.y - myPos.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    const push = mem.mode === 'approach' ? clamp((dist - ideal * 0.85) / 0.5, -0.6, 1) : clamp((dist - ideal) / 0.6, -0.8, 0.8);
    mv = { x: (tx / tl) * push, y: (ty / tl) * push };
  } else if (mem.mode === 'strafe') {
    const radial = clamp((dist - ideal) / 0.6, -0.7, 0.7);
    mv = { x: -dirOpp.y * mem.strafeSign * 0.9 + dirOpp.x * radial, y: dirOpp.x * mem.strafeSign * 0.9 + dirOpp.y * radial };
  } else if (mem.mode === 'ram') {
    // No usable attack: charge body-first through the opponent's core.
    mv = dirOpp;
  } else {
    mv = { x: -dirOpp.x, y: -dirOpp.y };
  }
  // Stay away from our own ring-out edge.
  const myEdge = distanceToRingOut(arena, corePose.x, corePose.y);
  if (myEdge < 2.5) {
    const cl = Math.sqrt(corePose.x * corePose.x + corePose.y * corePose.y) || 1;
    const w = (2.5 - myEdge) * 1.4;
    mv = { x: mv.x - (corePose.x / cl) * w, y: mv.y - (corePose.y / cl) * w };
  }
  const ml = Math.sqrt(mv.x * mv.x + mv.y * mv.y);
  if (ml > 1) mv = { x: mv.x / ml, y: mv.y / ml };

  // ---- aim: present the shield parts toward the opponent
  const aim = angleToOpp - model.shieldAngle + mem.aimNoise;
  const out: InputFrame = {
    moveX: quantizeAxis(mv.x),
    moveY: quantizeAxis(mv.y),
    aimX: quantizeAxis(cos(aim)),
    aimY: quantizeAxis(sin(aim)),
    aimMode: AimMode.VECTOR,
    buttons: 0,
  };

  // ---- moves: press (with the right stick direction), hold through hold phases, release
  if (mem.heldButton >= 0) {
    if (g.tick < mem.holdUntil) out.buttons |= mem.heldButton;
    else mem.heldButton = -1;
  } else if (mem.pending >= 0) {
    const m = model.moves[mem.pending]!;
    const bit = m.button;
    if (mem.prevButtons & bit) {
      // Must release before a new press registers.
    } else if (!moveAvailable(me, cf, m.index)) {
      mem.pending = -1;
    } else {
      const d = dirVector(m.direction, facing);
      out.moveX = quantizeAxis(d.x);
      out.moveY = quantizeAxis(d.y);
      out.buttons |= bit;
      mem.heldButton = bit;
      mem.holdUntil = g.tick + m.holdTicks + rng.int(0, diff.timingNoise);
      // The move plays out on its own; the next one waits until it is over.
      mem.attackReadyAt = g.tick + m.totalTicks + (mem.holdUntil - g.tick - m.holdTicks) + 4 + rng.int(0, diff.timingNoise);
      mem.pending = -1;
    }
  } else if (mem.dashDir) {
    if (!(mem.prevButtons & Button.DASH)) {
      out.moveX = quantizeAxis(mem.dashDir.x);
      out.moveY = quantizeAxis(mem.dashDir.y);
      out.buttons |= Button.DASH;
    }
    mem.dashDir = null;
  }
  mem.prevButtons = out.buttons;
  return out;
}
