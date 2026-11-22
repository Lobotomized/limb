/**
 * Presentation-only combat feedback: impact flash, sparks, screen shake, damage numbers,
 * part-lost bursts and the core-lost flash. Every effect scales with the hit's damage.
 * Nothing here can affect the simulation (it only reads events).
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { SimEvent } from '../core/events';
import type { Camera } from './camera';
import { COLOR, FONT, FX, PLAYER, TYPE, fxScale, hex } from './theme';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  color: number;
}

interface DamageNumber {
  text: Text;
  x: number;
  y: number;
  ageMs: number;
}

export interface EffectSettings {
  reducedShake: boolean;
  damageNumbers: boolean;
}

export class Effects {
  readonly sparkLayer = new Graphics();
  readonly textLayer = new Container();
  readonly screenFlash = new Graphics();
  private sparks: Spark[] = [];
  private numbers: DamageNumber[] = [];
  /** Per-fighter part flash: frames left and alpha. */
  private flashes = [new Map<number, { frames: number; alpha: number }>(), new Map<number, { frames: number; alpha: number }>()];
  private shakeAmp = 0;
  private shakeMs = 0;
  private screenFlashMs = 0;

  constructor(private settings: EffectSettings) {}

  setSettings(s: EffectSettings): void {
    this.settings = s;
  }

  private flashCap(): number {
    return this.settings.reducedShake ? FX.reducedShakeFlashCap : 1;
  }

  onEvents(events: readonly SimEvent[], cam: Camera): void {
    for (const e of events) {
      if (e.type === 'hit') {
        const alpha = Math.min(this.flashCap(), fxScale(FX.flashAlpha, e.damage));
        const frames = Math.round(fxScale(FX.flashFrames, e.damage));
        this.flashes[e.a.fighter]!.set(e.a.part, { frames, alpha });
        if (e.b) this.flashes[e.b.fighter]!.set(e.b.part, { frames, alpha });
        this.burst(e.point.x, e.point.y, Math.round(fxScale(FX.sparks, e.damage)), hex(COLOR.spark), cam, e.damage);
        if (!this.settings.reducedShake) {
          const amp = fxScale(FX.shakePx, e.damage);
          if (amp > this.shakeAmp * (1 - this.shakeMs / FX.shakeDecayMs)) {
            this.shakeAmp = amp;
            this.shakeMs = 0;
          }
        }
        if (this.settings.damageNumbers) this.addNumber(e.point.x, e.point.y, e.damage);
      } else if (e.type === 'partDied') {
        this.burst(e.point.x, e.point.y, FX.partLostSparks, hex(PLAYER[e.ref.fighter]!.color), cam, FX.bigHitDamage);
      } else if (e.type === 'coreDied') {
        this.screenFlashMs = FX.coreFlashMs;
      }
    }
  }

  private burst(x: number, y: number, n: number, color: number, cam: Camera, damage: number): void {
    const speed = fxScale(FX.sparkSpeed, damage) / Math.max(1, cam.zoom);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ageMs: 0, color });
    }
  }

  private addNumber(x: number, y: number, damage: number): void {
    const t = TYPE.damage;
    const text = new Text({
      text: String(damage),
      style: { fontFamily: FONT[t.font], fontSize: t.size, fontWeight: String(t.weight) as '700', fill: hex(COLOR.ink), stroke: { color: hex(COLOR.bg900), width: 4 } },
    });
    text.anchor.set(0.5);
    const s = fxScale(FX.damageNumberScale, damage);
    text.scale.set(s);
    this.textLayer.addChild(text);
    this.numbers.push({ text, x, y, ageMs: 0 });
  }

  /** Current flash alpha per part of a fighter (consumed by the fighter renderer). */
  flashFor(fighter: number): Map<number, number> {
    const out = new Map<number, number>();
    for (const [part, f] of this.flashes[fighter]!) if (f.frames > 0) out.set(part, f.alpha);
    return out;
  }

  /** Advances effects by one rendered frame and draws them. */
  update(dtMs: number, cam: Camera, screenW: number, screenH: number, uiScale: number): void {
    // Flash frames are counted in rendered frames.
    for (const m of this.flashes) {
      for (const [k, f] of m) {
        f.frames--;
        if (f.frames <= 0) m.delete(k);
      }
    }
    // Shake
    if (this.shakeAmp > 0) {
      this.shakeMs += dtMs;
      const k = Math.max(0, 1 - this.shakeMs / FX.shakeDecayMs);
      const amp = this.shakeAmp * k * uiScale;
      cam.shakeX = (Math.random() * 2 - 1) * amp;
      cam.shakeY = (Math.random() * 2 - 1) * amp;
      if (k <= 0) this.shakeAmp = 0;
    } else {
      cam.shakeX = 0;
      cam.shakeY = 0;
    }
    // Sparks
    const g = this.sparkLayer;
    g.clear();
    const dt = dtMs / 1000;
    this.sparks = this.sparks.filter((s) => (s.ageMs += dtMs) < FX.sparkLifeMs);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const life = 1 - s.ageMs / FX.sparkLifeMs;
      g.circle(cam.sx(s.x), cam.sy(s.y), FX.sparkSize * uiScale * (0.5 + 0.5 * life)).fill({ color: s.color, alpha: life });
    }
    // Damage numbers float up 24px over 600 ms.
    this.numbers = this.numbers.filter((n) => {
      n.ageMs += dtMs;
      const t = n.ageMs / FX.damageNumberMs;
      if (t >= 1) {
        n.text.destroy();
        return false;
      }
      n.text.position.set(cam.sx(n.x), cam.sy(n.y) - FX.damageNumberRisePx * uiScale * t);
      n.text.alpha = 1 - t * t;
      return true;
    });
    // Core-lost full-screen flash.
    this.screenFlash.clear();
    if (this.screenFlashMs > 0) {
      const a = FX.coreFlashAlpha * (this.screenFlashMs / FX.coreFlashMs);
      this.screenFlash.rect(0, 0, screenW, screenH).fill({ color: hex(COLOR.impact), alpha: Math.min(a, this.flashCap()) });
      this.screenFlashMs -= dtMs;
    }
  }

  clear(): void {
    this.sparks = [];
    for (const n of this.numbers) n.text.destroy();
    this.numbers = [];
    this.flashes.forEach((m) => m.clear());
    this.shakeAmp = 0;
    this.screenFlashMs = 0;
  }
}
