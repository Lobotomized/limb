// Fighter editor: data model edits keep references consistent, files round-trip, saves are safe.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFighter } from '../src/core/schema/validate';
import { convertShape, hitSize } from '../src/editor/geometry';
import { formatJson } from '../src/editor/json-format';
import { addPart, deletePart, docFiles, hintWarnings, History, mirrorName, mirrorPart, newFighterFrom, renameJoint, renameMove, renamePart, selectionForError, type EditorDoc } from '../src/editor/model';
import { getFighter } from '../src/registry/fighters';
import { planSave } from '../tools/vite-editor-plugin';

const doc = (id = 'humanoid'): EditorDoc => {
  const e = getFighter(id);
  return { folder: e.folder, fighter: structuredClone(e.def), bot: structuredClone(e.botHints!), visuals: structuredClone(e.visuals), isNew: false };
};
const valid = (d: EditorDoc): string[] => validateFighter(d.fighter);

describe('json format', () => {
  it('round-trips every fighter exactly and is stable', () => {
    for (const id of ['humanoid', 'crab', 'octopus']) {
      const d = doc(id);
      const text = formatJson(d.fighter);
      expect(JSON.parse(text)).toEqual(d.fighter);
      expect(formatJson(JSON.parse(text))).toBe(text);
    }
  });
  it('rounds float noise and drops -0', () => {
    expect(formatJson({ a: 0.1 + 0.2, b: -0.00001 })).toBe('{"a": 0.3, "b": 0}\n');
  });
});

describe('editor model', () => {
  it('renaming a part updates joints, root/core, move requirements and bot hints', () => {
    const d = doc();
    expect(renamePart(d, 'forearm_l', 'arm_low_l')).toBeNull();
    expect(d.fighter.joints.some((j) => j.child === 'arm_low_l')).toBe(true);
    expect(d.fighter.moves.some((m) => m.requires.includes('arm_low_l'))).toBe(true);
    expect(d.bot.shieldParts).toContain('arm_low_l');
    expect(renamePart(d, 'head', 'brain')).toBeNull();
    expect(d.fighter.corePart).toBe('brain');
    expect(renamePart(d, 'torso', 'brain')).toMatch(/already exists/);
    expect(renamePart(d, 'torso', 'Bad Id')).toMatch(/lowercase/);
    expect(valid(d)).toEqual([]);
  });

  it('renaming a joint updates move targets; renaming a move updates bot hints', () => {
    const d = doc();
    expect(renameJoint(d, 'shoulder_r', 'sh_r')).toBeNull();
    expect(d.fighter.moves.flatMap((m) => m.phases.flatMap((p) => p.targets.map((t) => t.joint)))).toContain('sh_r');
    const hay = d.fighter.moves.findIndex((m) => m.name === 'Haymaker');
    expect(renameMove(d, hay, 'Big swing')).toBeNull();
    expect(d.bot.attackMoves).toContain('Big swing');
    expect(hintWarnings(d)).toEqual([]);
    expect(valid(d)).toEqual([]);
  });

  it('adds, mirrors and deletes limbs, cleaning up every reference', () => {
    const d = doc();
    const ni = addPart(d, 'hand_l');
    expect(valid(d)).toEqual([]);
    const id = d.fighter.parts[ni]!.id;
    const mi = mirrorPart(d, 'upper_arm_l');
    // humanoid already has upper_arm_r, so the copy gets a fresh id
    expect(typeof mi).toBe('number');
    expect(valid(d)).toEqual([]);
    const shoulders = d.fighter.joints.filter((j) => j.parent === 'torso' && j.anchorParent[1] < 0).length;
    expect(shoulders).toBeGreaterThan(2);
    expect(deletePart(d, 'upper_arm_l')).toBeNull();
    expect(d.fighter.parts.some((p) => p.id === id || p.id === 'hand_l')).toBe(false);
    expect(d.fighter.moves.every((m) => m.phases.every((p) => p.targets.every((t) => d.fighter.joints.some((j) => j.id === t.joint))))).toBe(true);
    expect(d.bot.shieldParts).not.toContain('forearm_l');
    expect(deletePart(d, 'torso')).toMatch(/root/);
    expect(deletePart(d, 'head')).toMatch(/core/);
  });

  it('mirrors geometry across the forward axis with swapped names', () => {
    const d = doc();
    deletePart(d, 'upper_arm_r');
    const r = mirrorPart(d, 'upper_arm_l');
    expect(typeof r).toBe('number');
    const j = d.fighter.joints.find((x) => x.child === 'upper_arm_r')!;
    const src = d.fighter.joints.find((x) => x.child === 'upper_arm_l')!;
    expect(j.id).toBe('shoulder_r');
    expect(j.anchorParent).toEqual([src.anchorParent[0], -src.anchorParent[1]]);
    expect(j.idleAngle).toBe(-src.idleAngle);
    expect(j.limits).toEqual([-src.limits![1], -src.limits![0]]);
    expect(d.fighter.parts.find((p) => p.id === 'hand_r')!.name).toBe('Right hand');
    expect(mirrorName('Left leg 1')).toBe('Right leg 1');
    expect(mirrorName('t0_base')).toBeNull();
  });

  it('mirrored polygons stay convex and counter-clockwise', () => {
    const d = doc('crab');
    const r = mirrorPart(d, 'shell_left');
    expect(typeof r).toBe('number');
    expect(validateFighter(d.fighter).filter((e) => e.includes('convex'))).toEqual([]);
  });

  it('undo/redo restores snapshots', () => {
    const d = doc();
    const h = new History(JSON.stringify(d));
    d.fighter.name = 'A';
    h.commit(d);
    d.fighter.name = 'B';
    h.commit(d);
    expect(h.undo()!.fighter.name).toBe('A');
    expect(h.undo()!.fighter.name).toBe('Humanoid');
    expect(h.undo()).toBeNull();
    expect(h.redo()!.fighter.name).toBe('A');
  });

  it('new fighters copy a template; validation errors map to selections', () => {
    const d = newFighterFrom(doc(), 'golem', 'Golem');
    expect(d.folder).toBe('golem');
    expect(d.isNew).toBe(true);
    expect(valid(d)).toEqual([]);
    d.fighter.moves[2]!.phases[1]!.ticks = 0;
    const err = valid(d).find((e) => e.includes('ticks'))!;
    expect(selectionForError(d.fighter, err)).toEqual({ kind: 'move', index: 2, phase: 1 });
    d.fighter.parts[3]!.mass = -1;
    expect(selectionForError(d.fighter, valid(d).find((e) => e.includes('mass'))!)).toEqual({ kind: 'part', index: 3 });
    expect(Object.keys(docFiles(d)).sort()).toEqual(['bot.json', 'fighter.json', 'visuals.json']);
  });
});

describe('editor geometry', () => {
  it('hit-tests circles, capsules and polygons in local space', () => {
    expect(hitSize({ kind: 'circle', radius: 0.2 }, 0.1, 0.1)).not.toBeNull();
    expect(hitSize({ kind: 'circle', radius: 0.2 }, 0.2, 0.2)).toBeNull();
    expect(hitSize({ kind: 'capsule', length: 1, radius: 0.1 }, 0.45, 0)).not.toBeNull();
    expect(hitSize({ kind: 'capsule', length: 1, radius: 0.1 }, 0, 0.2)).toBeNull();
    const sq = { kind: 'polygon' as const, points: [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][] };
    expect(hitSize(sq, 0.5, 0.5)).toBe(4);
    expect(hitSize(sq, 1.5, 0)).toBeNull();
  });
  it('converts shapes to valid shapes of a similar size', () => {
    const d = doc();
    const p = d.fighter.parts.find((x) => x.id === 'forearm_l')!;
    for (const k of ['circle', 'polygon', 'capsule'] as const) {
      p.shape = convertShape(p.shape, k);
      expect(p.shape.kind).toBe(k);
      expect(valid(d)).toEqual([]);
    }
  });
});

describe('editor save endpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'lc-editor-'));
  const files = { 'fighter.json': '{}\n' };
  it('accepts the three content files in a valid folder', () => {
    const r = planSave(root, { folder: 'golem', files: { ...files, 'bot.json': '{}', 'visuals.json': '{}' } });
    expect('writes' in r && r.writes.map(([p]) => p.replace(/\\/g, '/').split('/').slice(-3).join('/'))).toEqual(['fighters/golem/fighter.json', 'fighters/golem/bot.json', 'fighters/golem/visuals.json']);
  });
  it('rejects bad folders, other files, invalid JSON and .ts conflicts', () => {
    expect(planSave(root, { folder: '../evil', files })).toHaveProperty('error');
    expect(planSave(root, { folder: 'Golem', files })).toHaveProperty('error');
    expect(planSave(root, { folder: 'golem', files: { '../../x.json': '{}' } })).toHaveProperty('error');
    expect(planSave(root, { folder: 'golem', files: { 'fighter.ts': '{}' } })).toHaveProperty('error');
    expect(planSave(root, { folder: 'golem', files: { 'fighter.json': '{nope' } })).toHaveProperty('error');
    expect(planSave(root, { folder: 'golem', files: {} })).toHaveProperty('error');
    expect(planSave(root, null)).toHaveProperty('error');
    mkdirSync(join(root, 'src/content/fighters/handmade'), { recursive: true });
    writeFileSync(join(root, 'src/content/fighters/handmade/fighter.ts'), '');
    expect(planSave(root, { folder: 'handmade', files })).toMatchObject({ error: expect.stringMatching(/fighters:json/) });
  });
});
