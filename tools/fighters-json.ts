/**
 * Converts TypeScript fighter content (fighter.ts, bot.ts, visuals.ts) into the JSON files the
 * fighter editor reads and writes (fighter.json, bot.json, visuals.json), then deletes the .ts.
 *
 *   npm run fighters:json -- <id> [<id> ...]     (or --all)
 */
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../src/editor/json-format';
import { allFighters } from '../src/registry/fighters';

const args = process.argv.slice(2).filter((a) => a !== '--');
const ids = args.includes('--all') ? allFighters().map((f) => f.def.id) : args;
if (!ids.length) {
  console.error('usage: npm run fighters:json -- <id> [<id> ...] | --all');
  process.exit(1);
}
for (const id of ids) {
  const e = allFighters().find((f) => f.def.id === id);
  if (!e) throw new Error(`unknown fighter ${id}`);
  const dir = join('src/content/fighters', e.folder);
  const write = (name: string, value: unknown, ts: string): void => {
    writeFileSync(join(dir, name), formatJson(value));
    if (existsSync(join(dir, ts))) unlinkSync(join(dir, ts));
    console.log(`wrote ${join(dir, name)}`);
  };
  write('fighter.json', e.def, 'fighter.ts');
  if (e.botHints) write('bot.json', e.botHints, 'bot.ts');
  if (Object.keys(e.visuals).length) write('visuals.json', e.visuals, 'visuals.ts');
}
