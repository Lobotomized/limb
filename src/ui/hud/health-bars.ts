/**
 * Per-part health bars (pause screen and the "Detailed HUD" setting): 10px tall, health
 * band fill, blinking below 25%; lost parts get a struck-through label and a dashed track.
 */
import type { CompiledFighter } from '../../core/fighter-compile';
import type { FighterState } from '../../core/state';
import { healthColor } from '../../render/theme';
import { el } from '../dom';

export class HealthBars {
  readonly el = el('div', 'bars');
  private rows: { row: HTMLElement; bar: HTMLElement; fill: HTMLElement; last: string }[] = [];

  constructor(private readonly cf: CompiledFighter) {
    for (const p of cf.def.parts) {
      const fill = el('div', 'fill');
      const bar = el('div', 'bar', fill);
      const row = el('div', 'bar-row', el('div', 'name', p.name), bar);
      this.el.append(row);
      this.rows.push({ row, bar, fill, last: '' });
    }
  }

  update(f: FighterState): void {
    f.parts.forEach((p, i) => {
      const r = this.rows[i]!;
      const lost = p.status !== 'attached';
      const pct = (p.health / this.cf.def.parts[i]!.maxHealth) * 100;
      const key = `${lost}:${Math.round(pct)}`;
      if (key === r.last) return;
      r.last = key;
      r.row.classList.toggle('lost', lost);
      r.bar.classList.toggle('lost', lost);
      r.fill.style.width = lost ? '0%' : `${pct}%`;
      r.fill.style.background = healthColor(pct);
      r.fill.classList.toggle('blink', !lost && pct <= 25);
    });
  }
}
