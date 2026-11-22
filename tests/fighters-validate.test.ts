// One validation test per fighter folder, generated automatically (fighter.json or fighter.ts).
import { describe, expect, it } from 'vitest';
import { validateFighter } from '../src/core/schema/validate';
import type { FighterDef, FighterModule } from '../src/core/schema/fighter-schema';
import { allFighters, mergeSources } from '../src/registry/fighters';

const ts = import.meta.glob<FighterModule>('/src/content/fighters/*/fighter.ts', { eager: true });
const json = import.meta.glob<FighterDef>('/src/content/fighters/*/fighter.json', { eager: true, import: 'default' });
const modules = mergeSources(ts, json, (fighter: FighterDef) => ({ fighter }), 'fighter');

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
  it('a folder with both fighter.ts and fighter.json is rejected', () => {
    const def = Object.values(modules)[0]!.fighter;
    expect(() => mergeSources({ '/src/content/fighters/x/fighter.ts': { fighter: def } }, { '/src/content/fighters/x/fighter.json': def }, (fighter: FighterDef) => ({ fighter }), 'fighter')).toThrow(/keep only one/);
  });
});
