/**
 * Limb Clash design system tokens. Rendering and UI code read every color, size, font,
 * spacing, radius, stroke, opacity, shadow and effect value from here — never literals.
 * Sizes are px at 1080p; the UI scales with window height (see uiScale()).
 */

export const COLOR = {
  bg900: '#111318', // app and arena surround
  bg800: '#1a1d24', // HUD panels, menus, overlays
  bg700: '#252933', // idle buttons, cards; "drained" mix color for damaged parts
  bg600: '#313642', // hover/focused surfaces
  line: '#3a3f4b', // hairlines, dividers
  ink: '#f2efe8', // primary text
  inkMuted: '#a3a7b3', // secondary text, labels
  inkFaint: '#6b7080', // disabled text only
  p1: '#ff9f1c',
  p1Soft: '#3a2a12',
  p2: '#3aa0ff',
  p2Soft: '#11283d',
  core: '#ffe9a8', // core ring and glow only (reserved)
  spark: '#ffe9a8',
  impact: '#ffffff',
  danger: '#ff4d6d',
  focus: '#f2efe8',
  health100: '#f2efe8', // 76-100%
  health75: '#cdbdf7', // 51-75%
  health50: '#a283f0', // 26-50%
  health25: '#7b4ee0', // 1-25% (blinking)
  healthTrack: '#0b0c10',
  arenaFloor: '#1c2029',
  arenaWall: '#4a5162',
  arenaWallEdge: '#6b7385',
} as const;

export type ColorToken = keyof typeof COLOR;

/** '#rrggbb' -> 0xrrggbb for PixiJS. */
export function hex(c: string): number {
  return parseInt(c.slice(1), 16);
}

/** Linear mix of two '#rrggbb' colors (t = 0 -> a, 1 -> b), returned as a number. */
export function mixHex(a: string, b: string, t: number): number {
  const x = hex(a);
  const y = hex(b);
  const ch = (v: number, s: number): number => (v >> s) & 0xff;
  const m = (s: number): number => Math.round(ch(x, s) + (ch(y, s) - ch(x, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Slightly lighter version of a color (outline of parts). */
export function lighten(c: string, t: number): number {
  return mixHex(c, COLOR.ink, t);
}

export const PLAYER = [
  { color: COLOR.p1, soft: COLOR.p1Soft, marker: '▲', tag: 'P1', markerShape: 'triangle' as const },
  { color: COLOR.p2, soft: COLOR.p2Soft, marker: '●', tag: 'P2', markerShape: 'circle' as const },
] as const;

export const FONT = {
  display: '"Chakra Petch", "Segoe UI", sans-serif',
  text: 'Inter, "Segoe UI", sans-serif',
} as const;

export interface TypeStyle {
  font: keyof typeof FONT;
  size: number;
  /** Unitless multiplier or px when > 3. */
  lineHeight: number;
  weight: number;
  letterSpacing?: number; // em
  uppercase?: boolean;
}

export const TYPE = {
  title: { font: 'display', size: 72, lineHeight: 0.95, weight: 700 },
  banner: { font: 'display', size: 56, lineHeight: 1, weight: 700, letterSpacing: 0.02 },
  heading: { font: 'display', size: 28, lineHeight: 1.1, weight: 600 },
  hudLabel: { font: 'text', size: 13, lineHeight: 16, weight: 600, letterSpacing: 0.08, uppercase: true },
  hudValue: { font: 'display', size: 20, lineHeight: 24, weight: 700 },
  damage: { font: 'display', size: 28, lineHeight: 1, weight: 700 },
  body: { font: 'text', size: 16, lineHeight: 24, weight: 400 },
  caption: { font: 'text', size: 13, lineHeight: 18, weight: 400 },
} as const satisfies Record<string, TypeStyle>;

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 } as const;
export const RADIUS = { none: 0, sm: 3, md: 6, joint: 999 } as const;
export const STROKE = { hairline: 1, part: 3, core: 4, focus: 3 } as const;
export const OPACITY = { detached: 0.55, disabled: 0.4 } as const;
export const SHADOW = {
  panel: '0 8px 24px rgba(0,0,0,0.45)',
  coreGlow: { blur: 16, color: COLOR.core, alpha: 0.6 },
} as const;

/** Damage states of a part by health share. `mix` = fill mixed toward bg700. */
export const DAMAGE_STATES = [
  { minPct: 76, mix: 0, cracks: 0, blink: false },
  { minPct: 51, mix: 0.25, cracks: 1, blink: false },
  { minPct: 26, mix: 0.5, cracks: 3, blink: false },
  { minPct: 0, mix: 0.7, cracks: 4, blink: true },
] as const;

/**
 * Toughness tiers by a part's MAX health (absolute, comparable across fighters). Shown with
 * outline weight, never with fill lightness (lightness is reserved for damage).
 *   fragile: thin outline · medium: normal outline · tough: double outline
 */
export type ToughnessTier = 'fragile' | 'medium' | 'tough';
export const TOUGHNESS = {
  /** maxHealth at or below this is fragile. */
  fragileMax: 40,
  /** maxHealth at or above this is tough. */
  toughMin: 100,
  /** Outline widths (px) per tier; tough also gets an inner line. */
  stroke: { fragile: 1, medium: 3, tough: 3 } as Record<ToughnessTier, number>,
  innerStroke: 2,
  innerGap: 5,
  /** Arena inner rim of tough parts: dark line for contrast on any player color. */
  innerColor: COLOR.bg900,
  innerAlpha: 0.8,
  labels: { fragile: 'Fragile', medium: 'Medium', tough: 'Tough' } as Record<ToughnessTier, string>,
  /** Diagram parts smaller than this (px radius) get no HP label (listed instead). */
  minLabelRadiusPx: 9,
  labelSize: 10,
  labelOutline: 3,
  /** Legend swatch height (px). */
  legendSwatch: 18,
  /** Health bar track length (px at 1080p) for the toughest part in the match. */
  barMaxWidth: 240,
  barMinWidth: 6,
} as const;

export function toughnessTier(maxHealth: number): ToughnessTier {
  if (maxHealth <= TOUGHNESS.fragileMax) return 'fragile';
  if (maxHealth >= TOUGHNESS.toughMin) return 'tough';
  return 'medium';
}

/** Health band color for bars and the body diagram. */
export function healthColor(pct: number): string {
  if (pct > 75) return COLOR.health100;
  if (pct > 50) return COLOR.health75;
  if (pct > 25) return COLOR.health50;
  return COLOR.health25;
}

/** Fighter drawing in the arena. */
export const FIGHTER_STYLE = {
  outlineLighten: 0.25, // outline = player color mixed 25% toward ink
  jointRadius: 5, // px at 1x zoom-normalized (see renderer)
  crackWidth: 2,
  crackColor: COLOR.bg900,
  blinkHz: 4,
  coreRingGap: 4, // px outside the part
  corePulseMinHz: 0.6,
  corePulseMaxHz: 4,
  markerSize: 12, // px
  markerGap: 10, // px above the core
  markerOutline: 2,
  facingChevronSize: 9,
  facingChevronGap: 8,
  debrisVisibleMs: 2000,
  debrisFadeMs: 1000,
} as const;

/** Health numbers drawn on parts in the arena (px at 1080p; scales with zoom, clamped). */
export const PART_LABEL = {
  size: 11,
  minSize: 9,
  maxSize: 13,
  /** Font px per meter of zoom (so labels shrink when the camera zooms out). */
  sizePerMeter: 0.11,
  weight: 600,
  outline: 3,
  /** Labels closer than this many font sizes count as overlapping. */
  minSpacing: 2,
  /** How far (share of the shape's half-extent) a label may shift to avoid an overlap. */
  spotShift: 0.75,
} as const;

/** Combat feedback scales linearly from minimum damage (1) to a big hit. */
export const FX = {
  bigHitDamage: 30,
  flashAlpha: [0.4, 1] as const,
  flashFrames: [1, 2] as const,
  sparks: [4, 24] as const,
  sparkLifeMs: 250,
  sparkSpeed: [120, 420] as const, // px/s
  sparkSize: 3,
  shakePx: [0, 8] as const,
  shakeDecayMs: 200,
  damageNumberScale: [1, 1.5] as const,
  damageNumberRisePx: 24,
  damageNumberMs: 600,
  partLostSparks: 16,
  coreFlashAlpha: 0.3,
  coreFlashMs: 300,
  reducedShakeFlashCap: 0.4,
} as const;

export const HUD = {
  panelTopBorder: 4,
  panelWidth: 300,
  diagramSize: 112,
  pipSize: 12,
  pipBorder: 2,
  toastMs: 2000,
  barHeight: 10,
  barAnimMs: 150,
  barBlinkHz: 2,
  bannerMs: 900,
  bannerSlideMs: 120,
  bannerRule: 2,
} as const;

export const ARENA_STYLE = {
  gridAlpha: 0.05,
  gridStep: 1, // meters
  wallEdgeWidth: 2,
  ringLineWidth: 4,
  ringBandWidth: 24,
  ringBandAlpha: 0.15,
  ringPulseBodyLengths: 3,
  ringPulseHz: 2,
} as const;

export const CAMERA = {
  /** Screen margin around both fighters, px at 1080p. */
  fighterMarginPx: 220,
  smoothing: 6, // 1/s
  maxZoomPxPerMeter: 210,
} as const;

export const MENU = {
  buttonMinWidth: 320,
  menuWidth: 440,
  wideMenuWidth: 760,
  focusOffset: 3,
  screenMargin: SPACE[12],
  scrimAlpha: 0.82,
  buttonText: 20,
  buttonLine: 24,
  codeInputWidth: 220,
  codeLetterSpacing: 0.2,
} as const;

/** Misc UI layout sizes (px at 1080p). */
export const LAYOUT = {
  fighterCardWidth: 260,
  fighterArtHeight: 180,
  barLabelWidth: 120,
  barLabelSize: 11,
  toastMinHeight: 16,
  sandboxWidth: 360,
  sandboxInputWidth: 90,
  /** Fighter editor: outline (left) and inspector (right) panel widths, top bar height. */
  editorOutlineWidth: 300,
  editorInspectorWidth: 420,
  editorTopHeight: 52,
  editorLabelWidth: 150,
  previewDiagramScale: 1.5,
  resultsRows: 6,
  toughnessLabelWidth: 190,
  barValueWidth: 64,
} as const;

/** UI scale: 1 at 1080p window height, times the user's UI scale setting. */
export function uiScale(windowHeight: number, userScale = 1): number {
  return (windowHeight / 1080) * userScale;
}

/** Linear interpolation of an effect range by hit damage (1 .. FX.bigHitDamage). */
export function fxScale(range: readonly [number, number], damage: number): number {
  const t = Math.max(0, Math.min(1, (damage - 1) / (FX.bigHitDamage - 1)));
  return range[0] + (range[1] - range[0]) * t;
}
