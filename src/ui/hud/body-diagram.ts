/**
 * Body diagram generated from a fighter definition: every part's physics shape in the idle
 * pose, flattened to a small SVG map (facing up), filled with its health band color. The core
 * is ringed in `core`; lost parts become a dashed ink-faint outline. Nothing is hand-drawn.
 */
import { posesFor } from '../../core/fighter';
import type { CompiledFighter } from '../../core/fighter-compile';
import type { ShapeDef } from '../../core/schema/fighter-schema';
import { COLOR, STROKE, healthColor } from '../../render/theme';
import { svg } from '../dom';

type Pt = [number, number];

/** Outline points of a shape in its local frame. */
export function shapeOutline(shape: ShapeDef, segments = 10): Pt[] {
  switch (shape.kind) {
    case 'circle': {
      const pts: Pt[] = [];
      for (let i = 0; i < segments * 2; i++) {
        const a = (i / (segments * 2)) * Math.PI * 2;
        pts.push([Math.cos(a) * shape.radius, Math.sin(a) * shape.radius]);
      }
      return pts;
    }
    case 'capsule': {
      const h = Math.max(0.001, shape.length / 2 - shape.radius);
      const pts: Pt[] = [];
      for (let i = 0; i <= segments; i++) {
        const a = -Math.PI / 2 + (i / segments) * Math.PI;
        pts.push([h + Math.cos(a) * shape.radius, Math.sin(a) * shape.radius]);
      }
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI / 2 + (i / segments) * Math.PI;
        pts.push([-h + Math.cos(a) * shape.radius, Math.sin(a) * shape.radius]);
      }
      return pts;
    }
    case 'polygon':
      return shape.points.map(([x, y]) => [x, y] as Pt);
  }
}

export interface DiagramPart {
  path: SVGPathElement;
  max: number;
}

export interface BodyDiagram {
  el: SVGSVGElement;
  parts: DiagramPart[];
  update(health: number[], lost: boolean[]): void;
}

/**
 * Builds the diagram. `mirror` flips it horizontally (P2 panel). `silhouette` fills every part
 * with `fill` instead of health colors (fighter select).
 */
export function buildBodyDiagram(cf: CompiledFighter, opts: { mirror?: boolean; silhouette?: string; size?: number } = {}): BodyDiagram {
  const poses = posesFor(cf, 0, 0, 0, cf.def.joints.map((j) => j.idleAngle));
  // World (facing +x) -> diagram (facing up): dx = -y, dy = -x.
  const m = opts.mirror ? -1 : 1;
  const outlines = cf.def.parts.map((p, i) => {
    const pose = poses[i]!;
    const c = Math.cos(pose.angle);
    const s = Math.sin(pose.angle);
    return shapeOutline(p.shape).map(([lx, ly]) => {
      const wx = pose.x + lx * c - ly * s;
      const wy = pose.y + lx * s + ly * c;
      return [-wy * m, -wx] as Pt;
    });
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of outlines)
    for (const [x, y] of o) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const pad = 0.12;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const side = Math.max(w, h);
  const vb = `${minX - pad - (side - w) / 2} ${minY - pad - (side - h) / 2} ${side} ${side}`;
  const root = svg('svg', { viewBox: vb, preserveAspectRatio: 'xMidYMid meet' });
  root.style.overflow = 'visible';
  // Stroke widths are in viewBox units; scale px -> units for a nominal rendered size.
  const unit = side / (opts.size ?? 112);
  const order = [...cf.def.parts.keys()].sort((a, b) => Number(a === cf.core) - Number(b === cf.core));
  const parts: DiagramPart[] = new Array(cf.def.parts.length);
  for (const i of order) {
    const d = outlines[i]!.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ') + ' Z';
    const path = svg('path', { d, 'stroke-width': STROKE.hairline * unit, stroke: COLOR.bg900, fill: opts.silhouette ?? COLOR.health100 });
    root.appendChild(path);
    parts[i] = { path, max: cf.def.parts[i]!.maxHealth };
  }
  // Core ring.
  const core = outlines[cf.core]!;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of core) {
    cx += x;
    cy += y;
  }
  cx /= core.length;
  cy /= core.length;
  const r = Math.max(...core.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const ring = svg('circle', { cx, cy, r: r + 3 * unit, fill: 'none', stroke: COLOR.core, 'stroke-width': STROKE.core * unit * 0.6 });
  root.appendChild(ring);
  return {
    el: root,
    parts,
    update(health, lost) {
      parts.forEach((p, i) => {
        if (opts.silhouette) return;
        if (lost[i]) {
          p.path.setAttribute('fill', 'none');
          p.path.setAttribute('stroke', COLOR.inkFaint);
          p.path.setAttribute('stroke-dasharray', `${2 * unit} ${2 * unit}`);
          p.path.setAttribute('stroke-width', String(STROKE.hairline * unit));
        } else {
          p.path.setAttribute('fill', healthColor(((health[i] ?? 0) / p.max) * 100));
          p.path.setAttribute('stroke', COLOR.bg900);
          p.path.removeAttribute('stroke-dasharray');
        }
      });
    },
  };
}
