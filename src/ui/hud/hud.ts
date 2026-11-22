/**
 * In-match HUD: two corner panels (P1 top-left, P2 top-right, mirrored) with player tag,
 * fighter name, generated body diagram, round pips and event toasts; the round counter at
 * top center; round banners across the middle. Reads state and events only.
 */
import type { SimEvent } from '../../core/events';
import type { GameState, SimContext } from '../../core/state';
import { COLOR, HUD as HUD_T, PLAYER } from '../../render/theme';
import { el } from '../dom';
import { buildBodyDiagram, type BodyDiagram } from './body-diagram';
import { HealthBars } from './health-bars';

/** Toughest part in the match: the shared full-length scale for every health bar. */
export function matchMaxPartHealth(ctx: SimContext): number {
  return Math.max(...ctx.defs.flatMap((d) => d.parts.map((p) => p.maxHealth)));
}

interface Panel {
  root: HTMLElement;
  diagram: BodyDiagram;
  pips: HTMLElement[];
  toast: HTMLElement;
  toastUntil: number;
  bars: HealthBars;
  lastKey: string;
}

export class Hud {
  readonly root = el('div', 'lc-layer');
  private readonly panels: Panel[];
  private readonly counter = el('div', 'round-counter');
  private readonly bannerHost = el('div', 'lc-layer');
  private bannerUntil = 0;
  readonly netStatus = el('div', 'net-status');
  readonly netAlert = el('div', 'net-alert');
  private timeMs = 0;

  constructor(
    private readonly ctx: SimContext,
    labels: [string, string],
    private detailed: boolean,
  ) {
    this.panels = [0, 1].map((i) => this.buildPanel(i, labels[i]!));
    this.netAlert.style.display = 'none';
    this.root.append(...this.panels.map((p) => p.root), this.counter, this.bannerHost, this.netStatus, this.netAlert);
  }

  private buildPanel(i: number, label: string): Panel {
    const pl = PLAYER[i]!;
    const cf = this.ctx.compiled[i]!;
    const tagText = i === 0 ? `${pl.marker} ${pl.tag}` : `${pl.tag} ${pl.marker}`;
    const tag = el('div', `t-hud-value c-p${i + 1}`, label ? `${tagText} · ${label}` : tagText);
    const name = el('div', 't-caption ink-muted', cf.def.name);
    const diagram = buildBodyDiagram(cf, { mirror: i === 1, size: HUD_T.diagramSize });
    diagram.el.classList.add('hud-diagram');
    const pips: HTMLElement[] = [];
    const pipRow = el('div', 'pips');
    for (let k = 0; k < this.ctx.tuning.roundsToWin; k++) {
      const pip = el('div', 'pip');
      pip.style.borderColor = pl.color;
      pips.push(pip);
      pipRow.append(pip);
    }
    const toast = el('div', 'toast t-hud-label');
    toast.style.color = pl.color;
    const bars = new HealthBars(cf, matchMaxPartHealth(this.ctx));
    bars.el.style.display = this.detailed ? '' : 'none';
    const root = el(
      'div',
      `hud-panel p${i + 1}`,
      el('div', 'hud-head', tag, name),
      el('div', 'hud-row', diagram.el, el('div', 'hud-side', pipRow, toast)),
      bars.el,
    );
    return { root, diagram, pips, toast, toastUntil: 0, bars, lastKey: '' };
  }

  setDetailed(on: boolean): void {
    this.detailed = on;
    for (const p of this.panels) p.bars.el.style.display = on ? '' : 'none';
  }

  private banner(headline: string, sub: string, subColor: string, rule: string, ms: number): void {
    this.bannerHost.replaceChildren();
    const b = el('div', 'banner', el('div', 't-banner', headline), el('div', 'sub', sub));
    b.style.borderColor = rule;
    (b.lastChild as HTMLElement).style.color = subColor;
    this.bannerHost.append(b);
    this.bannerUntil = this.timeMs + ms;
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'partDied') {
        const p = this.panels[e.ref.fighter]!;
        p.toast.textContent = `${this.ctx.defs[e.ref.fighter]!.parts[e.ref.part]!.name} lost`;
        p.toastUntil = this.timeMs + HUD_T.toastMs;
      } else if (e.type === 'roundStart') {
        this.banner(`Round ${e.round}`, `${e.wins[0]} – ${e.wins[1]}`, COLOR.inkMuted, COLOR.line, HUD_T.bannerMs);
      } else if (e.type === 'roundOver') {
        const ms = (this.ctx.tuning.roundEndTicks * 1000) / 60;
        if (e.winner === null) this.banner('Draw', 'Round replayed', COLOR.inkMuted, COLOR.line, ms);
        else {
          const w = PLAYER[e.winner]!;
          const sub = `${w.marker} ${w.tag} wins the round`;
          if (e.reason === 'ringout') this.banner('Ring out', sub, w.color, COLOR.danger, ms);
          else this.banner('Core down', sub, w.color, COLOR.core, ms);
        }
      }
    }
  }

  update(g: GameState, dtMs: number): void {
    this.timeMs += dtMs;
    this.counter.textContent = `ROUND ${g.round}`;
    g.fighters.forEach((f, i) => {
      const p = this.panels[i]!;
      const key = f.parts.map((x) => `${x.health}${x.status[0]}`).join(',');
      if (key !== p.lastKey) {
        p.lastKey = key;
        p.diagram.update(
          f.parts.map((x) => x.health),
          f.parts.map((x) => x.status !== 'attached'),
        );
        if (this.detailed) p.bars.update(f);
      }
      p.pips.forEach((pip, k) => (pip.style.background = k < (g.wins[i] ?? 0) ? PLAYER[i]!.color : 'transparent'));
      if (p.toastUntil && this.timeMs > p.toastUntil) {
        p.toast.textContent = '';
        p.toastUntil = 0;
      }
    });
    if (this.bannerUntil && this.timeMs > this.bannerUntil) {
      this.bannerHost.replaceChildren();
      this.bannerUntil = 0;
    }
  }
}
