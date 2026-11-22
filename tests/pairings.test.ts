// Every fighter pairing runs a long headless match with random inputs without exceptions,
// and the state stays sane (no NaN poses, health within bounds).
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, newMatch } from './helpers';
import { step } from '../src/core/simulation';
import { RandomInputs } from '../src/bots/random-input';
import { allFighters } from '../src/registry/fighters';

beforeAll(setup);

const ids = allFighters().map((f) => f.def.id);
const pairs = ids.flatMap((a) => ids.map((b) => [a, b] as const));

describe.each(pairs)('%s vs %s (random inputs)', (a, b) => {
  it('runs 6000 ticks cleanly', () => {
    const s = newMatch({ a, b, seed: a.length * 31 + b.length, skipCountdown: false });
    const r = [new RandomInputs(a.length + 100), new RandomInputs(b.length + 200)];
    for (let t = 0; t < 6000 && s.game.phase !== 'matchOver'; t++) {
      step(s, [r[0]!.next(), r[1]!.next()]);
      if (t % 100 === 0) {
        for (const f of s.game.fighters) {
          f.parts.forEach((p, i) => {
            expect(p.health).toBeGreaterThanOrEqual(0);
            expect(p.health).toBeLessThanOrEqual(s.ctx.defs[f.index]!.parts[i]!.maxHealth);
            if (p.body >= 0) {
              const pose = s.physics.pose(p.body);
              expect(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.angle)).toBe(true);
            }
          });
        }
      }
    }
    s.physics.free();
  });
});
