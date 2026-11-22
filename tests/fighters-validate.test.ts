// One validation test per fighter folder, generated automatically.
import { describe, expect, it } from 'vitest';
import { validateFighter } from '../src/core/schema/validate';
import type { FighterModule } from '../src/core/schema/fighter-schema';
import { allFighters } from '../src/registry/fighters';

const modules = import.meta.glob<FighterModule>('/src/content/fighters/*/fighter.ts', { eager: true });

describe('every fighter validates', () => {
  for (const path of Object.keys(modules).sort()) {
    it(path, () => {
      const def = modules[path]!.fighter;
      expect(validateFighter(def)).toEqual([]);
      expect(path.includes(`/${def.id}/`)).toBe(true);
    });
  }
  it('registry returns fighters sorted by id', () => {
    const ids = allFighters().map((f) => f.def.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids.length).toBe(Object.keys(modules).length);
  });
});
