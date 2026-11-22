/**
 * Headless bot-vs-bot match runner, shared by `npm run sim:bots` and the tests.
 * Deterministic: same options -> same result.
 */
import { initPhysics } from '../core/physics';
import { createMatch, step } from '../core/simulation';
import type { SimEvent } from '../core/events';
import type { Tuning } from '../core/tuning';
import { defaultTuning } from '../core/tuning';
import { getArena } from '../registry/arenas';
import { getFighter } from '../registry/fighters';
import { createBot } from './bot';
import type { DifficultyId } from './difficulty';

export interface BotMatchOptions {
  a: string;
  b: string;
  difficultyA: DifficultyId;
  difficultyB: DifficultyId;
  seed: number;
  /** Give up after this many ticks (a match that times out is reported, not an error). */
  maxTicks?: number;
  tuning?: Partial<Tuning>;
  arena?: string;
}

export interface BotMatchResult {
  winner: number; // 0, 1 or -1 (timeout)
  wins: [number, number];
  ticks: number;
  roundLengths: number[];
  roundReasons: string[];
  /** Damage taken per part, by fighter. */
  takenByPart: number[][];
  dealtByPart: number[][];
  moveUses: number[][];
  dashes: [number, number];
  /** A fighter didn't move for 600 ticks while both were alive. */
  stuck: { fighter: number; tick: number } | null;
}

export const STUCK_TICKS = 600;

export async function runBotMatch(o: BotMatchOptions): Promise<BotMatchResult> {
  await initPhysics();
  const s = createMatch({
    fighters: [getFighter(o.a).def, getFighter(o.b).def],
    arena: getArena(o.arena ?? 'default'),
    seed: o.seed,
    tuning: { ...defaultTuning(), ...(o.tuning ?? {}) },
  });
  const bots = [createBot(s, 0, o.difficultyA, o.seed), createBot(s, 1, o.difficultyB, o.seed)];
  const maxTicks = o.maxTicks ?? 60 * 60 * 6;
  const roundLengths: number[] = [];
  const roundReasons: string[] = [];
  let roundStartTick = 0;
  let stuck: BotMatchResult['stuck'] = null;
  const anchors = [0, 1].map(() => ({ x: 0, y: 0, tick: -1 }));
  while (s.game.phase !== 'matchOver' && s.game.tick < maxTicks) {
    const events: SimEvent[] = step(s, [bots[0]!.input(s), bots[1]!.input(s)]);
    for (const e of events) {
      if (e.type === 'fightStart') {
        roundStartTick = e.tick;
        anchors.forEach((a) => (a.tick = -1));
      }
      if (e.type === 'roundOver') {
        roundLengths.push(e.tick - roundStartTick);
        roundReasons.push(e.reason);
      }
    }
    // Stuck detection during the fight phase.
    if (s.game.phase === 'fight' && !stuck) {
      for (let fi = 0; fi < 2; fi++) {
        const root = s.game.fighters[fi]!.parts[s.ctx.compiled[fi]!.root]!;
        if (root.body < 0) continue;
        const p = s.physics.pose(root.body);
        const a = anchors[fi]!;
        if (a.tick < 0 || Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 0.1) {
          a.x = p.x;
          a.y = p.y;
          a.tick = s.game.tick;
        } else if (s.game.tick - a.tick >= STUCK_TICKS) {
          stuck = { fighter: fi, tick: s.game.tick };
        }
      }
    }
  }
  const f = s.game.fighters;
  const result: BotMatchResult = {
    winner: s.game.phase === 'matchOver' ? s.game.matchWinner : -1,
    wins: [s.game.wins[0], s.game.wins[1]],
    ticks: s.game.tick,
    roundLengths,
    roundReasons,
    takenByPart: f.map((x) => [...x.stats.takenByPart]),
    dealtByPart: f.map((x) => [...x.stats.dealtByPart]),
    moveUses: f.map((x) => [...x.stats.moveUses]),
    dashes: [f[0]!.stats.dashes, f[1]!.stats.dashes],
    stuck,
  };
  s.physics.free();
  return result;
}
