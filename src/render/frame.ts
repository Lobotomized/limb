/**
 * A read-only snapshot of everything the renderer needs from the simulation for one tick.
 * Two consecutive frames are interpolated for smooth rendering at any frame rate.
 */
import type { SimState } from '../core/state';
import type { PartStatus } from '../core/state';

export interface PartFrame {
  x: number;
  y: number;
  angle: number;
  status: PartStatus;
  health: number;
  lostTick: number;
}

export interface FighterFrame {
  parts: PartFrame[];
  facing: number;
}

export interface RenderFrame {
  tick: number;
  fighters: FighterFrame[];
}

export function captureFrame(s: SimState): RenderFrame {
  return {
    tick: s.game.tick,
    fighters: s.game.fighters.map((f, fi) => {
      const cf = s.ctx.compiled[fi]!;
      const parts = f.parts.map((p) => {
        if (p.body < 0) return { x: 0, y: 0, angle: 0, status: p.status, health: p.health, lostTick: p.lostTick };
        const pose = s.physics.pose(p.body);
        return { x: pose.x, y: pose.y, angle: pose.angle, status: p.status, health: p.health, lostTick: p.lostTick };
      });
      return { parts, facing: parts[cf.root]?.angle ?? 0 };
    }),
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** Interpolates between two frames (falls back to `b` when structure differs, e.g. new round). */
export function interpolate(a: RenderFrame | null, b: RenderFrame, t: number): RenderFrame {
  if (!a || a.fighters.length !== b.fighters.length) return b;
  return {
    tick: b.tick,
    fighters: b.fighters.map((fb, fi) => {
      const fa = a.fighters[fi]!;
      if (fa.parts.length !== fb.parts.length) return fb;
      return {
        facing: lerpAngle(fa.facing, fb.facing, t),
        parts: fb.parts.map((pb, pi) => {
          const pa = fa.parts[pi]!;
          if (pa.status === 'removed' || pb.status === 'removed') return pb;
          // Large jumps (round reset, teleports) are not interpolated.
          if (Math.abs(pa.x - pb.x) > 2 || Math.abs(pa.y - pb.y) > 2) return pb;
          return { ...pb, x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, angle: lerpAngle(pa.angle, pb.angle, t) };
        }),
      };
    }),
  };
}
