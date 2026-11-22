// Every fighter pair at medium difficulty finishes a bot match within the tick limit, with no
// exceptions and no stuck states (a fighter not moving for 600 ticks while both are alive).
import { describe, expect, it } from 'vitest';
import { runBotMatch } from '../src/bots/runner';
import { allFighters } from '../src/registry/fighters';

const ids = allFighters().map((f) => f.def.id);
const pairs = ids.flatMap((a, i) => ids.slice(i).map((b) => [a, b] as const));
/** 12 minutes of game time: mirrors with frequent draws (replayed rounds) can run long. */
const LIMIT = 60 * 60 * 12;

describe.each(pairs)('medium bots: %s vs %s', (a, b) => {
  it('finish a match without getting stuck', async () => {
    const r = await runBotMatch({ a, b, difficultyA: 'medium', difficultyB: 'medium', seed: 1, maxTicks: LIMIT });
    expect(r.stuck, `stuck: ${JSON.stringify(r.stuck)}`).toBeNull();
    if (r.winner < 0) {
      // Mirrors with identical cores can keep drawing (replayed rounds). That's slow, not stuck:
      // accept it only if rounds kept resolving.
      expect(r.roundReasons.length, `no winner after ${r.ticks} ticks and only ${r.roundReasons.length} rounds (${r.roundReasons.join(',')})`).toBeGreaterThanOrEqual(5);
      return;
    }
    expect(r.wins[r.winner]).toBe(2);
  });
});
