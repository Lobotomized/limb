// Every fighter pair at easy difficulty finishes a bot match within the tick limit, with no
// exceptions and no stuck states (a fighter not moving for 600 ticks while both are alive).
import { describe, expect, it } from 'vitest';
import { runBotMatch } from '../src/bots/runner';
import { allFighters } from '../src/registry/fighters';

const ids = allFighters().map((f) => f.def.id);
const pairs = ids.flatMap((a, i) => ids.slice(i).map((b) => [a, b] as const));
/** 12 minutes of game time: mirrors with frequent draws (replayed rounds) can run long. */
const LIMIT = 60 * 60 * 12;

describe.each(pairs)('easy bots: %s vs %s', (a, b) => {
  it('finish a match without getting stuck', async () => {
    const r = await runBotMatch({ a, b, difficultyA: 'easy', difficultyB: 'easy', seed: 1, maxTicks: LIMIT });
    expect(r.stuck, `stuck: ${JSON.stringify(r.stuck)}`).toBeNull();
    expect(r.winner, `no winner after ${r.ticks} ticks (rounds: ${r.roundReasons.join(',')})`).toBeGreaterThanOrEqual(0);
    expect(r.wins[r.winner]).toBe(2);
  });
});
