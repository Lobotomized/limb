/**
 * Fighter and arena validators. Every error names the fighter, the field and the problem,
 * e.g. `fighter "crab": joints[3].child: unknown part "claw_r"`.
 */
import type { Ability } from '../abilities/ability';
import type { ArenaDef } from './arena-schema';
import { MOVE_BUTTONS, STEERINGS, type FighterDef, type ShapeDef } from './fighter-schema';

const MAX_PHASES = 8;
const MAX_MOVE_TICKS = 300;
const SAFE_ANGLE = 3.09; // joint angles must stay away from ±PI (Rapier measures in (-PI, PI])
const ID_RE = /^[a-z][a-z0-9_-]*$/;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

class Report {
  readonly errors: string[] = [];
  constructor(private readonly who: string) {}
  err(field: string, problem: string): void {
    this.errors.push(`${this.who}: ${field}: ${problem}`);
  }
  range(field: string, v: unknown, lo: number, hi: number, integer = false): void {
    if (!isNum(v)) this.err(field, `must be a finite number (got ${JSON.stringify(v)})`);
    else if (v < lo || v > hi) this.err(field, `must be between ${lo} and ${hi} (got ${v})`);
    else if (integer && !Number.isInteger(v)) this.err(field, `must be an integer (got ${v})`);
  }
}

function validateShape(r: Report, field: string, shape: ShapeDef | undefined): void {
  if (!shape || typeof shape !== 'object') return r.err(field, 'missing shape');
  switch (shape.kind) {
    case 'circle':
      r.range(`${field}.radius`, shape.radius, 0.02, 3);
      return;
    case 'capsule':
      r.range(`${field}.radius`, shape.radius, 0.02, 2);
      r.range(`${field}.length`, shape.length, 0.05, 6);
      if (isNum(shape.length) && isNum(shape.radius) && shape.length <= 2 * shape.radius) r.err(`${field}.length`, `must be greater than 2 × radius (${2 * shape.radius})`);
      return;
    case 'polygon': {
      const pts = shape.points;
      if (!Array.isArray(pts) || pts.length < 3 || pts.length > 16) return r.err(`${field}.points`, 'must have 3 to 16 points');
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1]) || Math.abs(p[0]) > 4 || Math.abs(p[1]) > 4) return r.err(`${field}.points[${i}]`, 'must be [x, y] with |x|,|y| <= 4');
      }
      // Convex and counter-clockwise: every turn must be a strict left turn.
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const c = pts[(i + 2) % pts.length]!;
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cross <= 0) return r.err(`${field}.points`, `must be convex and counter-clockwise (turn at point ${(i + 1) % pts.length} is not a left turn)`);
      }
      return;
    }
    default:
      r.err(`${field}.kind`, `must be "capsule", "circle" or "polygon" (got ${JSON.stringify((shape as { kind?: unknown }).kind)})`);
  }
}

/** Validates a fighter definition. Returns an empty array when valid. */
export function validateFighter(def: FighterDef, abilities: readonly Ability[] = []): string[] {
  const r = new Report(`fighter "${(def as { id?: unknown })?.id ?? '?'}"`);
  if (!def || typeof def !== 'object') {
    r.err('(root)', 'definition must be an object');
    return r.errors;
  }
  if (!isStr(def.id) || !ID_RE.test(def.id)) r.err('id', 'must be lowercase letters, digits, - or _ and start with a letter');
  if (!isStr(def.name)) r.err('name', 'must be a non-empty string');
  if (typeof def.description !== 'string') r.err('description', 'must be a string');

  // ---------------------------------------------------------------- parts
  const parts = Array.isArray(def.parts) ? def.parts : [];
  if (parts.length === 0) r.err('parts', 'must be a non-empty array');
  if (parts.length > 64) r.err('parts', 'at most 64 parts');
  const partIds = new Set<string>();
  parts.forEach((p, i) => {
    const f = `parts[${i}]`;
    if (!isStr(p.id) || !ID_RE.test(p.id)) r.err(`${f}.id`, 'must be a lowercase identifier');
    else if (partIds.has(p.id)) r.err(`${f}.id`, `duplicate part id "${p.id}"`);
    else partIds.add(p.id);
    if (!isStr(p.name)) r.err(`${f}.name`, 'must be a non-empty string (shown in the HUD)');
    validateShape(r, `${f}.shape`, p.shape);
    r.range(`${f}.mass`, p.mass, 0.05, 200);
    r.range(`${f}.maxHealth`, p.maxHealth, 1, 2000, true);
    if (p.tags !== undefined && (!Array.isArray(p.tags) || p.tags.some((t) => !isStr(t)))) r.err(`${f}.tags`, 'must be an array of strings');
  });

  // ---------------------------------------------------------------- root / core
  if (!partIds.has(def.rootPart)) r.err('rootPart', `unknown part "${def.rootPart}"`);
  if (!partIds.has(def.corePart)) r.err('corePart', `unknown part "${def.corePart}" (exactly one core part is required)`);
  const coreTagged = parts.filter((p) => p.tags?.includes('core'));
  if (coreTagged.length > 0) r.err('parts', 'do not tag parts "core"; set corePart (exactly one core part)');

  // ---------------------------------------------------------------- joints
  const joints = Array.isArray(def.joints) ? def.joints : [];
  const jointIds = new Set<string>();
  const jointById = new Map<string, (typeof joints)[number]>();
  const parentOf = new Map<string, string>();
  joints.forEach((j, i) => {
    const f = `joints[${i}]`;
    if (!isStr(j.id) || !ID_RE.test(j.id)) r.err(`${f}.id`, 'must be a lowercase identifier');
    else if (jointIds.has(j.id)) r.err(`${f}.id`, `duplicate joint id "${j.id}"`);
    else {
      jointIds.add(j.id);
      jointById.set(j.id, j);
    }
    if (!partIds.has(j.parent)) r.err(`${f}.parent`, `unknown part "${j.parent}"`);
    if (!partIds.has(j.child)) r.err(`${f}.child`, `unknown part "${j.child}"`);
    if (j.parent === j.child) r.err(`${f}`, 'parent and child must differ');
    if (j.child === def.rootPart) r.err(`${f}.child`, `the root part "${def.rootPart}" cannot be a child`);
    if (parentOf.has(j.child)) r.err(`${f}.child`, `part "${j.child}" already has a parent joint (the part graph must be a tree)`);
    else parentOf.set(j.child, j.parent);
    for (const k of ['anchorParent', 'anchorChild'] as const) {
      const a = j[k];
      if (!Array.isArray(a) || !isNum(a[0]) || !isNum(a[1]) || Math.abs(a[0]) > 5 || Math.abs(a[1]) > 5) r.err(`${f}.${k}`, 'must be [x, y] with |x|,|y| <= 5');
    }
    r.range(`${f}.strength`, j.strength, 0.1, 20000);
    r.range(`${f}.damping`, j.damping, 0, 5000);
    r.range(`${f}.idleAngle`, j.idleAngle, -SAFE_ANGLE, SAFE_ANGLE);
    if (j.limits !== undefined) {
      if (!Array.isArray(j.limits) || !isNum(j.limits[0]) || !isNum(j.limits[1]) || j.limits[0] >= j.limits[1]) r.err(`${f}.limits`, 'must be [min, max] with min < max');
      else {
        r.range(`${f}.limits[0]`, j.limits[0], -SAFE_ANGLE, SAFE_ANGLE);
        r.range(`${f}.limits[1]`, j.limits[1], -SAFE_ANGLE, SAFE_ANGLE);
        if (isNum(j.idleAngle) && (j.idleAngle < j.limits[0] || j.idleAngle > j.limits[1])) r.err(`${f}.idleAngle`, `must be inside limits [${j.limits[0]}, ${j.limits[1]}]`);
      }
    }
  });
  // Tree connected to the root: every non-root part has exactly one parent and reaches the root.
  for (const id of partIds) {
    if (id === def.rootPart) continue;
    if (!parentOf.has(id)) {
      r.err('joints', `part "${id}" is not connected to the root (no joint has it as child)`);
      continue;
    }
    const seen = new Set<string>([id]);
    let cur = id;
    while (cur !== def.rootPart) {
      const p = parentOf.get(cur);
      if (p === undefined) {
        r.err('joints', `part "${id}" is not connected to the root part "${def.rootPart}"`);
        break;
      }
      if (seen.has(p)) {
        r.err('joints', `cycle in the part graph at "${p}"`);
        break;
      }
      seen.add(p);
      cur = p;
    }
  }

  // ---------------------------------------------------------------- moves
  // Exactly six moves: one per move button (1-6).
  const moves = Array.isArray(def.moves) ? def.moves : [];
  const inputs = new Set<number>();
  moves.forEach((m, i) => {
    const f = `moves[${i}] ("${m.name}")`;
    if (!MOVE_BUTTONS.includes(m.button)) r.err(`${f}.button`, `must be one of ${MOVE_BUTTONS.join(', ')}`);
    if ('direction' in m) r.err(`${f}.direction`, 'moves no longer take a direction: each move has its own button (1-6)');
    if (inputs.has(m.button)) r.err(`${f}.button`, `another move already uses button ${m.button}`);
    inputs.add(m.button);
    if (!isStr(m.name)) r.err(`${f}.name`, 'must be a non-empty string');
    if (!isStr(m.description)) r.err(`${f}.description`, 'must be a non-empty string');
    r.range(`${f}.returnSpeed`, m.returnSpeed, 0.1, 100);
    if (!Array.isArray(m.requires)) r.err(`${f}.requires`, 'must be an array of part ids');
    else m.requires.forEach((p, k) => !partIds.has(p) && r.err(`${f}.requires[${k}]`, `unknown part "${p}"`));
    const phases = Array.isArray(m.phases) ? m.phases : [];
    if (phases.length < 1 || phases.length > MAX_PHASES) r.err(`${f}.phases`, `must have 1 to ${MAX_PHASES} phases (got ${phases.length})`);
    let total = 0;
    let anyTarget = false;
    phases.forEach((ph, pi) => {
      const pf = `${f}.phases[${pi}]`;
      if (!Array.isArray(ph.targets)) return r.err(`${pf}.targets`, 'must be an array of joint targets');
      ph.targets.forEach((t, k) => {
        anyTarget = true;
        const j = jointById.get(t.joint);
        if (!j) return r.err(`${pf}.targets[${k}].joint`, `unknown joint "${t.joint}"`);
        r.range(`${pf}.targets[${k}].angle`, t.angle, -SAFE_ANGLE, SAFE_ANGLE);
        if (j.limits && isNum(t.angle) && (t.angle < j.limits[0] || t.angle > j.limits[1])) r.err(`${pf}.targets[${k}].angle`, `${t.angle} is outside joint "${t.joint}" limits [${j.limits[0]}, ${j.limits[1]}]`);
      });
      r.range(`${pf}.speed`, ph.speed, 0.1, 100);
      r.range(`${pf}.ticks`, ph.ticks, 1, 240, true);
      if (isNum(ph.ticks)) total += ph.ticks;
      if (ph.maxHoldTicks !== undefined) {
        if (!ph.hold) r.err(`${pf}.maxHoldTicks`, 'only allowed on a hold phase');
        r.range(`${pf}.maxHoldTicks`, ph.maxHoldTicks, 1, 600, true);
      }
      if (ph.spin !== undefined) r.range(`${pf}.spin`, ph.spin, -40, 40);
      if (ph.drive !== undefined) {
        if (!Array.isArray(ph.drive) || ph.drive.length !== 2) r.err(`${pf}.drive`, 'must be [forward, left] in m/s');
        else ph.drive.forEach((v, k) => r.range(`${pf}.drive[${k}]`, v, -15, 15));
      }
    });
    if (total > MAX_MOVE_TICKS) r.err(`${f}.phases`, `total ticks must be at most ${MAX_MOVE_TICKS} (got ${total})`);
    if (phases.length && !anyTarget && !phases.some((ph) => ph.spin !== undefined || ph.drive !== undefined)) r.err(`${f}.phases`, 'must move something (joint targets, spin or drive)');
  });
  for (const b of MOVE_BUTTONS) if (!inputs.has(b)) r.err('moves', `missing a move for button ${b} (every fighter has exactly ${MOVE_BUTTONS.length} moves)`);
  if (moves.length !== MOVE_BUTTONS.length) r.err('moves', `exactly ${MOVE_BUTTONS.length} moves are required (got ${moves.length})`);

  // ---------------------------------------------------------------- locomotion
  const l = def.locomotion;
  if (!l || typeof l !== 'object') r.err('locomotion', 'missing');
  else {
    r.range('locomotion.walkSpeed', l.walkSpeed, 0.1, 30);
    r.range('locomotion.walkForce', l.walkForce, 1, 50000);
    r.range('locomotion.turnSpeed', l.turnSpeed, 0.1, 50);
    r.range('locomotion.turnTorque', l.turnTorque, 0.1, 50000);
    r.range('locomotion.dashImpulse', l.dashImpulse, 0, 10000);
    if (l.steering !== undefined && !STEERINGS.includes(l.steering)) r.err('locomotion.steering', `must be one of ${STEERINGS.join(', ')}`);
  }

  // ---------------------------------------------------------------- ability fields
  const byId = new Map(abilities.map((a) => [a.id, a] as const));
  parts.forEach((p, i) => {
    for (const key of Object.keys(p.abilities ?? {}).sort()) {
      const a = byId.get(key);
      if (!a) r.err(`parts[${i}].abilities.${key}`, `no ability "${key}" is registered`);
      else if (!a.partFields) r.err(`parts[${i}].abilities.${key}`, `ability "${key}" has no part fields`);
      else for (const e of a.partFields.validate(p.abilities?.[key])) r.err(`parts[${i}].abilities.${key}`, e);
    }
  });
  for (const key of Object.keys(def.abilities ?? {}).sort()) {
    const a = byId.get(key);
    if (!a) r.err(`abilities.${key}`, `no ability "${key}" is registered`);
    else if (!a.fighterFields) r.err(`abilities.${key}`, `ability "${key}" has no fighter fields`);
    else for (const e of a.fighterFields.validate(def.abilities?.[key])) r.err(`abilities.${key}`, e);
  }
  return r.errors;
}

/** Validates an arena definition. */
export function validateArena(a: ArenaDef): string[] {
  const r = new Report(`arena "${a?.id ?? '?'}"`);
  if (!isStr(a.id) || !ID_RE.test(a.id)) r.err('id', 'must be a lowercase identifier');
  if (!isStr(a.name)) r.err('name', 'must be a non-empty string');
  r.range('width', a.width, 4, 100);
  r.range('height', a.height, 4, 100);
  r.range('wallThickness', a.wallThickness, 0.1, 10);
  r.range('cameraMargin', a.cameraMargin, 0, 20);
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    if (a.sides?.[side] !== 'wall' && a.sides?.[side] !== 'ringout') r.err(`sides.${side}`, 'must be "wall" or "ringout"');
  }
  if (!Array.isArray(a.spawns) || a.spawns.length !== 2) r.err('spawns', 'exactly two spawn points are required');
  else
    a.spawns.forEach((s, i) => {
      r.range(`spawns[${i}].x`, s.x, -a.width / 2, a.width / 2);
      r.range(`spawns[${i}].y`, s.y, -a.height / 2, a.height / 2);
      r.range(`spawns[${i}].angle`, s.angle, -SAFE_ANGLE - 0.06, SAFE_ANGLE + 0.06);
    });
  return r.errors;
}
