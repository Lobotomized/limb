/** Arena discovery: every src/content/arenas/<id>/arena.ts, validated and sorted by id. */
import type { ArenaDef, ArenaModule } from '../core/schema/arena-schema';
import { validateArena } from '../core/schema/validate';

const arenaModules = import.meta.glob<ArenaModule>('/src/content/arenas/*/arena.ts', { eager: true });

let cache: ArenaDef[] | null = null;

export function allArenas(): ArenaDef[] {
  if (cache) return cache;
  const out: ArenaDef[] = [];
  const errors: string[] = [];
  for (const path of Object.keys(arenaModules).sort()) {
    const a = arenaModules[path]?.arena;
    if (!a) {
      errors.push(`${path}: must export "arena"`);
      continue;
    }
    errors.push(...validateArena(a));
    out.push(a);
  }
  if (errors.length) throw new Error(`Invalid arenas:\n  ${errors.join('\n  ')}`);
  cache = out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return cache;
}

export function getArena(id = 'default'): ArenaDef {
  const a = allArenas().find((x) => x.id === id);
  if (!a) throw new Error(`Unknown arena "${id}"`);
  return a;
}
