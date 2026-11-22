/**
 * A running match on screen: driver (local or online), fixed-tick loop, arena view, HUD,
 * audio. Presentation only reads simulation state and events.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../core/events';
import { FixedTickLoop } from '../core/loop';
import type { SoundEvents } from '../audio/sound-events';
import { interpolate } from '../render/frame';
import type { ArenaView } from '../render/renderer';
import { Hud } from '../ui/hud/hud';
import type { MatchDriver } from './drivers';

export interface MatchSetup {
  kind: 'local' | 'bot' | 'online';
  fighters: [string, string];
  labels: [string, string];
  difficulty?: 'easy' | 'medium' | 'hard';
  seed: number;
}

export class MatchView {
  readonly loop = new FixedTickLoop(60);
  readonly hud: Hud;
  paused = false;
  matchOverAtMs = -1;
  private timeMs = 0;

  constructor(
    readonly setup: MatchSetup,
    readonly driver: MatchDriver,
    private readonly view: ArenaView,
    private readonly sounds: SoundEvents,
    hudHost: HTMLElement,
    detailedHud: boolean,
  ) {
    this.hud = new Hud(driver.sim.ctx, setup.labels, detailedHud);
    hudHost.replaceChildren(this.hud.root);
    view.setMatch(driver.sim.ctx);
  }

  get sim() {
    return this.driver.sim;
  }

  /** Advances simulation (unless paused locally) and renders. */
  frame(dtMs: number, uiScale: number, stage: Container): void {
    this.timeMs += dtMs;
    this.driver.beginFrame?.();
    // Online matches never pause the simulation (the opponent keeps playing).
    const run = !this.paused || this.setup.kind === 'online';
    if (run) {
      if (this.driver.timeSyncMs) this.loop.nudge(this.driver.timeSyncMs());
      const n = this.loop.advance(dtMs);
      for (let i = 0; i < n; i++) this.dispatch(this.driver.tick());
    }
    this.hud.update(this.sim.game, dtMs);
    if (this.driver.status) this.hud.netStatus.textContent = this.driver.status();
    this.view.render(interpolate(this.driver.prevFrame, this.driver.currFrame, run ? this.loop.alpha : 1), run ? dtMs : 0, uiScale);
    stage.visible = true;
  }

  private dispatch(events: SimEvent[]): void {
    if (!events.length) return;
    this.view.onEvents(events);
    this.hud.onEvents(events);
    this.sounds.onEvents(events);
    if (events.some((e) => e.type === 'matchOver')) this.matchOverAtMs = this.timeMs;
  }

  /** Milliseconds since the match ended (or -1). */
  sinceMatchOver(): number {
    return this.matchOverAtMs < 0 ? -1 : this.timeMs - this.matchOverAtMs;
  }

  dispose(): void {
    this.driver.dispose();
    this.hud.root.remove();
  }
}
