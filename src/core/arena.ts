/**
 * Arena building and boundary queries. A rectangular play space centered on the origin;
 * each side is a solid wall (built as a thick static box just outside the bounds) or an
 * open ring-out edge.
 */
import type { ArenaDef } from './schema/arena-schema';
import type { PhysicsWorld } from './physics';
import type { Tuning } from './tuning';

/** Creates the wall colliders. Returns their handles in a fixed order. */
export function buildArena(physics: PhysicsWorld, a: ArenaDef, t: Tuning): number[] {
  const hw = a.width / 2;
  const hh = a.height / 2;
  const th = a.wallThickness;
  const handles: number[] = [];
  const wall = (x: number, y: number, halfW: number, halfH: number): void => {
    handles.push(physics.createWall(x, y, halfW, halfH, t.wallRestitution, t.wallFriction));
  };
  // Horizontal walls span the full width plus corners so wall/ring-out corners are closed.
  if (a.sides.top === 'wall') wall(0, hh + th / 2, hw + th, th / 2);
  if (a.sides.bottom === 'wall') wall(0, -hh - th / 2, hw + th, th / 2);
  if (a.sides.left === 'wall') wall(-hw - th / 2, 0, th / 2, hh + th);
  if (a.sides.right === 'wall') wall(hw + th / 2, 0, th / 2, hh + th);
  for (const o of a.obstacles ?? []) wall(o.x, o.y, o.w / 2, o.h / 2);
  return handles;
}

/** True if a point has crossed one of the open ring-out edges. */
export function crossedRingOut(a: ArenaDef, x: number, y: number): boolean {
  const hw = a.width / 2;
  const hh = a.height / 2;
  return (
    (a.sides.left === 'ringout' && x < -hw) ||
    (a.sides.right === 'ringout' && x > hw) ||
    (a.sides.bottom === 'ringout' && y < -hh) ||
    (a.sides.top === 'ringout' && y > hh)
  );
}

/** True if a point is outside the arena bounds by more than `margin` (used to drop debris). */
export function outsideArena(a: ArenaDef, x: number, y: number, margin = 0.5): boolean {
  return x < -a.width / 2 - margin || x > a.width / 2 + margin || y < -a.height / 2 - margin || y > a.height / 2 + margin;
}

/** Distance from a point to the nearest ring-out edge (Infinity if there is none). */
export function distanceToRingOut(a: ArenaDef, x: number, y: number): number {
  const hw = a.width / 2;
  const hh = a.height / 2;
  let d = Infinity;
  if (a.sides.left === 'ringout') d = Math.min(d, x + hw);
  if (a.sides.right === 'ringout') d = Math.min(d, hw - x);
  if (a.sides.bottom === 'ringout') d = Math.min(d, y + hh);
  if (a.sides.top === 'ringout') d = Math.min(d, hh - y);
  return d;
}
