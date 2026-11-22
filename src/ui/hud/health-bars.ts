/**
 * Per-part health bars (pause screen and the "Detailed HUD" setting): 10px tall, health
 * band fill, blinking below 25%; lost parts get a struck-through label and a dashed track.
 * Track LENGTH is proportional to the part's max health on a scale shared by both fighters
 * (`scaleMaxHealth`), so tough parts have visibly longer bars than fragile ones.
 */
import type { CompiledFighter } from '../../core/fighter-compile';
import type { FighterState } from '../../core/state';
import { TOUGHNESS, healthColor } from '../../render/theme';
import { el } from '../dom';

export class HealthBars {
  readonly el = el('div', 'bars');
  private rows: { row: HTMLElement; bar: HTMLElement; fill: HTMLElement; value: HTMLElement; last: string }[] = [];

  constructor(
    private readonly cf: CompiledFighter,
    /** Max health that maps to a full-length track (the toughest part in the match). */
    scaleMaxHealth: number = Math.max(...cf.def.parts.map((p) => p.maxHealth)),
  ) {
    for (const p of cf.def.parts) {
      const fill = el('div', 'fill');
      const bar = el('div', 'bar', fill);
      const share = Math.min(1, p.maxHealth / scaleMaxHealth);
      bar.style.width = `max(calc(var(--u) * ${TOUGHNESS.barMinWidth}px), ${(share * 100).toFixed(2)}%)`;
      const value = el('div', 'value');
      const row = el('div', 'bar-row', el('div', 'name', p.name), el('div', 'track', bar), value);
      this.el.append(row);
      this.rows.push({ row, bar, fill, value, last: '' });
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
      r.value.textContent = lost ? 'lost' : `${p.health}/${this.cf.def.parts[i]!.maxHealth}`;
    });
  }
}
