/**
 * Debug sandbox (dev builds only): pick a fighter, trigger each move, see joint targets,
 * contact points and impact values, and edit tuning values live. P1 is also playable with
 * the normal controls; P2 is a passive dummy.
 */
import { Graphics } from 'pixi.js';
import { createMatch, step } from '../core/simulation';
import { emptyInput, SLOT_BUTTONS, type InputFrame } from '../core/input-frame';
import type { SimState } from '../core/state';
import { TUNING, type Tuning } from '../core/tuning';
import { getArena } from '../registry/arenas';
import { getFighter } from '../registry/fighters';
import { captureFrame, interpolate, type RenderFrame } from '../render/frame';
import { COLOR, hex, uiScale } from '../render/theme';
import { el } from '../ui/dom';
import type { Game } from './game';
import { FixedTickLoop } from '../core/loop';
import { cos, sin } from '../core/math';

interface Marker {
  x: number;
  y: number;
  ms: number;
}

export class Sandbox {
  private sim!: SimState;
  private fighterIdx = 0;
  private readonly loop = new FixedTickLoop(60);
  private prev: RenderFrame | null = null;
  private curr!: RenderFrame;
  private readonly overlay = new Graphics();
  private readonly panel = el('div', 'panel col sandbox-panel lc-interactive');
  private readonly log = el('div', 'sandbox-log');
  private readonly logLines: string[] = [];
  private markers: Marker[] = [];
  /** Scripted move: (move index, ticks left, direction stick, press tick). */
  private scripted: { move: number; left: number; stick: [number, number]; first: boolean } | null = null;

  constructor(
    private readonly game: Game,
    private readonly host: HTMLElement,
  ) {
    game.app.stage.visible = true;
    game.app.stage.addChild(this.overlay);
    host.replaceChildren(this.panel);
    this.reset();
  }

  private reset(): void {
    this.sim?.physics.free();
    const id = this.game.fighters[this.fighterIdx]!.def.id;
    const tuning: Tuning = this.sim ? this.sim.ctx.tuning : { ...TUNING };
    this.sim = createMatch({ fighters: [getFighter(id).def, getFighter(id).def], arena: getArena(), seed: 1, tuning });
    for (let i = 0; i < tuning.countdownTicks; i++) step(this.sim, [emptyInput(), emptyInput()]);
    this.curr = captureFrame(this.sim);
    this.prev = null;
    this.game.view.setMatch(this.sim.ctx);
    this.buildPanel();
  }

  private buildPanel(): void {
    const def = this.sim.ctx.defs[0];
    const btn = (label: string, fn: () => void): HTMLElement => {
      const b = el('div', 'btn', label);
      b.addEventListener('click', fn);
      return b;
    };
    const moves = el('div', 'col');
    def.moves.forEach((m, i) => moves.append(btn(`${m.slot}/${m.direction} ${m.name}`, () => this.trigger(i))));
    const tuning = el('div', 'col');
    for (const key of Object.keys(TUNING).sort() as (keyof Tuning)[]) {
      const input = el('input') as HTMLInputElement;
      input.type = 'number';
      input.step = 'any';
      input.value = String(this.sim.ctx.tuning[key]);
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) this.sim.ctx.tuning[key] = v;
      });
      tuning.append(el('label', '', key, input));
    }
    this.panel.replaceChildren(
      el('div', 't-heading', 'Sandbox'),
      el('div', 'row', btn('◀', () => this.cycle(-1)), el('div', 't-hud-value', def.name), btn('▶', () => this.cycle(1))),
      btn('Reset', () => this.reset()),
      btn('Exit', () => this.game.closeSandbox()),
      el('div', 't-hud-label', 'Moves (P1)'),
      moves,
      el('div', 't-hud-label', 'Last hits'),
      this.log,
      el('div', 't-hud-label', 'Tuning (live)'),
      tuning,
    );
  }

  private cycle(d: number): void {
    const n = this.game.fighters.length;
    this.fighterIdx = (this.fighterIdx + d + n) % n;
    this.reset();
  }

  private trigger(move: number): void {
    const m = this.sim.ctx.compiled[0].moves[move]!;
    const f = this.sim.physics.pose(this.sim.game.fighters[0]!.parts[this.sim.ctx.compiled[0].root]!.body).angle;
    const rel = { neutral: null, forward: 0, back: Math.PI, up: Math.PI / 2, down: -Math.PI / 2 }[m.direction];
    const stick: [number, number] = rel === null ? [0, 0] : [Math.round(cos(f + rel) * 127), Math.round(sin(f + rel) * 127)];
    this.scripted = { move, left: 45, stick, first: true };
  }

  frame(dtMs: number, keys: string[]): void {
    if (keys.includes('Escape')) return this.game.closeSandbox();
    const n = this.loop.advance(dtMs);
    for (let i = 0; i < n; i++) {
      let p1: InputFrame = this.game.devices.readSolo();
      if (this.scripted) {
        const m = this.sim.ctx.compiled[0].moves[this.scripted.move]!;
        p1 = { ...p1, buttons: p1.buttons | SLOT_BUTTONS[m.slot - 1]! };
        if (this.scripted.first) {
          p1.moveX = this.scripted.stick[0];
          p1.moveY = this.scripted.stick[1];
          this.scripted.first = false;
        }
        if (--this.scripted.left <= 0) this.scripted = null;
      }
      const events = step(this.sim, [p1, emptyInput()]);
      for (const e of events) {
        if (e.type !== 'hit') continue;
        const a = this.sim.ctx.defs[e.a.fighter]!.parts[e.a.part]!.name;
        const b = e.b ? this.sim.ctx.defs[e.b.fighter]!.parts[e.b.part]!.name : 'wall';
        this.logLines.unshift(`${a} × ${b}: impact ${e.impact.toFixed(2)} → ${e.damage}`);
        this.logLines.length = Math.min(this.logLines.length, 8);
        this.markers.push({ x: e.point.x, y: e.point.y, ms: 1000 });
      }
      if (events.length) {
        this.game.view.onEvents(events);
        this.log.textContent = this.logLines.join('\n');
      }
      // Endless sandbox: rebuild when the round ends.
      if (this.sim.game.phase !== 'fight' && this.sim.game.phase !== 'countdown') this.reset();
      this.prev = this.curr;
      this.curr = captureFrame(this.sim);
    }
    const scale = uiScale(window.innerHeight);
    this.game.view.render(interpolate(this.prev, this.curr, this.loop.alpha), dtMs, scale);
    this.drawOverlay(dtMs, scale);
  }

  /** Joint targets (commanded angles) and recent contact points. */
  private drawOverlay(dtMs: number, scale: number): void {
    const g = this.overlay;
    const cam = this.game.view.camera;
    g.clear();
    const f = this.sim.game.fighters[0]!;
    const cf = this.sim.ctx.compiled[0];
    cf.def.joints.forEach((j, ji) => {
      const js = f.joints[ji]!;
      const parent = f.parts[cf.jointParent[ji]!]!;
      if (js.handle < 0 || parent.body < 0) return;
      const p = this.sim.physics.pose(parent.body);
      const ax = p.x + j.anchorParent[0] * cos(p.angle) - j.anchorParent[1] * sin(p.angle);
      const ay = p.y + j.anchorParent[0] * sin(p.angle) + j.anchorParent[1] * cos(p.angle);
      const a = p.angle + js.commanded;
      g.moveTo(cam.sx(ax), cam.sy(ay)).lineTo(cam.sx(ax + cos(a) * 0.25), cam.sy(ay + sin(a) * 0.25));
    });
    g.stroke({ width: 1.5 * scale, color: hex(COLOR.ink), alpha: 0.8 });
    this.markers = this.markers.filter((m) => (m.ms -= dtMs) > 0);
    for (const m of this.markers) g.circle(cam.sx(m.x), cam.sy(m.y), 6 * scale).stroke({ width: 2 * scale, color: hex(COLOR.danger), alpha: m.ms / 1000 });
  }

  dispose(): void {
    this.overlay.destroy();
    this.host.replaceChildren();
    this.sim.physics.free();
    this.game.app.stage.visible = false;
  }
}
