/**
 * Precomputed index structures for a (validated) fighter definition: id -> index maps,
 * the part tree, resolved move targets. Built once per match, never serialized.
 */
import type { FighterDef, MoveDirection } from './schema/fighter-schema';

export interface CompiledMove {
  index: number;
  slot: number;
  direction: MoveDirection;
  targets: { joint: number; angle: number }[];
  speed: number;
  returnSpeed: number;
  requires: number[];
  spin: number | null;
}

export interface CompiledFighter {
  def: FighterDef;
  partIndex: Map<string, number>;
  jointIndex: Map<string, number>;
  root: number;
  core: number;
  /** For each part, the joint connecting it to its parent (-1 for the root). */
  parentJoint: number[];
  /** For each part, its parent part index (-1 for the root). */
  parentPart: number[];
  /** For each part, its child part indices. */
  children: number[][];
  /** Parts in breadth-first order from the root. */
  bfsOrder: number[];
  jointParent: number[];
  jointChild: number[];
  moves: CompiledMove[];
  /** moveBySlotDir[slotId][direction] = move index or -1. */
  moveBySlotDir: Map<number, Map<MoveDirection, number>>;
  locomotionParts: number[];
  totalMass: number;
  totalHealth: number;
}

export function compileFighter(def: FighterDef): CompiledFighter {
  const partIndex = new Map(def.parts.map((p, i) => [p.id, i] as const));
  const jointIndex = new Map(def.joints.map((j, i) => [j.id, i] as const));
  const idx = (m: Map<string, number>, id: string, what: string): number => {
    const v = m.get(id);
    if (v === undefined) throw new Error(`[${def.id}] unknown ${what} "${id}" (run the validator)`);
    return v;
  };
  const n = def.parts.length;
  const parentJoint = new Array<number>(n).fill(-1);
  const parentPart = new Array<number>(n).fill(-1);
  const children: number[][] = def.parts.map(() => []);
  const jointParent: number[] = [];
  const jointChild: number[] = [];
  def.joints.forEach((j, ji) => {
    const p = idx(partIndex, j.parent, 'part');
    const c = idx(partIndex, j.child, 'part');
    parentJoint[c] = ji;
    parentPart[c] = p;
    children[p]?.push(c);
    jointParent.push(p);
    jointChild.push(c);
  });
  const root = idx(partIndex, def.rootPart, 'part');
  const core = idx(partIndex, def.corePart, 'part');
  const bfsOrder: number[] = [];
  const queue = [root];
  while (queue.length) {
    const p = queue.shift() as number;
    bfsOrder.push(p);
    for (const c of children[p] ?? []) queue.push(c);
  }
  const moves: CompiledMove[] = def.moves.map((m, i) => ({
    index: i,
    slot: m.slot,
    direction: m.direction,
    targets: m.targets.map((t) => ({ joint: idx(jointIndex, t.joint, 'joint'), angle: t.angle })),
    speed: m.speed,
    returnSpeed: m.returnSpeed,
    requires: m.requires.map((r) => idx(partIndex, r, 'part')),
    spin: m.spin ?? null,
  }));
  const moveBySlotDir = new Map<number, Map<MoveDirection, number>>();
  for (const m of moves) {
    let byDir = moveBySlotDir.get(m.slot);
    if (!byDir) moveBySlotDir.set(m.slot, (byDir = new Map()));
    if (!byDir.has(m.direction)) byDir.set(m.direction, m.index);
  }
  const locomotionParts = def.parts.flatMap((p, i) => (p.tags?.includes('locomotion') ? [i] : []));
  return {
    def,
    partIndex,
    jointIndex,
    root,
    core,
    parentJoint,
    parentPart,
    children,
    bfsOrder,
    jointParent,
    jointChild,
    moves,
    moveBySlotDir,
    locomotionParts,
    totalMass: def.parts.reduce((a, p) => a + p.mass, 0),
    totalHealth: def.parts.reduce((a, p) => a + p.maxHealth, 0),
  };
}

/** All parts in the subtree rooted at `part` (including it), parent before child. */
export function subtree(cf: CompiledFighter, part: number): number[] {
  const out: number[] = [];
  const stack = [part];
  while (stack.length) {
    const p = stack.shift() as number;
    out.push(p);
    for (const c of cf.children[p] ?? []) stack.push(c);
  }
  return out;
}
