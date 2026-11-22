// The validator must reject broken definitions with clear messages naming fighter, field and problem.
import { describe, expect, it } from 'vitest';
import { validateFighter, validateArena } from '../src/core/schema/validate';
import type { FighterDef } from '../src/core/schema/fighter-schema';
import { getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';

const base = (): FighterDef => structuredClone(getFighter('humanoid').def);

function expectError(def: FighterDef, ...fragments: string[]): void {
  const errs = validateFighter(def);
  const hit = errs.find((e) => fragments.every((f) => e.includes(f)));
  expect(hit, `expected an error containing ${JSON.stringify(fragments)}; got:\n${errs.join('\n')}`).toBeDefined();
}

describe('validator', () => {
  it('accepts the humanoid', () => expect(validateFighter(base())).toEqual([]));
  it('requires an existing core part', () => {
    const d = base();
    d.corePart = 'nope';
    expectError(d, 'fighter "humanoid"', 'corePart', 'unknown part "nope"');
  });
  it('requires an existing root part', () => {
    const d = base();
    d.rootPart = 'ghost';
    expectError(d, 'rootPart', 'unknown part "ghost"');
  });
  it('rejects joints that reference missing parts', () => {
    const d = base();
    d.joints[1]!.child = 'tentacle';
    expectError(d, 'joints[1].child', 'unknown part "tentacle"');
  });
  it('rejects disconnected parts', () => {
    const d = base();
    d.joints = d.joints.filter((j) => j.id !== 'wrist_l');
    d.moves.forEach((m) => (m.targets = m.targets.filter((t) => t.joint !== 'wrist_l')));
    expectError(d, 'joints', 'part "hand_l" is not connected to the root');
  });
  it('rejects a part with two parents (not a tree)', () => {
    const d = base();
    d.joints.push({ ...d.joints[1]!, id: 'extra', parent: 'head' });
    expectError(d, 'already has a parent joint');
  });
  it('rejects more than 4 slots', () => {
    const d = base();
    d.slots.push({ id: 5, name: 'Fifth', parts: ['head'] });
    expectError(d, 'slots', 'at most 4 slots');
  });
  it('rejects moves with unknown slots, joints or parts', () => {
    const d = base();
    d.moves[0]!.slot = 9;
    d.moves[1]!.targets[0]!.joint = 'knee';
    d.moves[2]!.requires = ['tail'];
    expectError(d, 'moves[0]', 'unknown slot 9');
    expectError(d, 'moves[1]', 'unknown joint "knee"');
    expectError(d, 'moves[2]', 'unknown part "tail"');
  });
  it('rejects out-of-range numbers', () => {
    const d = base();
    d.parts[0]!.mass = -1;
    d.parts[1]!.maxHealth = 1.5;
    d.locomotion.walkSpeed = 999;
    expectError(d, 'parts[0].mass', 'between');
    expectError(d, 'parts[1].maxHealth', 'integer');
    expectError(d, 'locomotion.walkSpeed', 'between');
  });
  it('rejects non-convex polygons and bad capsules', () => {
    const d = base();
    d.parts[0]!.shape = { kind: 'polygon', points: [[0, 0], [1, 0], [0.2, 0.2], [0, 1]] };
    d.parts[2]!.shape = { kind: 'capsule', length: 0.1, radius: 0.1 };
    expectError(d, 'parts[0].shape.points', 'convex');
    expectError(d, 'parts[2].shape.length', 'greater than 2');
  });
  it('rejects move targets outside joint limits', () => {
    const d = base();
    d.moves[0]!.targets[0]!.angle = 3.0;
    expectError(d, 'moves[0]', 'outside joint "shoulder_l" limits');
  });
  it('rejects more than 20 moves', () => {
    const d = base();
    while (d.moves.length <= 20) d.moves.push({ ...d.moves[0]!, slot: 1, direction: 'neutral' });
    expectError(d, 'moves', 'at most 20 moves');
  });
  it('rejects unknown ability fields', () => {
    const d = base();
    d.parts[0]!.abilities = { grapple: { range: 3 } };
    expectError(d, 'parts[0].abilities.grapple', 'no ability "grapple" is registered');
  });
  it('validates arenas', () => {
    expect(validateArena(getArena())).toEqual([]);
    const a = { ...getArena(), width: -3 };
    expect(validateArena(a).some((e) => e.includes('width'))).toBe(true);
  });
});
