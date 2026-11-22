/**
 * Netcode soak test: two rollback sessions over the network simulator at several
 * latencies / loss rates, compared with an offline run of the same inputs.
 *
 *   npm run sim:net
 *   npm run sim:net -- --ticks 3600 --delay 2
 *
 * Exits non-zero if any run desyncs or differs from the offline result.
 */
import { initPhysics } from '../src/core/physics';
import { runLoopback } from '../src/net/loopback';
import { RandomInputs } from '../src/bots/random-input';
import { allFighters, getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';
import type { InputFrame } from '../src/core/input-frame';

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const ticks = Math.round(arg('ticks', 1800) / 60) * 60;
const delay = arg('delay', 2);

await initPhysics();
const ids = allFighters().map((f) => f.def.id);
const scenarios = [
  { rtt: 0, loss: 0, jitter: 0 },
  { rtt: 50, loss: 0.02, jitter: 5 },
  { rtt: 100, loss: 0.05, jitter: 10 },
  { rtt: 150, loss: 0.05, jitter: 20 },
  { rtt: 200, loss: 0.05, jitter: 20 },
  { rtt: 200, loss: 0.15, jitter: 40 },
];

let failures = 0;
console.log(`ticks ${ticks}, input delay ${delay}\n`);
console.log('matchup               rtt   loss  jitter  result   rollbacks  max  stalls  KB sent  wall ms');
scenarios.forEach((sc, i) => {
  const a = ids[i % ids.length]!;
  const b = ids[(i + 1) % ids.length]!;
  const gens = [new RandomInputs(100 + i), new RandomInputs(200 + i)];
  const cache: Map<number, InputFrame>[] = [new Map(), new Map()];
  const inputs = (p: number, f: number): InputFrame => {
    const c = cache[p]!;
    while (!c.has(f)) c.set(c.size, gens[p]!.next());
    return c.get(f)!;
  };
  const t0 = Date.now();
  const r = runLoopback({
    match: { fighters: [getFighter(a).def, getFighter(b).def], arena: getArena(), seed: 10 + i },
    conditions: { latencyMs: sc.rtt / 2, jitterMs: sc.jitter, loss: sc.loss },
    inputDelay: delay,
    ticks,
    inputs,
    netSeed: i + 1,
  });
  const ok = !r.desync && r.hashes[0] === r.offlineHash && r.hashes[1] === r.offlineHash;
  if (!ok) failures++;
  console.log(
    `${`${a} v ${b}`.padEnd(20)} ${String(sc.rtt).padStart(4)}  ${(sc.loss * 100).toFixed(0).padStart(4)}%  ${String(sc.jitter).padStart(6)}  ${(ok ? 'OK' : 'FAIL').padEnd(7)}  ${String(r.rollbacks[0] + r.rollbacks[1]).padStart(9)}  ${String(Math.max(...r.maxRollback)).padStart(3)}  ${String(r.stalls[0] + r.stalls[1]).padStart(6)}  ${(r.bytesSent / 1024).toFixed(0).padStart(7)}  ${String(Date.now() - t0).padStart(7)}`,
  );
});
if (failures) {
  console.log(`\n${failures} run(s) FAILED`);
  process.exitCode = 1;
} else console.log('\nAll runs match the offline simulation.');
