/** Fighter select preview: silhouette (core highlighted), stats and the generated move list. */
import { compileFighter } from '../core/fighter-compile';
import { MOVE_BUTTONS, type FighterDef, type MoveDef } from '../core/schema/fighter-schema';
import { moveButtonHint } from '../input/bindings';
import { HUD, LAYOUT, TOUGHNESS, toughnessTier, type ToughnessTier } from '../render/theme';
import { el, svg } from './dom';
import { buildBodyDiagram } from './hud/body-diagram';

/** The move's button number: "1" .. "6". */
export function moveInputLabel(m: Pick<MoveDef, 'button'>): string {
  return String(m.button);
}

/** The six moves in button order (1-6) with key hints and descriptions. */
export function moveList(def: FighterDef, available?: (moveIndex: number) => boolean): HTMLElement {
  const list = el('div', 'movelist');
  for (const b of MOVE_BUTTONS) {
    const i = def.moves.findIndex((m) => m.button === b);
    const m = def.moves[i];
    if (!m) continue;
    const disabled = available ? !available(i) : false;
    list.append(
      el('span', `slot${disabled ? ' disabled' : ''}`, `${moveInputLabel(m)}  ${moveButtonHint(b)}`),
      el('span', disabled ? 'disabled' : '', el('span', '', m.name), el('span', 'ink-muted', ` — ${m.description}`)),
    );
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

const TIERS: ToughnessTier[] = ['tough', 'medium', 'fragile'];

/** Legend swatch drawn with the same outline style as the parts. */
function swatch(tier: ToughnessTier, color: string): SVGSVGElement {
  const s = TOUGHNESS.legendSwatch;
  const root = svg('svg', { width: s * 2, height: s, viewBox: `0 0 ${s * 2} ${s}` });
  root.classList.add('swatch');
  const rect = { x: 3, y: 3, width: s * 2 - 6, height: s - 6, rx: (s - 6) / 2, fill: color };
  if (tier === 'tough') {
    root.appendChild(svg('rect', { ...rect, stroke: 'currentColor', 'stroke-width': TOUGHNESS.stroke.tough + TOUGHNESS.innerGap }));
    root.appendChild(svg('rect', { ...rect, fill: 'none', stroke: color, 'stroke-width': TOUGHNESS.innerGap * 0.7 }));
  } else root.appendChild(svg('rect', { ...rect, stroke: 'currentColor', 'stroke-width': TOUGHNESS.stroke[tier] }));
  return root;
}

/** Part name without side/position words or numbers: "Left upper arm" -> "Upper arm". */
function partType(name: string): string {
  const t = name.replace(/\b(left|right|front|rear|back|side|flank)\b/gi, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : name;
}

/** Legend + every part's max health, grouped by toughness tier (toughest first). */
export function toughnessList(def: FighterDef, color: string): HTMLElement {
  const box = el('div', 'toughness');
  const range: Record<ToughnessTier, string> = {
    tough: `${TOUGHNESS.toughMin}+ HP`,
    medium: `${TOUGHNESS.fragileMax + 1}–${TOUGHNESS.toughMin - 1} HP`,
    fragile: `≤ ${TOUGHNESS.fragileMax} HP`,
  };
  for (const tier of TIERS) {
    const parts = def.parts.filter((p) => toughnessTier(p.maxHealth) === tier).sort((a, b) => b.maxHealth - a.maxHealth);
    if (!parts.length) continue;
    // Mirrored/repeated parts are summarized by type: "Upper arm ×2 80", "Base ×8 21".
    const groups = new Map<string, { name: string; hp: number; n: number }>();
    for (const p of parts) {
      const type = partType(p.name);
      const key = `${type}|${p.maxHealth}`;
      const g = groups.get(key);
      if (g) g.n++;
      else groups.set(key, { name: type, hp: p.maxHealth, n: 1 });
    }
    const text = [...groups.values()].map((g) => (g.n > 1 ? `${g.name} ×${g.n} ${g.hp}` : `${g.name} ${g.hp}`)).join(' · ');
    box.append(el('div', 'toughness-row', swatch(tier, color), el('span', 't-hud-label', `${TOUGHNESS.labels[tier]} (${range[tier]})`), el('span', 't-caption ink-muted', text)));
  }
  return box;
}

export function fighterPreview(def: FighterDef, color: string, tagline?: string): HTMLElement {
  const diagram = buildBodyDiagram(compileFighter(def), { silhouette: color, size: HUD.diagramSize * LAYOUT.previewDiagramScale, toughness: true });
  const card = el('div', 'panel col');
  card.append(el('div', 't-heading', def.name));
  if (tagline) card.append(el('div', 't-caption ink-muted', tagline));
  const art = el('div', 'fighter-card');
  art.append(diagram.el);
  card.append(art, el('div', 't-body ink-muted', def.description), toughnessList(def, color), fighterStats(def), el('div', 'divider'), moveList(def));
  return card;
}
