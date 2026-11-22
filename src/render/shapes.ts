/** Drawing physics shapes in screen space (what you see is exactly what collides). */
import type { Graphics } from 'pixi.js';
import type { ShapeDef } from '../core/schema/fighter-schema';
import type { Camera } from './camera';

/** Adds the outline path of a shape at a world pose to `g` (call fill/stroke afterwards). */
export function shapePath(g: Graphics, cam: Camera, shape: ShapeDef, x: number, y: number, angle: number, inflatePx = 0): void {
  const cx = cam.sx(x);
  const cy = cam.sy(y);
  const th = -angle; // screen angles are clockwise
  const c = Math.cos(th);
  const s = Math.sin(th);
  switch (shape.kind) {
    case 'circle':
      g.circle(cx, cy, cam.px(shape.radius) + inflatePx);
      return;
    case 'capsule': {
      const r = cam.px(shape.radius) + inflatePx;
      const h = cam.px(Math.max(0.001, shape.length / 2 - shape.radius));
      const x1 = cx - c * h;
      const y1 = cy - s * h;
      const x2 = cx + c * h;
      const y2 = cy + s * h;
      g.moveTo(x2 + Math.cos(th - Math.PI / 2) * r, y2 + Math.sin(th - Math.PI / 2) * r);
      g.arc(x2, y2, r, th - Math.PI / 2, th + Math.PI / 2);
      g.arc(x1, y1, r, th + Math.PI / 2, th + (3 * Math.PI) / 2);
      g.closePath();
      return;
    }
    case 'polygon': {
      const pts: number[] = [];
      // Inflate by pushing points away from the centroid.
      let mx = 0;
      let my = 0;
      for (const [px, py] of shape.points) {
        mx += px;
        my += py;
      }
      mx /= shape.points.length;
      my /= shape.points.length;
      for (const [px, py] of shape.points) {
        let lx = cam.px(px);
        let ly = -cam.px(py);
        if (inflatePx) {
          const dx = lx - cam.px(mx);
          const dy = ly + cam.px(my);
          const l = Math.hypot(dx, dy) || 1;
          lx += (dx / l) * inflatePx;
          ly += (dy / l) * inflatePx;
        }
        pts.push(cx + lx * c - ly * s, cy + lx * s + ly * c);
      }
      g.poly(pts, true);
      return;
    }
  }
}

/** Rough bounding radius of a shape (m). */
export function shapeRadius(shape: ShapeDef): number {
  switch (shape.kind) {
    case 'circle':
      return shape.radius;
    case 'capsule':
      return shape.length / 2;
    case 'polygon':
      return Math.max(...shape.points.map(([x, y]) => Math.hypot(x, y)));
  }
}

/** Local-space extent of a shape for placing cracks: half-length along x and half-width along y. */
export function shapeExtent(shape: ShapeDef): { hx: number; hy: number } {
  switch (shape.kind) {
    case 'circle':
      return { hx: shape.radius * 0.7, hy: shape.radius * 0.7 };
    case 'capsule':
      return { hx: shape.length / 2 - shape.radius * 0.4, hy: shape.radius * 0.6 };
    case 'polygon': {
      const xs = shape.points.map((p) => p[0]);
      const ys = shape.points.map((p) => p[1]);
      return { hx: ((Math.max(...xs) - Math.min(...xs)) / 2) * 0.6, hy: ((Math.max(...ys) - Math.min(...ys)) / 2) * 0.6 };
    }
  }
}
