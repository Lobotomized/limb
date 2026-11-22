/**
 * Headless bot-vs-bot balancing tool.
 *
 *   npm run sim:bots -- --a humanoid --b crab --difficulty hard --matches 50 --seed 1
 *   npm run sim:bots -- --all --difficulty hard --matches 50 --jobs 4
 *
 * Prints win rates, average round length, damage per part type and move usage.
 * Options:
 *   --a, --b          fighter ids (default: all pairings with --all)
 *   --all             every unordered pairing (each match swaps sides on odd seeds)
 *   --difficulty      easy | medium | hard (both bots), or --da / --db separately
 *   --matches N       matches per pairing (default 20)
 *   --seed S          first seed (default 1)
 *   --jobs J          parallel worker processes (default: CPU count)
 *   --max-ticks T     give up on a match after T ticks (default 21600 = 6 min)
 *   --json            print machine-readable JSON instead of tables
 *   --tune k=v,...    override core/tuning.ts values for this run
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runBotMatch, type BotMatchResult } from '../src/bots/runner';
import { allFighters, getFighter } from '../src/registry/fighters';
import type { DifficultyId } from '../src/bots/difficulty';

interface Args {
  a?: string;
  b?: string;
  all: boolean;
  da: DifficultyId;
  db: DifficultyId;
  matches: number;
  seed: number;
  jobs: number;
  maxTicks: number;
  json: boolean;
  tune: Record<string, number>;
  worker: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const diff = (get('difficulty') ?? 'hard') as DifficultyId;
  const tune: Record<string, number> = {};
  for (const kv of (get('tune') ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) tune[k] = Number(v);
  }
  return {
    a: get('a'),
    b: get('b'),
    all: argv.includes('--all') || (!get('a') && !get('b')),
    da: (get('da') ?? diff) as DifficultyId,
    db: (get('db') ?? diff) as DifficultyId,
    matches: Number(get('matches') ?? 20),
    seed: Number(get('seed') ?? 1),
    jobs: Number(get('jobs') ?? Math.max(1, cpus().length)),
    maxTicks: Number(get('max-ticks') ?? 21600),
    json: argv.includes('--json'),
    tune,
    worker: argv.includes('--worker'),
  };
}

interface Job {
  a: string;
  b: string;
  seed: number;
  /** True when sides are swapped (b plays as P1). */
  swapped: boolean;
}

function jobsFor(args: Args): Job[] {
  const ids = allFighters().map((f) => f.def.id);
  const pairs: [string, string][] = [];
  if (args.a && args.b) pairs.push([args.a, args.b]);
  else if (args.a) for (const b of ids) pairs.push([args.a, b]);
  else for (let i = 0; i < ids.length; i++) for (let j = i; j < ids.length; j++) pairs.push([ids[i]!, ids[j]!]);
  const jobs: Job[] = [];
  for (const [a, b] of pairs) for (let m = 0; m < args.matches; m++) jobs.push({ a, b, seed: args.seed + m, swapped: m % 2 === 1 });
  return jobs;
}

async function runJob(j: Job, args: Args): Promise<{ job: Job; r: BotMatchResult }> {
  const r = await runBotMatch({
    a: j.swapped ? j.b : j.a,
    b: j.swapped ? j.a : j.b,
    difficultyA: j.swapped ? args.db : args.da,
    difficultyB: j.swapped ? args.da : args.db,
    seed: j.seed,
    maxTicks: args.maxTicks,
    tuning: args.tune,
  });
  return { job: j, r };
}

/** Worker mode: reads jobs from argv JSON, prints results as JSON lines. */
async function worker(args: Args): Promise<void> {
  const i = process.argv.indexOf('--jobs-json');
  const jobs = JSON.parse(process.argv[i + 1] ?? '[]') as Job[];
  for (const j of jobs) process.stdout.write(JSON.stringify(await runJob(j, args)) + '\n');
}

async function runParallel(all: Job[], args: Args): Promise<{ job: Job; r: BotMatchResult }[]> {
  if (args.jobs <= 1 || all.length <= 1) {
    const out = [];
    for (const j of all) out.push(await runJob(j, args));
    return out;
  }
  const self = fileURLToPath(import.meta.url);
  const chunks: Job[][] = Array.from({ length: Math.min(args.jobs, all.length) }, () => []);
  all.forEach((j, i) => chunks[i % chunks.length]!.push(j));
  const passthrough = process.argv.slice(2).filter((x, i, arr) => x !== '--jobs' && arr[i - 1] !== '--jobs');
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<{ job: Job; r: BotMatchResult }[]>((resolve, reject) => {
          const child = spawn(process.execPath, [require_vite_node(), self, '--', ...passthrough, '--worker', '--jobs-json', JSON.stringify(chunk)], { stdio: ['ignore', 'pipe', 'inherit'] });
          let buf = '';
          child.stdout.on('data', (d: Buffer) => (buf += d.toString()));
          child.on('error', reject);
          child.on('close', (code) => {
            if (code !== 0) return reject(new Error(`worker exited with ${code}`));
            resolve(buf.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as { job: Job; r: BotMatchResult }));
          });
        }),
    ),
  );
  return results.flat();
}

function require_vite_node(): string {
  return fileURLToPath(new URL('../node_modules/vite-node/dist/cli.mjs', import.meta.url));
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function report(results: { job: Job; r: BotMatchResult }[], args: Args): void {
  const byPair = new Map<string, { job: Job; r: BotMatchResult }[]>();
  for (const x of results) {
    const k = `${x.job.a}|${x.job.b}`;
    byPair.set(k, [...(byPair.get(k) ?? []), x]);
  }
  const summary: Record<string, unknown>[] = [];
  const lines: string[] = [];
  lines.push(`Difficulty: P(a)=${args.da} P(b)=${args.db}   matches per pairing: ${args.matches}   seeds ${args.seed}..${args.seed + args.matches - 1}`);
  lines.push('');
  lines.push('Matchup                 a wins  b wins  timeout  draws(rounds)  avg round (s)  ring-outs  stuck');
  for (const [k, xs] of byPair) {
    const [a, b] = k.split('|') as [string, string];
    let aw = 0;
    let bw = 0;
    let to = 0;
    let draws = 0;
    let ringouts = 0;
    let stuck = 0;
    const lens: number[] = [];
    const mirror = a === b;
    for (const { job, r } of xs) {
      // Mirror matches report P1-side vs P2-side wins (side bias); others report fighter a vs b.
      const aIdx = mirror ? 0 : job.swapped ? 1 : 0;
      if (r.winner === -1) to++;
      else if (r.winner === aIdx) aw++;
      else bw++;
      draws += r.roundReasons.filter((x) => x === 'draw').length;
      ringouts += r.roundReasons.filter((x) => x === 'ringout').length;
      if (r.stuck) stuck++;
      lens.push(...r.roundLengths);
    }
    const n = xs.length;
    const avg = lens.length ? lens.reduce((x, y) => x + y, 0) / lens.length / 60 : 0;
    summary.push({ a, b, aWinRate: aw / n, bWinRate: bw / n, timeouts: to, draws, avgRoundSeconds: avg, ringouts, stuck });
    const label = mirror ? `${a} mirror (P1/P2)` : `${a} vs ${b}`;
    lines.push(`${label.padEnd(22)}  ${pct(aw / n).padStart(6)}  ${pct(bw / n).padStart(6)}  ${String(to).padStart(7)}  ${String(draws).padStart(13)}  ${avg.toFixed(1).padStart(13)}  ${String(ringouts).padStart(9)}  ${String(stuck).padStart(5)}`);
  }
  // Damage per part type (tags) and move usage per fighter.
  const dmgByType = new Map<string, Map<string, number>>();
  const moveUse = new Map<string, Map<string, number>>();
  for (const { job, r } of results) {
    const ids = job.swapped ? [job.b, job.a] : [job.a, job.b];
    ids.forEach((id, side) => {
      const def = getFighter(id).def;
      const dm = dmgByType.get(id) ?? new Map<string, number>();
      def.parts.forEach((p, i) => {
        const type = def.corePart === p.id ? 'core' : (p.tags?.find((t) => t === 'armor' || t === 'locomotion') ?? 'limb');
        dm.set(type, (dm.get(type) ?? 0) + (r.takenByPart[side]?.[i] ?? 0));
      });
      dmgByType.set(id, dm);
      const mu = moveUse.get(id) ?? new Map<string, number>();
      def.moves.forEach((m, i) => {
        const key = `${m.name} (${m.button})`;
        mu.set(key, (mu.get(key) ?? 0) + (r.moveUses[side]?.[i] ?? 0));
      });
      moveUse.set(id, mu);
    });
  }
  lines.push('');
  lines.push('Damage taken per part type (total over all matches):');
  for (const [id, m] of dmgByType) lines.push(`  ${id.padEnd(10)} ${[...m].map(([t, v]) => `${t} ${v}`).join('   ')}`);
  lines.push('');
  lines.push('Move usage (total presses):');
  for (const [id, m] of moveUse) lines.push(`  ${id.padEnd(10)} ${[...m].sort((x, y) => y[1] - x[1]).map(([t, v]) => `${t} ${v}`).join(' · ')}`);
  if (args.json) console.log(JSON.stringify({ summary, damageByType: Object.fromEntries([...dmgByType].map(([k, v]) => [k, Object.fromEntries(v)])), moveUse: Object.fromEntries([...moveUse].map(([k, v]) => [k, Object.fromEntries(v)])) }, null, 2));
  else console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.worker) return worker(args);
  const jobs = jobsFor(args);
  const t0 = Date.now();
  const results = await runParallel(jobs, args);
  report(results, args);
  if (!args.json) console.log(`\n${results.length} matches in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const stuck = results.filter((x) => x.r.stuck);
  if (stuck.length) {
    console.log(`STUCK: ${stuck.map((x) => `${x.job.a} vs ${x.job.b} seed ${x.job.seed}`).join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
