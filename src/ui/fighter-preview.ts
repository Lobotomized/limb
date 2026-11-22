/** Fighter select preview: silhouette (core highlighted), stats and the generated move list. */
import { compileFighter } from '../core/fighter-compile';
import type { FighterDef, MoveDirection } from '../core/schema/fighter-schema';
import { HUD, LAYOUT } from '../render/theme';
import { el } from './dom';
import { buildBodyDiagram } from './hud/body-diagram';

const DIR_GLYPH: Record<MoveDirection, string> = { neutral: '·', forward: '↑ fwd', back: '↓ back', up: '← left', down: '→ right' };

export function moveList(def: FighterDef, available?: (moveIndex: number) => boolean): HTMLElement {
  const list = el('div', 'movelist');
  for (const slot of def.slots) {
    def.moves.forEach((m, i) => {
      if (m.slot !== slot.id) return;
      const disabled = available ? !available(i) : false;
      list.append(el('span', `slot${disabled ? ' disabled' : ''}`, `${slot.id} ${slot.name} ${DIR_GLYPH[m.direction]}`), el('span', disabled ? 'disabled' : '', m.name));
    });
  }
  return list;
}

export function fighterStats(def: FighterDef): HTMLElement {
  const mass = def.parts.reduce((a, p) => a + p.mass, 0);
  const health = def.parts.reduce((a, p) => a + p.maxHealth, 0);
  const core = def.parts.find((p) => p.id === def.corePart);
  const cells = [
    'Parts',
    String(def.parts.length),
    'Total health',
    String(health),
    'Core',
    `${core?.name ?? '?'} (${core?.maxHealth ?? 0})`,
    'Mass',
    `${mass.toFixed(1)} kg`,
    'Speed',
    `${def.locomotion.walkSpeed.toFixed(1)} m/s`,
    'Turn',
    `${def.locomotion.turnSpeed.toFixed(1)} rad/s`,
  ];
  return el('div', 'stats', ...cells.map((c) => el('span', '', c)));
}

export function fighterPreview(def: FighterDef, color: string, tagline?: string): HTMLElement {
  const diagram = buildBodyDiagram(compileFighter(def), { silhouette: color, size: HUD.diagramSize * LAYOUT.previewDiagramScale });
  const card = el('div', 'panel col');
  card.append(el('div', 't-heading', def.name));
  if (tagline) card.append(el('div', 't-caption ink-muted', tagline));
  const art = el('div', 'fighter-card');
  art.append(diagram.el);
  card.append(art, el('div', 't-body ink-muted', def.description), fighterStats(def), el('div', 'divider'), moveList(def));
  return card;
}
