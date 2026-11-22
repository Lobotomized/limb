/**
 * Auto-discovers abilities: every file in core/abilities/ except this one and ability.ts
 * that exports `ability: Ability`. Sorted by id so every machine processes them identically.
 */
import type { Ability } from './ability';

const modules = import.meta.glob<{ ability?: Ability }>(['./*.ts', '!./ability.ts', '!./registry.ts'], { eager: true });

export function discoverAbilities(): Ability[] {
  const found: Ability[] = [];
  for (const path of Object.keys(modules).sort()) {
    const a = modules[path]?.ability;
    if (a) found.push(a);
  }
  found.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return found;
}
