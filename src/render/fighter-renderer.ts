/**
 * Draws fighters from their physics shapes: player-color fill, lighter outline, damage
 * states (fill drained toward bg700 + seeded cracks + blinking outline), joints, the core
 * ring with glow and pulse, the player marker and the facing chevron. Lost parts fade as debris.
 */
import type { Graphics } from 'pixi.js';
import type { CompiledFighter } from '../core/fighter-compile';
import { Rng, mixSeed } from '../core/rng';
import type { Camera } from './camera';
import type { FighterFrame, PartFrame } from './frame';
import { shapeExtent, shapePath, shapeRadius } from './shapes';
import { COLOR, DAMAGE_STATES, FIGHTER_STYLE, OPACITY, PLAYER, SHADOW, STROKE, hex, lighten, mixHex } from './theme';

type Crack = number[]; // local-space polyline [x0,y0,x1,y1,...] in meters

export class FighterRenderer {
  private readonly cracks: Crack[][];
  private readonly color: string;
  private readonly outline: number;

  constructor(
    readonly cf: CompiledFighter,
    readonly player: number,
  ) {
    this.color = PLAYER[player]!.color;
    this.outline = lighten(this.color, FIGHTER_STYLE.outlineLighten);
    // Seeded cracks per part: stable for a given fighter/part on every machine.
    this.cracks = cf.def.parts.map((p, i) => {
      const rng = new Rng(mixSeed(player + 1, i + 1, p.id.length));
      const { hx, hy } = shapeExtent(p.shape);
      const out: Crack[] = [];
      for (let k = 0; k < 4; k++) {
        const pts: number[] = [];
        let x = rng.range(-hx, hx);
        let y = rng.range(-hy, hy);
        pts.push(x, y);
        for (let s = 0; s < 3; s++) {
          x = Math.max(-hx, Math.min(hx, x + rng.range(-hx, hx) * 0.45));
          y = Math.max(-hy, Math.min(hy, y + rng.range(-hy, hy) * 0.7));
          pts.push(x, y);
        }
        out.push(pts);
      }
      return out;
    });
  }

  private damageState(part: number, pf: PartFrame) {
    const max = this.cf.def.parts[part]!.maxHealth;
    const pct = (pf.health / max) * 100;
    return DAMAGE_STATES.find((d) => pct >= d.minPct) ?? DAMAGE_STATES[DAMAGE_STATES.length - 1]!;
  }

  /** Alpha of a lost part: detached opacity for 2 s, then fades out over 1 s. */
  private debrisAlpha(pf: PartFrame, tick: number): number {
    const ms = ((tick - pf.lostTick) * 1000) / 60;
    if (ms <= FIGHTER_STYLE.debrisVisibleMs) return OPACITY.detached;
    return OPACITY.detached * Math.max(0, 1 - (ms - FIGHTER_STYLE.debrisVisibleMs) / FIGHTER_STYLE.debrisFadeMs);
  }

  /** Draws all parts (debris first, so living parts are on top). */
  drawParts(g: Graphics, cam: Camera, f: FighterFrame, tick: number, timeMs: number, flash: Map<number, number>, scale: number): void {
    const def = this.cf.def;
    const order = [...f.parts.keys()].sort((a, b) => Number(f.parts[a]!.status === 'attached') - Number(f.parts[b]!.status === 'attached'));
    const blinkOn = Math.floor((timeMs / 1000) * FIGHTER_STYLE.blinkHz * 2) % 2 === 0;
    for (const i of order) {
      const pf = f.parts[i]!;
      if (pf.status === 'removed') continue;
      const shape = def.parts[i]!.shape;
      const attached = pf.status === 'attached';
      const ds = attached ? this.damageState(i, pf) : DAMAGE_STATES[DAMAGE_STATES.length - 1]!;
      const alpha = attached ? 1 : this.debrisAlpha(pf, tick);
      if (alpha <= 0) continue;
      const fill = mixHex(this.color, COLOR.bg700, ds.mix);
      const outline = attached && ds.blink && !blinkOn ? hex(COLOR.ink) : this.outline;
      shapePath(g, cam, shape, pf.x, pf.y, pf.angle);
      g.fill({ color: fill, alpha }).stroke({ width: STROKE.part * scale, color: outline, alpha, alignment: 0.5 });
      // Cracks (2px bg900 lines).
      const n = attached ? ds.cracks : 2;
      if (n > 0) {
        const c = Math.cos(pf.angle);
        const s = Math.sin(pf.angle);
        for (let k = 0; k < n; k++) {
          const pts = this.cracks[i]![k]!;
          for (let p = 0; p < pts.length; p += 2) {
            const lx = pts[p]!;
            const ly = pts[p + 1]!;
            const wx = pf.x + lx * c - ly * s;
            const wy = pf.y + lx * s + ly * c;
            if (p === 0) g.moveTo(cam.sx(wx), cam.sy(wy));
            else g.lineTo(cam.sx(wx), cam.sy(wy));
          }
        }
        g.stroke({ width: FIGHTER_STYLE.crackWidth * scale, color: hex(FIGHTER_STYLE.crackColor), alpha });
      }
      // Impact flash overlay.
      const fl = flash.get(i);
      if (fl && fl > 0) {
        shapePath(g, cam, shape, pf.x, pf.y, pf.angle);
        g.fill({ color: hex(COLOR.impact), alpha: fl });
      }
    }
  }

  /** Joints, core ring, marker and facing chevron (drawn above all parts). */
  drawOverlay(g: Graphics, cam: Camera, f: FighterFrame, timeMs: number, scale: number): void {
    const def = this.cf.def;
    const pcolor = hex(this.color);
    // Joints: small bg700 discs with a player-color outline, at the parent anchor.
    def.joints.forEach((j, ji) => {
      const child = f.parts[this.cf.jointChild[ji]!]!;
      const parent = f.parts[this.cf.jointParent[ji]!]!;
      if (child.status !== 'attached' || parent.status !== 'attached') return;
      const c = Math.cos(parent.angle);
      const s = Math.sin(parent.angle);
      const wx = parent.x + j.anchorParent[0] * c - j.anchorParent[1] * s;
      const wy = parent.y + j.anchorParent[0] * s + j.anchorParent[1] * c;
      const r = Math.max(2.5 * scale, Math.min(FIGHTER_STYLE.jointRadius * scale, cam.px(0.045)));
      g.circle(cam.sx(wx), cam.sy(wy), r).fill({ color: hex(COLOR.bg700) }).stroke({ width: 1.5 * scale, color: pcolor });
    });
    // Core ring with glow, pulsing faster as core health drops.
    const core = f.parts[this.cf.core]!;
    if (core.status === 'attached' || core.status === 'debris') {
      const maxH = def.parts[this.cf.core]!.maxHealth;
      const hpPct = Math.max(0, core.health / maxH);
      const hz = FIGHTER_STYLE.corePulseMinHz + (FIGHTER_STYLE.corePulseMaxHz - FIGHTER_STYLE.corePulseMinHz) * (1 - hpPct);
      const pulse = 0.5 + 0.5 * Math.sin((timeMs / 1000) * Math.PI * 2 * hz);
      const shape = def.parts[this.cf.core]!.shape;
      const gap = FIGHTER_STYLE.coreRingGap * scale;
      const coreColor = hex(COLOR.core);
      const alpha = core.status === 'attached' ? 1 : OPACITY.detached;
      // Glow: widening translucent strokes approximate the 16px blur at 60% alpha.
      for (let k = 3; k >= 1; k--) {
        shapePath(g, cam, shape, core.x, core.y, core.angle, gap + STROKE.core * scale * 0.5);
        g.stroke({ width: STROKE.core * scale + (SHADOW.coreGlow.blur * scale * k) / 3, color: coreColor, alpha: SHADOW.coreGlow.alpha * 0.22 * (0.6 + 0.4 * pulse) * alpha });
      }
      shapePath(g, cam, shape, core.x, core.y, core.angle, gap + STROKE.core * scale * 0.5);
      g.stroke({ width: STROKE.core * scale, color: coreColor, alpha: (0.75 + 0.25 * pulse) * alpha });
      // Player marker above the core (screen-up), in the player color.
      if (core.status === 'attached') {
        const rr = cam.px(shapeRadius(shape)) + gap + STROKE.core * scale + FIGHTER_STYLE.markerGap * scale;
        const mx = cam.sx(core.x);
        const my = cam.sy(core.y) - rr - (FIGHTER_STYLE.markerSize * scale) / 2;
        const m = FIGHTER_STYLE.markerSize * scale;
        if (PLAYER[this.player]!.markerShape === 'triangle') g.poly([mx, my - m / 2, mx + m / 2, my + m / 2, mx - m / 2, my + m / 2], true).fill({ color: pcolor });
        else g.circle(mx, my, m / 2).fill({ color: pcolor });
      }
    }
    // Facing chevron just outside the root part.
    const root = f.parts[this.cf.root]!;
    if (root.status === 'attached') {
      const rr = cam.px(shapeRadius(def.parts[this.cf.root]!.shape)) + FIGHTER_STYLE.facingChevronGap * scale;
      const th = -f.facing;
      const cx = cam.sx(root.x) + Math.cos(th) * rr;
      const cy = cam.sy(root.y) + Math.sin(th) * rr;
      const sz = FIGHTER_STYLE.facingChevronSize * scale;
      const back = (a: number): [number, number] => [cx + Math.cos(th + a) * sz, cy + Math.sin(th + a) * sz];
      const [ax, ay] = back(Math.PI * 0.8);
      const [bx, by] = back(-Math.PI * 0.8);
      g.moveTo(ax, ay).lineTo(cx, cy).lineTo(bx, by).stroke({ width: STROKE.part * scale, color: pcolor, cap: 'round', join: 'round' });
    }
  }

  /** World positions worth keeping on camera (attached parts). */
  cameraPoints(f: FighterFrame): { x: number; y: number }[] {
    return f.parts.filter((p) => p.status === 'attached').map((p) => ({ x: p.x, y: p.y }));
  }
}
