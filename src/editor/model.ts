/**
 * Fighter editor data model. DOM-free so it can be unit-tested.
 *
 * An EditorDoc is the three content files of one fighter folder. Every structural edit goes
 * through a function here that keeps cross-references consistent (renaming a part updates
 * joints, move requirements and bot hints; renaming a move updates bot hints; deleting a part
 * removes its subtree and everything that pointed at it).
 */
import type { FighterBotHints, FighterDef, FighterVisuals, JointDef, MoveDef, PartDef, ShapeDef } from '../core/schema/fighter-schema';
import { MOVE_BUTTONS, MOVE_DIRECTIONS } from '../core/schema/fighter-schema';
import { formatJson } from './json-format';

export interface EditorDoc {
  /** Folder under src/content/fighters (always equals fighter.id). */
  folder: string;
  fighter: FighterDef;
  bot: FighterBotHints;
  visuals: FighterVisuals;
  /** True until the folder exists on disk (new fighter). */
  isNew: boolean;
}

export type Selection =
  | { kind: 'fighter' }
  | { kind: 'part'; index: number }
  | { kind: 'move'; index: number; phase: number }
  | { kind: 'bot' };

export const ID_RE = /^[a-z][a-z0-9_-]*$/;

export function cloneDoc(d: EditorDoc): EditorDoc {
  return structuredClone(d);
}

// ------------------------------------------------------------------ history

/** Snapshot undo/redo. Fighter docs are small, so whole-document snapshots are fine. */
export class History {
  private past: string[] = [];
  private future: string[] = [];

  constructor(private current: string) {}

  /** Records `next` as the new state (no-op if unchanged). */
  commit(next: EditorDoc): void {
    const s = JSON.stringify(next);
    if (s === this.current) return;
    this.past.push(this.current);
    if (this.past.length > 200) this.past.shift();
    this.current = s;
    this.future = [];
  }

  undo(): EditorDoc | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return JSON.parse(prev) as EditorDoc;
  }

  redo(): EditorDoc | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return JSON.parse(next) as EditorDoc;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

// ------------------------------------------------------------------ files

export function docFiles(d: EditorDoc): Record<string, string> {
  const files: Record<string, string> = { 'fighter.json': formatJson(d.fighter), 'bot.json': formatJson(d.bot) };
  if (Object.keys(d.visuals).length) files['visuals.json'] = formatJson(d.visuals);
  return files;
}

/** Default hints when a fighter has none: every move attacks. */
export function defaultHints(def: FighterDef): FighterBotHints {
  return { attackMoves: def.moves.map((m) => m.name), guardMoves: [], idealDistance: 1.4, shieldParts: [], reach: 1.2 };
}

/** A copy of `src` as a new, unsaved fighter with the given id and name. */
export function newFighterFrom(src: EditorDoc, id: string, name: string): EditorDoc {
  const d = cloneDoc(src);
  d.folder = id;
  d.fighter.id = id;
  d.fighter.name = name;
  d.isNew = true;
  return d;
}

// ------------------------------------------------------------------ lookups

export function partIndex(def: FighterDef, id: string): number {
  return def.parts.findIndex((p) => p.id === id);
}

/** The joint whose child is this part (-1 for the root). */
export function parentJointOf(def: FighterDef, partId: string): number {
  return def.joints.findIndex((j) => j.child === partId);
}

/** The part and every part attached below it. */
export function subtreeIds(def: FighterDef, partId: string): string[] {
  const out = [partId];
  for (let i = 0; i < out.length; i++) for (const j of def.joints) if (j.parent === out[i] && !out.includes(j.child)) out.push(j.child);
  return out;
}

/** Parts in tree order (depth-first from the root) with their depth, for the outline. */
export function partTree(def: FighterDef): { index: number; depth: number }[] {
  const out: { index: number; depth: number }[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const i = partIndex(def, id);
    if (i < 0) return;
    out.push({ index: i, depth });
    for (const j of def.joints) if (j.parent === id) visit(j.child, depth + 1);
  };
  visit(def.rootPart, 0);
  // Parts not connected to the root still show up (the validator explains why they're wrong).
  def.parts.forEach((p, i) => {
    if (!seen.has(p.id)) out.push({ index: i, depth: 0 });
  });
  return out;
}

export function uniqueId(def: FighterDef, base: string, taken: (id: string) => boolean = (id) => partIndex(def, id) >= 0): string {
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}_${n}`)) return `${base}_${n}`;
}

/** Index of the move for an input, or -1. */
export function moveFor(def: FighterDef, button: MoveDef['button'], direction: MoveDef['direction']): number {
  return def.moves.findIndex((m) => m.button === button && m.direction === direction);
}

/** Every input combination in display order (A, B, Back+A, Back+B, Fwd+A, Fwd+B). */
export const MOVE_INPUTS = MOVE_DIRECTIONS.flatMap((direction) => MOVE_BUTTONS.map((button) => ({ button, direction })));

// ------------------------------------------------------------------ edits

export function renamePart(d: EditorDoc, oldId: string, newId: string): string | null {
  const def = d.fighter;
  if (oldId === newId) return null;
  if (!ID_RE.test(newId)) return 'Part ids are lowercase: a-z, 0-9, _ or -, starting with a letter.';
  if (partIndex(def, newId) >= 0) return `A part called "${newId}" already exists.`;
  const p = def.parts[partIndex(def, oldId)];
  if (!p) return `No part "${oldId}".`;
  p.id = newId;
  for (const j of def.joints) {
    if (j.parent === oldId) j.parent = newId;
    if (j.child === oldId) j.child = newId;
  }
  if (def.rootPart === oldId) def.rootPart = newId;
  if (def.corePart === oldId) def.corePart = newId;
  for (const m of def.moves) m.requires = m.requires.map((r) => (r === oldId ? newId : r));
  d.bot.shieldParts = d.bot.shieldParts.map((r) => (r === oldId ? newId : r));
  if (d.visuals.partStyle?.[oldId]) {
    d.visuals.partStyle[newId] = d.visuals.partStyle[oldId]!;
    delete d.visuals.partStyle[oldId];
  }
  return null;
}

export function renameJoint(d: EditorDoc, oldId: string, newId: string): string | null {
  const def = d.fighter;
  if (oldId === newId) return null;
  if (!ID_RE.test(newId)) return 'Joint ids are lowercase: a-z, 0-9, _ or -, starting with a letter.';
  if (def.joints.some((j) => j.id === newId)) return `A joint called "${newId}" already exists.`;
  const j = def.joints.find((x) => x.id === oldId);
  if (!j) return `No joint "${oldId}".`;
  j.id = newId;
  for (const m of def.moves) for (const ph of m.phases) for (const t of ph.targets) if (t.joint === oldId) t.joint = newId;
  return null;
}

export function renameMove(d: EditorDoc, index: number, name: string): string | null {
  const m = d.fighter.moves[index];
  if (!m) return 'No such move.';
  if (!name.trim()) return 'Moves need a name.';
  const old = m.name;
  m.name = name;
  // Bot hints refer to moves by name; keep them pointing at the same move.
  const others = d.fighter.moves.some((x, i) => i !== index && x.name === old);
  if (!others) {
    d.bot.attackMoves = d.bot.attackMoves.map((n) => (n === old ? name : n));
    d.bot.guardMoves = d.bot.guardMoves.map((n) => (n === old ? name : n));
  }
  return null;
}

/** Adds a capsule limb hanging off `parentId` (at the parent's front edge). Returns its index. */
export function addPart(d: EditorDoc, parentId: string): number {
  const def = d.fighter;
  const parent = def.parts[partIndex(def, parentId)];
  if (!parent) throw new Error(`No part "${parentId}"`);
  const id = uniqueId(def, `${parentId}_limb`);
  const reach = parent.shape.kind === 'circle' ? parent.shape.radius : parent.shape.kind === 'capsule' ? parent.shape.length / 2 - parent.shape.radius * 0.5 : Math.max(...parent.shape.points.map((p) => p[0]));
  const part: PartDef = { id, name: 'New limb', shape: { kind: 'capsule', length: 0.4, radius: 0.07 }, mass: 0.8, maxHealth: 60 };
  def.parts.push(part);
  def.joints.push({
    id: uniqueId(def, `j_${id}`, (x) => def.joints.some((j) => j.id === x)),
    parent: parentId,
    child: id,
    anchorParent: [round(reach), 0],
    anchorChild: [-0.15, 0],
    limits: [-1.5, 1.5],
    strength: 60,
    damping: 4,
    idleAngle: 0,
  });
  return def.parts.length - 1;
}

/** Makes this part the fighter's core (the part whose death loses the round). */
export function setCorePart(d: EditorDoc, partId: string): string | null {
  if (partIndex(d.fighter, partId) < 0) return `No part "${partId}".`;
  d.fighter.corePart = partId;
  return null;
}

/** Removes a part, everything attached below it, and every reference to them. */
export function deletePart(d: EditorDoc, partId: string): string | null {
  const def = d.fighter;
  if (partId === def.rootPart) return 'The root part holds everything together; it cannot be deleted.';
  const gone = new Set(subtreeIds(def, partId));
  if (gone.has(def.corePart)) return 'That would delete the core part. Pick another core first.';
  const goneJoints = new Set(def.joints.filter((j) => gone.has(j.child)).map((j) => j.id));
  def.parts = def.parts.filter((p) => !gone.has(p.id));
  def.joints = def.joints.filter((j) => !goneJoints.has(j.id));
  for (const m of def.moves) {
    m.requires = m.requires.filter((r) => !gone.has(r));
    for (const ph of m.phases) ph.targets = ph.targets.filter((t) => !goneJoints.has(t.joint));
  }
  d.bot.shieldParts = d.bot.shieldParts.filter((r) => !gone.has(r));
  if (d.visuals.partStyle) for (const id of gone) delete d.visuals.partStyle[id];
  return null;
}

const round = (v: number): number => Math.round(v * 10000) / 10000;

/** Left/right counterpart of an id or name: _l ↔ _r, Left ↔ Right (null if it has no side). */
export function mirrorName(s: string): string | null {
  const swaps: [RegExp, (m: string) => string][] = [
    [/_l(?=$|_|\d)/, () => '_r'],
    [/_r(?=$|_|\d)/, () => '_l'],
    [/\bLeft\b/, () => 'Right'],
    [/\bRight\b/, () => 'Left'],
    [/\bleft\b/, () => 'right'],
    [/\bright\b/, () => 'left'],
  ];
  for (const [re, f] of swaps) if (re.test(s)) return s.replace(re, f);
  return null;
}

function mirrorShape(s: ShapeDef): ShapeDef {
  if (s.kind !== 'polygon') return structuredClone(s);
  // Mirror across local x and reverse the order so the polygon stays counter-clockwise.
  return { kind: 'polygon', points: s.points.map(([x, y]) => [x, round(-y)] as [number, number]).reverse() };
}

/**
 * Copies a part and everything below it to the other side of the fighter (mirrored across the
 * fighter's forward axis): shapes, anchors, idle angles and limits are flipped, and names get
 * Left/Right (or _l/_r) swapped. Moves are not copied. Returns the new part's index or an error.
 */
export function mirrorPart(d: EditorDoc, partId: string): number | string {
  const def = d.fighter;
  if (partId === def.rootPart) return 'Mirror a limb, not the root part.';
  const ids = subtreeIds(def, partId);
  const map = new Map<string, string>();
  const taken = (id: string): boolean => partIndex(def, id) >= 0 || [...map.values()].includes(id);
  for (const id of ids) map.set(id, uniqueId(def, mirrorName(id) ?? `${id}_m`, taken));
  const newParts: PartDef[] = ids.map((id) => {
    const p = def.parts[partIndex(def, id)]!;
    return { ...structuredClone(p), id: map.get(id)!, name: mirrorName(p.name) ?? `${p.name} (mirror)`, shape: mirrorShape(p.shape) };
  });
  const jointIds = new Set(def.joints.map((j) => j.id));
  const newJoints: JointDef[] = def.joints
    .filter((j) => map.has(j.child))
    .map((j) => {
      const id = uniqueId(def, mirrorName(j.id) ?? `${j.id}_m`, (x) => jointIds.has(x));
      jointIds.add(id);
      return {
        ...structuredClone(j),
        id,
        parent: map.get(j.parent) ?? j.parent,
        child: map.get(j.child)!,
        anchorParent: [j.anchorParent[0], round(-j.anchorParent[1])] as [number, number],
        anchorChild: [j.anchorChild[0], round(-j.anchorChild[1])] as [number, number],
        idleAngle: round(-j.idleAngle),
        ...(j.limits ? { limits: [round(-j.limits[1]), round(-j.limits[0])] as [number, number] } : {}),
      };
    });
  def.parts.push(...newParts);
  def.joints.push(...newJoints);
  return def.parts.length - newParts.length;
}

/** Joints that have a parent and child part (any joint can be a move target). */
export function jointIds(def: FighterDef): string[] {
  return def.joints.map((j) => j.id);
}

/** Validator messages name fields like `parts[3]` or `moves[1] ("Jab").phases[0]`; map them to a selection. */
export function selectionForError(def: FighterDef, msg: string): Selection | null {
  const part = /: parts\[(\d+)\]/.exec(msg);
  if (part) return { kind: 'part', index: Number(part[1]) };
  const joint = /: joints\[(\d+)\]/.exec(msg);
  if (joint) {
    const j = def.joints[Number(joint[1])];
    const pi = j ? partIndex(def, j.child) : -1;
    return pi >= 0 ? { kind: 'part', index: pi } : null;
  }
  const move = /: moves\[(\d+)\][^.]*(?:\.phases\[(\d+)\])?/.exec(msg);
  if (move) return { kind: 'move', index: Number(move[1]), phase: move[2] ? Number(move[2]) : 0 };
  if (/: moves:/.test(msg)) return { kind: 'move', index: 0, phase: 0 };
  return { kind: 'fighter' };
}

/** Bot-hint problems the validator doesn't know about (names that no longer exist). */
export function hintWarnings(d: EditorDoc): string[] {
  const names = new Set(d.fighter.moves.map((m) => m.name));
  const parts = new Set(d.fighter.parts.map((p) => p.id));
  const out: string[] = [];
  for (const n of [...d.bot.attackMoves, ...d.bot.guardMoves]) if (!names.has(n)) out.push(`bot hints: no move named "${n}"`);
  for (const p of d.bot.shieldParts) if (!parts.has(p)) out.push(`bot hints: no part "${p}" to shield with`);
  return out;
}

/**
 * Validation problems that make the live preview unsafe to rebuild (the body itself is broken:
 * parts, shapes, joints, root/core). Problems only in moves, names or descriptions don't stop the
 * fighter from simulating, so the preview keeps following the edits.
 */
export function previewBlockers(errors: string[]): string[] {
  return errors.filter((e) => !/^fighter "[^"]*": (moves[[:]|name:|description:|id:)/.test(e));
}
