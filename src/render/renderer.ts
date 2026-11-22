/**
 * The arena view: owns the Pixi layers for arena, fighters and effects. Reads interpolated
 * frames and events; never mutates the simulation.
 */
import { Container, Graphics, type Application } from 'pixi.js';
import type { SimEvent } from '../core/events';
import type { SimContext } from '../core/state';
import { distanceToRingOut } from '../core/arena';
import { drawArena } from './arena-renderer';
import { Camera } from './camera';
import { Effects, type EffectSettings } from './effects';
import { FighterRenderer } from './fighter-renderer';
import { PartLabels } from './part-labels';
import type { RenderFrame } from './frame';
import { shapeRadius } from './shapes';
import { ARENA_STYLE } from './theme';

export class ArenaView {
  readonly root = new Container();
  private readonly arenaG = new Graphics();
  private readonly partsG = new Graphics();
  private readonly overlayG = new Graphics();
  readonly camera: Camera;
  readonly effects: Effects;
  readonly partLabels = new PartLabels();
  private fighters: FighterRenderer[] = [];
  private ctx: SimContext | null = null;
  private timeMs = 0;
  private snapCamera = true;

  constructor(
    private readonly app: Application,
    settings: EffectSettings,
  ) {
    this.camera = new Camera(app.screen.width, app.screen.height);
    this.effects = new Effects(settings);
    this.root.addChild(this.arenaG, this.partsG, this.overlayG, this.partLabels.layer, this.effects.sparkLayer, this.effects.textLayer, this.effects.screenFlash);
  }

  setMatch(ctx: SimContext): void {
    this.ctx = ctx;
    this.fighters = ctx.compiled.map((cf, i) => new FighterRenderer(cf, i));
    this.partLabels.setFighters(ctx.compiled);
    this.effects.clear();
    this.snapCamera = true;
  }

  onEvents(events: readonly SimEvent[]): void {
    this.effects.onEvents(events, this.camera);
    if (events.some((e) => e.type === 'roundStart')) this.snapCamera = true;
  }

  /** Bounding size of a fighter in meters (for "body lengths"). */
  private bodyLength(fi: number): number {
    const cf = this.ctx!.compiled[fi]!;
    return shapeRadius(cf.def.parts[cf.root]!.shape) * 2;
  }

  render(frame: RenderFrame, dtMs: number, uiScale: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.timeMs += dtMs;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.camera.resize(w, h);
    const pts = frame.fighters.flatMap((f, i) => this.fighters[i]?.cameraPoints(f) ?? []);
    this.camera.update(ctx.arena, pts, dtMs, uiScale, this.snapCamera);
    this.snapCamera = false;
    this.effects.update(dtMs, this.camera, w, h, uiScale);

    // Ring-out band pulse when a core is within 3 body lengths of that edge.
    const pulse = { left: false, right: false, top: false, bottom: false };
    const a = ctx.arena;
    frame.fighters.forEach((f, fi) => {
      const core = f.parts[ctx.compiled[fi]!.core];
      if (!core || core.status !== 'attached') return;
      const near = ARENA_STYLE.ringPulseBodyLengths * this.bodyLength(fi);
      if (distanceToRingOut(a, core.x, core.y) > near) return;
      if (a.sides.left === 'ringout' && core.x + a.width / 2 < near) pulse.left = true;
      if (a.sides.right === 'ringout' && a.width / 2 - core.x < near) pulse.right = true;
      if (a.sides.bottom === 'ringout' && core.y + a.height / 2 < near) pulse.bottom = true;
      if (a.sides.top === 'ringout' && a.height / 2 - core.y < near) pulse.top = true;
    });

    this.arenaG.clear();
    drawArena(this.arenaG, this.camera, a, this.timeMs, pulse, uiScale);
    this.partsG.clear();
    this.overlayG.clear();
    frame.fighters.forEach((f, i) => this.fighters[i]?.drawParts(this.partsG, this.camera, f, frame.tick, this.timeMs, this.effects.flashFor(i), uiScale));
    frame.fighters.forEach((f, i) => this.fighters[i]?.drawOverlay(this.overlayG, this.camera, f, this.timeMs, uiScale));
    this.partLabels.draw(this.camera, frame.fighters, ctx.compiled, uiScale);
  }
}
