/** Shape helpers for the fighter editor (hit testing, converting between shape kinds). */
import type { ShapeDef } from '../core/schema/fighter-schema';

/** If (lx, ly) in the shape's local frame is inside it, a size measure (smaller wins), else null. */
export function hitSize(shape: ShapeDef, lx: number, ly: number): number | null {
  switch (shape.kind) {
    case 'circle':
      return lx * lx + ly * ly <= shape.radius * shape.radius ? shape.radius * shape.radius : null;
    case 'capsule': {
      const h = Math.max(0, shape.length / 2 - shape.radius);
      const cx = Math.max(-h, Math.min(h, lx));
      return (lx - cx) * (lx - cx) + ly * ly <= shape.radius * shape.radius ? shape.length * shape.radius : null;
    }
    case 'polygon': {
      const pts = shape.points;
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[(i + 1) % pts.length]!;
        if ((bx - ax) * (ly - ay) - (by - ay) * (lx - ax) < 0) return null;
        area += ax * by - bx * ay;
      }
      return Math.abs(area) / 2;
    }
  }
}

/** Converts a part to another shape kind with a similar size. */
export function convertShape(s: ShapeDef, kind: ShapeDef['kind']): ShapeDef {
  if (s.kind === kind) return s;
  const r = s.kind === 'circle' ? s.radius : s.kind === 'capsule' ? s.radius : Math.max(0.05, ...s.points.map(([, y]) => Math.abs(y)));
  const len = s.kind === 'capsule' ? s.length / 2 : s.kind === 'circle' ? s.radius : Math.max(...s.points.map(([x]) => Math.abs(x)));
  if (kind === 'circle') return { kind, radius: Math.max(r, len) };
  if (kind === 'capsule') return { kind, length: Math.max(2 * len, 2 * r + 0.05), radius: r };
  return { kind, points: [[-len, -r], [len, -r], [len, r], [-len, r]] };
}

