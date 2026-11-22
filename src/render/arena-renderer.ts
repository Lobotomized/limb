/** Arena: floor, subtle grid, damaging walls with an edge highlight, ring-out edges with a danger band. */
import type { Graphics } from 'pixi.js';
import type { ArenaDef, ArenaSide } from '../core/schema/arena-schema';
import type { Camera } from './camera';
import { ARENA_STYLE, COLOR, hex } from './theme';

type Side = 'left' | 'right' | 'top' | 'bottom';

export function drawArena(g: Graphics, cam: Camera, a: ArenaDef, timeMs: number, ringPulse: Record<Side, boolean>, scale: number): void {
  const hw = a.width / 2;
  const hh = a.height / 2;
  const th = a.wallThickness;
  const L = cam.sx(-hw);
  const R = cam.sx(hw);
  const T = cam.sy(hh);
  const B = cam.sy(-hh);
  // Floor
  g.rect(L, T, R - L, B - T).fill({ color: hex(COLOR.arenaFloor) });
  // Grid (line color at 5% opacity)
  for (let x = Math.ceil(-hw / ARENA_STYLE.gridStep) * ARENA_STYLE.gridStep; x <= hw; x += ARENA_STYLE.gridStep) {
    g.moveTo(cam.sx(x), T).lineTo(cam.sx(x), B);
  }
  for (let y = Math.ceil(-hh / ARENA_STYLE.gridStep) * ARENA_STYLE.gridStep; y <= hh; y += ARENA_STYLE.gridStep) {
    g.moveTo(L, cam.sy(y)).lineTo(R, cam.sy(y));
  }
  g.stroke({ width: 1, color: hex(COLOR.line), alpha: ARENA_STYLE.gridAlpha });

  const sides: [Side, ArenaSide][] = [
    ['top', a.sides.top],
    ['bottom', a.sides.bottom],
    ['left', a.sides.left],
    ['right', a.sides.right],
  ];
  const edgeW = ARENA_STYLE.wallEdgeWidth * scale;
  // Walls first (they span corners), then ring-out bands on top.
  for (const [side, kind] of sides) {
    if (kind !== 'wall') continue;
    if (side === 'top') {
      g.rect(cam.sx(-hw - th), cam.sy(hh + th), cam.px(a.width + 2 * th), cam.px(th)).fill({ color: hex(COLOR.arenaWall) });
      g.rect(cam.sx(-hw - th), T - edgeW, cam.px(a.width + 2 * th), edgeW).fill({ color: hex(COLOR.arenaWallEdge) });
    } else if (side === 'bottom') {
      g.rect(cam.sx(-hw - th), B, cam.px(a.width + 2 * th), cam.px(th)).fill({ color: hex(COLOR.arenaWall) });
      g.rect(cam.sx(-hw - th), B, cam.px(a.width + 2 * th), edgeW).fill({ color: hex(COLOR.arenaWallEdge) });
    } else if (side === 'left') {
      g.rect(cam.sx(-hw - th), cam.sy(hh + th), cam.px(th), cam.px(a.height + 2 * th)).fill({ color: hex(COLOR.arenaWall) });
      g.rect(L - edgeW, T, edgeW, B - T).fill({ color: hex(COLOR.arenaWallEdge) });
    } else {
      g.rect(R, cam.sy(hh + th), cam.px(th), cam.px(a.height + 2 * th)).fill({ color: hex(COLOR.arenaWall) });
      g.rect(R, T, edgeW, B - T).fill({ color: hex(COLOR.arenaWallEdge) });
    }
  }
  for (const o of a.obstacles ?? []) {
    g.rect(cam.sx(o.x - o.w / 2), cam.sy(o.y + o.h / 2), cam.px(o.w), cam.px(o.h)).fill({ color: hex(COLOR.arenaWall) }).stroke({ width: edgeW, color: hex(COLOR.arenaWallEdge), alignment: 1 });
  }
  const band = ARENA_STYLE.ringBandWidth * scale;
  const line = ARENA_STYLE.ringLineWidth * scale;
  const pulse = 0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * 2 * ARENA_STYLE.ringPulseHz);
  for (const [side, kind] of sides) {
    if (kind !== 'ringout') continue;
    const alpha = ringPulse[side] ? ARENA_STYLE.ringBandAlpha * (1 + 2 * pulse) : ARENA_STYLE.ringBandAlpha;
    const danger = hex(COLOR.danger);
    if (side === 'left') {
      g.rect(L, T, band, B - T).fill({ color: danger, alpha });
      g.rect(L - line / 2, T, line, B - T).fill({ color: danger });
    } else if (side === 'right') {
      g.rect(R - band, T, band, B - T).fill({ color: danger, alpha });
      g.rect(R - line / 2, T, line, B - T).fill({ color: danger });
    } else if (side === 'top') {
      g.rect(L, T, R - L, band).fill({ color: danger, alpha });
      g.rect(L, T - line / 2, R - L, line).fill({ color: danger });
    } else {
      g.rect(L, B - band, R - L, band).fill({ color: danger, alpha });
      g.rect(L, B - line / 2, R - L, line).fill({ color: danger });
    }
  }
}
