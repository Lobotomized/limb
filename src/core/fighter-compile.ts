/**
 * Precomputed index structures for a (validated) fighter definition: id -> index maps,
 * the part tree, resolved move targets. Built once per match, never serialized.
 */
import { MOVE_BUTTONS, type FighterDef, type MoveButton } from './schema/fighter-schema';

export interface CompiledPhase {
  /** Accumulated targets: everything this phase and earlier phases of the move set (later wins). */
  targets: { joint: number; angle: number; speed: number }[];
  ticks: number;
  hold: boolean;
  maxHoldTicks: number | null;
  spin: number | null;
  drive: [number, number] | null;
}

export interface CompiledMove {
  index: number;
  button: MoveButton;
  phases: CompiledPhase[];
  /** Every joint any phase touches. */
  joints: number[];
  /** Sum of the phases' minimum ticks (no holding). */
  totalTicks: number;
  returnSpeed: number;
  requires: number[];
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
  /** moveByButton[button - 1] = move index (-1 if no move uses that button). */
  moveByButton: number[];
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
  const moves: CompiledMove[] = def.moves.map((m, i) => {
    const acc = new Map<number, { joint: number; angle: number; speed: number }>();
    const phases = m.phases.map((p) => {
      for (const t of p.targets) {
        const j = idx(jointIndex, t.joint, 'joint');
        acc.set(j, { joint: j, angle: t.angle, speed: p.speed });
      }
      return {
        targets: [...acc.values()].sort((x, y) => x.joint - y.joint),
        ticks: p.ticks,
        hold: p.hold ?? false,
        maxHoldTicks: p.maxHoldTicks ?? null,
        spin: p.spin ?? null,
        drive: p.drive ? ([p.drive[0], p.drive[1]] as [number, number]) : null,
      };
    });
    return {
      index: i,
      button: m.button,
      phases,
      joints: [...acc.keys()].sort((x, y) => x - y),
      totalTicks: m.phases.reduce((a, p) => a + p.ticks, 0),
      returnSpeed: m.returnSpeed,
      requires: m.requires.map((r) => idx(partIndex, r, 'part')),
    };
  });
  const moveByButton = MOVE_BUTTONS.map((b) => moves.find((m) => m.button === b)?.index ?? -1);
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
    moveByButton,
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
