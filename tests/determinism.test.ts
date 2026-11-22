// Full-game determinism: 20 matches x 3000 ticks with seeded random inputs, run twice,
// identical hashes every tick; save/restore mid-match continues identically.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, newMatch } from './helpers';
import { step } from '../src/core/simulation';
import { hashState, restoreState, saveState } from '../src/core/state';
import { RandomInputs } from '../src/bots/random-input';
import { allFighters } from '../src/registry/fighters';
import type { InputFrame } from '../src/core/input-frame';

beforeAll(setup);

const MATCHES = 20;
const TICKS = 3000;

function runMatch(seed: number, a: string, b: string): string[] {
  const s = newMatch({ a, b, seed, skipCountdown: false });
  const i0 = new RandomInputs(seed * 2 + 1);
  const i1 = new RandomInputs(seed * 2 + 2);
  const hashes: string[] = [];
  for (let t = 0; t < TICKS; t++) {
    step(s, [i0.next(), i1.next()]);
    hashes.push(hashState(s));
  }
  s.physics.free();
  return hashes;
}

describe('determinism', () => {
  const ids = allFighters().map((f) => f.def.id);
  it(`${MATCHES} random-input matches of ${TICKS} ticks hash identically twice`, () => {
    for (let m = 0; m < MATCHES; m++) {
      const a = ids[m % ids.length]!;
      const b = ids[(m * 7 + 1) % ids.length]!;
      const first = runMatch(m + 1, a, b);
      const second = runMatch(m + 1, a, b);
      for (let t = 0; t < TICKS; t++) {
        if (first[t] !== second[t]) throw new Error(`match ${m} (${a} vs ${b}) diverged at tick ${t}`);
      }
    }
  });

  it('save/restore mid-match gives an identical continuation', () => {
    const s = newMatch({ a: ids[0], b: ids[ids.length - 1], seed: 99, skipCountdown: false });
    const gen = [new RandomInputs(5), new RandomInputs(6)];
    const inputs: [InputFrame, InputFrame][] = [];
    for (let t = 0; t < 2400; t++) inputs.push([gen[0]!.next(), gen[1]!.next()]);
    for (let t = 0; t < 1200; t++) step(s, inputs[t]!);
    const snap = saveState(s);
    const ref: string[] = [];
    for (let t = 1200; t < 2400; t++) {
      step(s, inputs[t]!);
      ref.push(hashState(s));
    }
    restoreState(s, snap);
    expect(s.game.tick).toBe(1200);
    for (let t = 1200; t < 2400; t++) {
      step(s, inputs[t]!);
      expect(hashState(s)).toBe(ref[t - 1200]);
    }
    // Full hash (including the raw Rapier snapshot) also agrees after restoring again.
    restoreState(s, snap);
    const full1 = hashState(s, true);
    restoreState(s, snap);
    expect(hashState(s, true)).toBe(full1);
  });
});
