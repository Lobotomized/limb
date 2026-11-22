/**
 * Fighter discovery. Every folder in src/content/fighters/ with a fighter.json (written by the
 * fighter editor) or a hand-written fighter.ts is a fighter; bot.json|ts and visuals.json|ts
 * are optional companions. A folder may not have both the .json and the .ts of the same file.
 * Fighters are validated at load time and sorted by id so the order is identical on every
 * machine. There is no central list.
 */
import type { BotHintsModule, FighterBotHints, FighterDef, FighterModule, FighterVisuals, VisualsModule } from '../core/schema/fighter-schema';
import { validateFighter } from '../core/schema/validate';
import { discoverAbilities } from '../core/abilities/registry';

const fighterTs = import.meta.glob<FighterModule>('/src/content/fighters/*/fighter.ts', { eager: true });
const visualsTs = import.meta.glob<VisualsModule>('/src/content/fighters/*/visuals.ts', { eager: true });
const botTs = import.meta.glob<BotHintsModule>('/src/content/fighters/*/bot.ts', { eager: true });
const fighterJson = import.meta.glob<FighterDef>('/src/content/fighters/*/fighter.json', { eager: true, import: 'default' });
const visualsJson = import.meta.glob<FighterVisuals>('/src/content/fighters/*/visuals.json', { eager: true, import: 'default' });
const botJson = import.meta.glob<FighterBotHints>('/src/content/fighters/*/bot.json', { eager: true, import: 'default' });

/** Merges .ts modules and .json data into one module map keyed by folder path; both for one folder is an error. */
export function mergeSources<M>(ts: Record<string, M>, json: Record<string, unknown>, wrap: (data: never) => M, file: string): Record<string, M> {
  const out: Record<string, M> = {};
  const tsFolders = new Set(Object.keys(ts).map(folderOf));
  for (const [path, m] of Object.entries(ts)) out[path] = m;
  for (const [path, data] of Object.entries(json)) {
    if (tsFolders.has(folderOf(path))) throw new Error(`${path}: the folder also has ${file}.ts — keep only one of them`);
    out[path] = wrap(structuredClone(data) as never);
  }
  return out;
}

export interface FighterEntry {
  def: FighterDef;
  folder: string;
  visuals: FighterVisuals;
  botHints: FighterBotHints | null;
}

const folderOf = (path: string): string => path.split('/').slice(-2, -1)[0] ?? path;

/** Default bot hints derived from the definition when a fighter has no bot.ts. */
export function defaultBotHints(def: FighterDef): FighterBotHints {
  return { attackMoves: def.moves.map((m) => m.name), guardMoves: [], idealDistance: 1.4, shieldParts: [], reach: 1.2 };
}

/** Loads, validates and sorts a set of fighter modules. Throws with every validation error. */
export function loadFighterModules(
  fighters: Record<string, FighterModule>,
  visuals: Record<string, VisualsModule> = {},
  bots: Record<string, BotHintsModule> = {},
): FighterEntry[] {
  const abilities = discoverAbilities();
  const entries: FighterEntry[] = [];
  const errors: string[] = [];
  const byFolder = <T>(mods: Record<string, T>): Map<string, T> => new Map(Object.entries(mods).map(([p, m]) => [folderOf(p), m] as const));
  const vis = byFolder(visuals);
  const bot = byFolder(bots);
  for (const path of Object.keys(fighters).sort()) {
    const folder = folderOf(path);
    const def = fighters[path]?.fighter;
    if (!def) {
      errors.push(`${path}: must export "fighter"`);
      continue;
    }
    const errs = validateFighter(def, abilities);
    if (def.id !== folder) errs.push(`fighter "${def.id}": id: must match its folder name "${folder}"`);
    if (errs.length) {
      errors.push(...errs);
      continue;
    }
    entries.push({ def, folder, visuals: vis.get(folder)?.visuals ?? {}, botHints: bot.get(folder)?.botHints ?? null });
  }
  if (errors.length) throw new Error(`Invalid fighter definitions:\n  ${errors.join('\n  ')}`);
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.def.id)) throw new Error(`Duplicate fighter id "${e.def.id}"`);
    ids.add(e.def.id);
  }
  return entries.sort((a, b) => (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
}

let cache: FighterEntry[] | null = null;

/** All fighters in src/content/fighters, validated, sorted by id. */
export function allFighters(): FighterEntry[] {
  cache ??= loadFighterModules(
    mergeSources(fighterTs, fighterJson, (fighter: FighterDef) => ({ fighter }), 'fighter'),
    mergeSources(visualsTs, visualsJson, (visuals: FighterVisuals) => ({ visuals }), 'visuals'),
    mergeSources(botTs, botJson, (botHints: FighterBotHints) => ({ botHints }), 'bot'),
  );
  return cache;
}

export function getFighter(id: string): FighterEntry {
  const e = allFighters().find((f) => f.def.id === id);
  if (!e) throw new Error(`Unknown fighter "${id}". Known: ${allFighters().map((f) => f.def.id).join(', ')}`);
  return e;
}

export function botHintsFor(id: string): FighterBotHints {
  const e = getFighter(id);
  return e.botHints ?? defaultBotHints(e.def);
}
