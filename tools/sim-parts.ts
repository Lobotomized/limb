/**
 * Per-part damage breakdown for one matchup (hard bots, 4 seeds). Companion to sim:bots:
 * shows which parts take and deal damage, which is what you tune in the fighter files.
 *
 *   npm run sim:parts -- humanoid crab
 */
import { runBotMatch } from '../src/bots/runner';
import { getFighter } from '../src/registry/fighters';
const [a, b] = [process.argv[2]!, process.argv[3]!];
const taken = [new Map<string, number>(), new Map<string, number>()];
const dealt = [new Map<string, number>(), new Map<string, number>()];
let ticks = 0; const reasons: string[] = [];
for (let seed = 1; seed <= 4; seed++) {
  const r = await runBotMatch({ a, b, difficultyA: 'hard', difficultyB: 'hard', seed });
  ticks += r.ticks; reasons.push(`${r.winner}:${r.roundReasons.join(',')}`);
  [a, b].forEach((id, side) => getFighter(id).def.parts.forEach((p, i) => {
    taken[side]!.set(p.id, (taken[side]!.get(p.id) ?? 0) + r.takenByPart[side]![i]!);
    dealt[side]!.set(p.id, (dealt[side]!.get(p.id) ?? 0) + r.dealtByPart[side]![i]!);
  }));
}
console.log(reasons.join(' | '), 'ticks', ticks);
[a, b].forEach((id, side) => {
  console.log(`${id} taken:`, [...taken[side]!].map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`${id} dealt:`, [...dealt[side]!].map(([k, v]) => `${k}=${v}`).join(' '));
});
