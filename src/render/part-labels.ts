/**
 * Current health drawn on every living part during battle (setting "Health on parts").
 * The number's color follows the same health bands as the HUD (lightness = damage), with a
 * dark outline so it reads on any player color. Debris and removed parts show nothing.
 */
import { Container, Text } from 'pixi.js';
import type { CompiledFighter } from '../core/fighter-compile';
import type { Camera } from './camera';
import type { FighterFrame } from './frame';
import { COLOR, FONT, PART_LABEL, hex, healthColor } from './theme';
import { shapeExtent, shapeRadius } from './shapes';

export class PartLabels {
  readonly layer = new Container();
  /** texts[fighter][part] */
  private texts: Text[][] = [];
  private last: string[][] = [];
  /** Candidate label spots in each part's local frame: centroid first, then inside the shape. */
  private spots: [number, number][][][] = [];
  /** Per fighter: part indices, smallest first (big parts move their label if a spot is taken). */
  private order: number[][] = [];
  enabled = true;

  setFighters(compiled: readonly CompiledFighter[]): void {
    for (const t of this.texts.flat()) t.destroy();
    this.layer.removeChildren();
    this.texts = compiled.map((cf) =>
      cf.def.parts.map(() => {
        const t = new Text({
          text: '',
          style: {
            fontFamily: FONT.text,
            fontWeight: String(PART_LABEL.weight) as '600',
            fontSize: PART_LABEL.size,
            fill: hex(COLOR.ink),
            stroke: { color: hex(COLOR.bg900), width: PART_LABEL.outline, join: 'round' },
          },
        });
        t.anchor.set(0.5);
        t.visible = false;
        this.layer.addChild(t);
        return t;
      }),
    );
    this.last = compiled.map((cf) => cf.def.parts.map(() => ''));
    this.spots = compiled.map((cf) =>
      cf.def.parts.map((p) => {
        let cx = 0;
        let cy = 0;
        if (p.shape.kind === 'polygon') {
          const pts = p.shape.points;
          cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
          cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        }
        const { hx, hy } = shapeExtent(p.shape);
        const k = PART_LABEL.spotShift;
        return [
          [cx, cy],
          [cx, cy + hy * k],
          [cx, cy - hy * k],
          [cx + hx * k, cy],
          [cx - hx * k, cy],
        ] as [number, number][];
      }),
    );
    this.order = compiled.map((cf) => [...cf.def.parts.keys()].sort((a, b) => shapeRadius(cf.def.parts[a]!.shape) - shapeRadius(cf.def.parts[b]!.shape)));
  }

  draw(cam: Camera, fighters: readonly FighterFrame[], compiled: readonly CompiledFighter[], uiScale: number): void {
    this.layer.visible = this.enabled;
    if (!this.enabled) return;
    const size = Math.max(PART_LABEL.minSize, Math.min(PART_LABEL.maxSize, cam.zoom * PART_LABEL.sizePerMeter)) * uiScale;
    const clear = size * PART_LABEL.minSpacing;
    fighters.forEach((f, fi) => {
      const cf = compiled[fi];
      if (!cf) return;
      const placed: [number, number][] = [];
      for (const pi of this.order[fi] ?? []) {
        const p = f.parts[pi]!;
        const t = this.texts[fi]?.[pi];
        if (!t) continue;
        if (p.status !== 'attached') {
          t.visible = false;
          continue;
        }
        const max = cf.def.parts[pi]!.maxHealth;
        const key = `${p.health}`;
        if (this.last[fi]![pi] !== key) {
          this.last[fi]![pi] = key;
          t.text = key;
          t.style.fill = hex(healthColor((p.health / max) * 100));
        }
        t.style.fontSize = size;
        // First candidate spot that doesn't collide with an already placed label.
        const c = Math.cos(p.angle);
        const sn = Math.sin(p.angle);
        let best: [number, number] | null = null;
        for (const [lx, ly] of this.spots[fi]![pi]!) {
          const pos: [number, number] = [cam.sx(p.x + lx * c - ly * sn), cam.sy(p.y + lx * sn + ly * c)];
          best ??= pos;
          if (placed.every(([x, y]) => Math.abs(x - pos[0]) > clear || Math.abs(y - pos[1]) > clear * 0.6)) {
            best = pos;
            break;
          }
        }
        placed.push(best!);
        t.position.set(best![0], best![1]);
        t.visible = true;
      }
    });
  }
}
