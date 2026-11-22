/**
 * Fighter select: each player picks in turn (any device). The preview is generated from the
 * definition: silhouette with the core highlighted, stats and the move list.
 */
import { PLAYER } from '../../render/theme';
import { el } from '../dom';
import { fighterPreview } from '../fighter-preview';
import type { UiHost } from './host';

export function fighterSelect(host: UiHost, players: number[], done: (ids: string[]) => void, labels?: string[]) {
  const picks: string[] = [];
  const heading = el('div', 't-heading');
  const previewHost = el('div', 'grow');
  let lastFocus = -1;
  const current = (): number => players[picks.length] ?? 0;
  const s = host.screen(
    host.fighters.map((f) => ({
      label: f.def.name,
      action: () => {
        picks.push(f.def.id);
        if (picks.length >= players.length) done(picks.slice());
        else {
          lastFocus = -1;
          s.refresh();
        }
      },
    })),
    {
      onBack: () => {
        if (picks.length) {
          picks.pop();
          lastFocus = -1;
        } else host.pop();
      },
      onFrame: () => {
        const p = current();
        const pl = PLAYER[p]!;
        const who = labels?.[picks.length] ? ` (${labels[picks.length]})` : '';
        heading.textContent = `${p === 0 ? `${pl.marker} ${pl.tag}` : `${pl.tag} ${pl.marker}`}${who} — choose a fighter`;
        heading.style.color = pl.color;
        if (s.focus !== lastFocus) {
          lastFocus = s.focus;
          const f = host.fighters[s.focus];
          previewHost.replaceChildren(f ? fighterPreview(f.def, pl.color, f.visuals.tagline) : el('div'));
        }
      },
    },
  );
  s.content.append(heading, el('div', 'row grow', s.menu, previewHost), s.prompts);
  return s;
}
