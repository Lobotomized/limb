/**
 * Determinism check: runs N random-input matches twice and compares the state hash after
 * every tick; also restores a mid-match snapshot and checks the continuation.
 *
 *   npm run sim:determinism
 *   npm run sim:determinism -- --matches 20 --ticks 3000 --seed 1
 *
 * Exits non-zero on the first divergence (printing match, fighters and tick).
 */
import { initPhysics } from '../src/core/physics';
import { createMatch, step } from '../src/core/simulation';
import { hashState, restoreState, saveState } from '../src/core/state';
import type { InputFrame } from '../src/core/input-frame';
import { RandomInputs } from '../src/bots/random-input';
import { allFighters } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const matches = arg('matches', 20);
const ticks = arg('ticks', 3000);
const seed0 = arg('seed', 1);

await initPhysics();
const fighters = allFighters();
const t0 = Date.now();
let failed = false;

for (let m = 0; m < matches && !failed; m++) {
  const a = fighters[m % fighters.length]!.def;
  const b = fighters[(m * 7 + 1) % fighters.length]!.def;
  const seed = seed0 + m;
  const gens = [new RandomInputs(seed * 2 + 1), new RandomInputs(seed * 2 + 2)];
  const inputs: [InputFrame, InputFrame][] = [];
  for (let t = 0; t < ticks; t++) inputs.push([gens[0]!.next(), gens[1]!.next()]);
  const run = (): string[] => {
    const s = createMatch({ fighters: [a, b], arena: getArena(), seed });
    const hashes = inputs.map((inp) => {
      step(s, inp);
      return hashState(s);
    });
    s.physics.free();
    return hashes;
  };
  const h1 = run();
  const h2 = run();
  const bad = h1.findIndex((h, t) => h !== h2[t]);
  if (bad >= 0) {
    console.log(`DIVERGED: match ${m} (${a.id} vs ${b.id}, seed ${seed}) at tick ${bad}: ${h1[bad]} vs ${h2[bad]}`);
    failed = true;
    break;
  }
  // Save/restore continuation from the middle.
  const s = createMatch({ fighters: [a, b], arena: getArena(), seed });
  const mid = Math.floor(ticks / 2);
  for (let t = 0; t < mid; t++) step(s, inputs[t]!);
  const snap = saveState(s);
  for (let t = mid; t < ticks; t++) step(s, inputs[t]!);
  restoreState(s, snap);
  for (let t = mid; t < ticks; t++) {
    step(s, inputs[t]!);
    if (hashState(s) !== h1[t]) {
      console.log(`RESTORE DIVERGED: match ${m} (${a.id} vs ${b.id}) at tick ${t}`);
      failed = true;
      break;
    }
  }
  s.physics.free();
  if (!failed) console.log(`match ${String(m).padStart(2)} ${`${a.id} vs ${b.id}`.padEnd(20)} ${ticks} ticks ×2 + restore: identical (${h1[ticks - 1]})`);
}
console.log(failed ? '\nDETERMINISM FAILURE' : `\nAll ${matches} matches deterministic (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
if (failed) process.exitCode = 1;
