/** Results: winner, rounds, damage dealt per part, rematch / menu. */
import type { SimState } from '../../core/state';
import { LAYOUT, PLAYER } from '../../render/theme';
import { el } from '../dom';
import type { UiHost } from './host';

export function resultsScreen(host: UiHost, sim: SimState, canRematch: boolean) {
  const g = sim.game;
  const w = g.matchWinner;
  const pl = PLAYER[w] ?? PLAYER[0]!;
  const s = host.screen(
    [
      { label: 'Rematch', action: () => host.rematch(), disabled: () => (canRematch ? null : 'Opponent left') },
      { label: 'Main menu', action: () => host.toMainMenu() },
    ],
    { onBack: () => host.toMainMenu() },
  );
  const table = (i: number): HTMLElement => {
    const def = sim.ctx.defs[i]!;
    const f = g.fighters[i]!;
    const rows = def.parts
      .map((p, k) => ({ name: p.name, dealt: f.stats.dealtByPart[k] ?? 0, taken: f.stats.takenByPart[k] ?? 0 }))
      .sort((a, b) => b.dealt - a.dealt)
      .slice(0, LAYOUT.resultsRows);
    const grid = el('div', 'stats', el('span', 't-hud-label', 'Part'), el('span', 't-hud-label', 'Dealt / taken'));
    for (const r of rows) grid.append(el('span', '', r.name), el('span', '', `${r.dealt} / ${r.taken}`));
    const p = PLAYER[i]!;
    return el('div', 'panel col', el('div', `t-hud-value c-p${i + 1}`, `${p.marker} ${p.tag} · ${def.name}`), el('div', 't-caption ink-muted', `${f.stats.dashes} dashes`), grid);
  };
  const head = el('div', 't-banner', `${pl.marker} ${pl.tag} wins`);
  head.style.color = pl.color;
  s.content.append(head, el('div', 't-hud-value', `${g.wins[0]} – ${g.wins[1]}`), el('div', 'row', s.menu, table(0), table(1)), el('div', 'grow'), s.prompts);
  return s;
}
