/**
 * Round flow, win conditions and match creation.
 *
 *  countdown (90 ticks, frozen) -> fight -> [core death: hit-stop 18 ticks] -> roundEnd (120 ticks)
 *  -> next round countdown | matchOver.
 * A round where both cores die (or both ring out) the same tick is a draw and is replayed.
 */
import { buildArena } from './arena';
import { AbilityHooks } from './abilities/hooks';
import type { EventSink } from './events';
import { buildFighter } from './fighter';
import { PhysicsWorld } from './physics';
import type { FighterStats, SimState } from './state';

/** (Re)builds the physics world and fighters for the current round and enters the countdown. */
export function startRound(s: SimState, sink: EventSink): void {
  const g = s.game;
  const t = s.ctx.tuning;
  const prevStats: (FighterStats | undefined)[] = g.fighters.map((f) => f.stats);
  s.physics.free();
  s.physics = PhysicsWorld.create({ x: 0, y: 0 }, t.solverIterations);
  g.wallColliders = buildArena(s.physics, s.ctx.arena, t);
  g.fighters = [0, 1].map((i) => {
    const f = buildFighter(s.physics, s.ctx.compiled[i]!, i, s.ctx.arena.spawns[i]!, t);
    const old = prevStats[i];
    if (old) f.stats = old;
    return f;
  });
  g.cooldowns = {};
  g.hitStop = 0;
  g.pendingRoundEnd = null;
  g.phase = 'countdown';
  g.phaseTicks = 0;
  sink.emit({ type: 'roundStart', round: g.round, wins: [g.wins[0], g.wins[1]] });
  for (let i = 0; i < 2; i++) AbilityHooks.fighterCreated(s, sink, i);
}

/** Ends the current round with a result. */
export function endRound(s: SimState, sink: EventSink, winner: number | null, reason: 'core' | 'ringout' | 'draw'): void {
  const g = s.game;
  if (winner !== null) g.wins[winner] = (g.wins[winner] ?? 0) + 1;
  g.lastRoundWinner = winner;
  g.pendingRoundEnd = null;
  g.phase = 'roundEnd';
  g.phaseTicks = 0;
  sink.emit({ type: 'roundOver', round: g.round, winner, reason: winner === null ? 'draw' : reason, wins: [g.wins[0], g.wins[1]] });
  if (winner !== null && g.wins[winner]! >= s.ctx.tuning.roundsToWin) g.matchWinner = winner;
}

/** Called every tick during the roundEnd phase. */
export function tickRoundEnd(s: SimState, sink: EventSink): void {
  const g = s.game;
  g.phaseTicks++;
  if (g.phaseTicks < s.ctx.tuning.roundEndTicks) return;
  if (g.matchWinner >= 0) {
    g.phase = 'matchOver';
    g.phaseTicks = 0;
    sink.emit({ type: 'matchOver', winner: g.matchWinner, wins: [g.wins[0], g.wins[1]] });
    return;
  }
  if (g.lastRoundWinner !== null) g.round++; // draws are replayed with the same number
  startRound(s, sink);
}

/** Called every tick during the countdown. */
export function tickCountdown(s: SimState, sink: EventSink): void {
  const g = s.game;
  g.phaseTicks++;
  if (g.phaseTicks >= s.ctx.tuning.countdownTicks) {
    g.phase = 'fight';
    g.phaseTicks = 0;
    sink.emit({ type: 'fightStart', round: g.round });
  }
}
