// Toughness tiers come from absolute max health, so they compare across fighters.
import { describe, expect, it } from 'vitest';
import { TOUGHNESS, toughnessTier } from '../src/render/theme';
import { allFighters } from '../src/registry/fighters';

describe('toughness tiers', () => {
  it('classifies by max health thresholds', () => {
    expect(toughnessTier(TOUGHNESS.fragileMax)).toBe('fragile');
    expect(toughnessTier(TOUGHNESS.fragileMax + 1)).toBe('medium');
    expect(toughnessTier(TOUGHNESS.toughMin - 1)).toBe('medium');
    expect(toughnessTier(TOUGHNESS.toughMin)).toBe('tough');
  });
  it('every shipped fighter has a tough core-side part and some weaker parts', () => {
    for (const { def } of allFighters()) {
      const tiers = new Set(def.parts.map((p) => toughnessTier(p.maxHealth)));
      expect(tiers.has('tough'), def.id).toBe(true);
      expect(tiers.size, def.id).toBeGreaterThan(1);
    }
  });
});
