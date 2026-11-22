/**
 * The UI stylesheet, generated from theme tokens (no literals here either). Every size is
 * multiplied by --u, the UI scale (window height / 1080 x the user's UI scale setting).
 */
import { COLOR, FONT, HUD, LAYOUT, MENU, TOUGHNESS, OPACITY, RADIUS, SHADOW, SPACE, STROKE, TYPE, type TypeStyle } from '../render/theme';

const u = (n: number): string => `calc(var(--u) * ${n}px)`;

function type(t: TypeStyle): string {
  const lh = t.lineHeight > 3 ? u(t.lineHeight) : String(t.lineHeight);
  return `font-family:${FONT[t.font]};font-size:${u(t.size)};line-height:${lh};font-weight:${t.weight};${t.letterSpacing ? `letter-spacing:${t.letterSpacing}em;` : ''}${t.uppercase ? 'text-transform:uppercase;' : ''}`;
}

export function buildStylesheet(): string {
  return `
:root { --u: 1; }
.lc-root { position: fixed; inset: 0; pointer-events: none; color: ${COLOR.ink}; ${type(TYPE.body)} user-select: none; }
.lc-root * { box-sizing: border-box; }
.lc-layer { position: absolute; inset: 0; }
.lc-interactive { pointer-events: auto; }

/* ---------------------------------------------------------------- type */
.t-title { ${type(TYPE.title)} }
.t-banner { ${type(TYPE.banner)} text-transform: uppercase; }
.t-heading { ${type(TYPE.heading)} }
.t-hud-label { ${type(TYPE.hudLabel)} }
.t-hud-value { ${type(TYPE.hudValue)} }
.t-body { ${type(TYPE.body)} }
.t-caption { ${type(TYPE.caption)} }
.ink-muted { color: ${COLOR.inkMuted}; }
.ink-faint { color: ${COLOR.inkFaint}; }
.c-p1 { color: ${COLOR.p1}; }
.c-p2 { color: ${COLOR.p2}; }
.c-danger { color: ${COLOR.danger}; }
.c-core { color: ${COLOR.core}; }

/* ---------------------------------------------------------------- screens & menus */
.screen { position: absolute; inset: 0; background: ${COLOR.bg900}; padding: ${u(MENU.screenMargin)}; display: flex; flex-direction: column; gap: ${u(SPACE[6])}; pointer-events: auto; overflow: hidden; }
.screen.overlay { background: transparent; }
.scrim { position: absolute; inset: 0; background: ${COLOR.bg900}; opacity: ${MENU.scrimAlpha}; }
.screen > .content { position: relative; display: flex; flex-direction: column; gap: ${u(SPACE[6])}; flex: 1; min-height: 0; }
.row { display: flex; gap: ${u(SPACE[6])}; }
.col { display: flex; flex-direction: column; gap: ${u(SPACE[3])}; }
.grow { flex: 1; min-height: 0; }
.panel { background: ${COLOR.bg800}; border-radius: ${u(RADIUS.md)}; padding: ${u(SPACE[6])}; box-shadow: ${SHADOW.panel}; }
.card { background: ${COLOR.bg700}; border-radius: ${u(RADIUS.md)}; padding: ${u(SPACE[4])}; }
.divider { height: ${u(STROKE.hairline)}; background: ${COLOR.line}; }
.menu { display: flex; flex-direction: column; gap: ${u(SPACE[3])}; min-width: ${u(MENU.buttonMinWidth)}; width: ${u(MENU.menuWidth)}; flex: none; align-self: flex-start; }
.menu.wide { width: ${u(MENU.wideMenuWidth)}; }
.btn { position: relative; display: flex; align-items: center; justify-content: space-between; gap: ${u(SPACE[4])};
  background: ${COLOR.bg700}; color: ${COLOR.ink}; border: none; border-radius: ${u(RADIUS.sm)};
  padding: ${u(SPACE[3])} ${u(SPACE[4])}; ${type({ ...TYPE.heading, size: MENU.buttonText, lineHeight: MENU.buttonLine })} text-transform: uppercase; text-align: left; cursor: pointer; outline: none; }
.btn .arrow { visibility: hidden; }
.btn.focused { background: ${COLOR.bg600}; box-shadow: 0 0 0 ${u(MENU.focusOffset)} ${COLOR.bg900}, 0 0 0 ${u(MENU.focusOffset + STROKE.focus)} ${COLOR.focus}; }
.btn.focused .arrow { visibility: visible; }
.btn.focused.destructive { box-shadow: 0 0 0 ${u(MENU.focusOffset)} ${COLOR.bg900}, 0 0 0 ${u(MENU.focusOffset + STROKE.focus)} ${COLOR.danger}; }
.btn.disabled { opacity: ${OPACITY.disabled}; cursor: default; }
.btn .reason { ${type(TYPE.caption)} color: ${COLOR.inkMuted}; text-transform: none; }
.btn .value { ${type(TYPE.body)} color: ${COLOR.inkMuted}; text-transform: none; }
.prompts { display: flex; gap: ${u(SPACE[6])}; ${type(TYPE.caption)} color: ${COLOR.inkMuted}; }
.prompts .glyph { color: ${COLOR.ink}; font-weight: 600; margin-right: ${u(SPACE[1])}; }
.input { background: ${COLOR.bg900}; color: ${COLOR.ink}; border: ${u(STROKE.hairline)} solid ${COLOR.line}; border-radius: ${u(RADIUS.sm)}; padding: ${u(SPACE[2])} ${u(SPACE[3])}; ${type(TYPE.heading)} letter-spacing: ${MENU.codeLetterSpacing}em; text-transform: uppercase; width: ${u(MENU.codeInputWidth)}; }
.pick-grid { display: flex; gap: ${u(SPACE[4])}; flex-wrap: wrap; }
.fighter-card { width: ${u(LAYOUT.fighterCardWidth)}; display: flex; flex-direction: column; gap: ${u(SPACE[2])}; align-items: stretch; }
.fighter-card svg { width: 100%; height: ${u(LAYOUT.fighterArtHeight)}; }
.movelist { display: grid; grid-template-columns: auto 1fr; column-gap: ${u(SPACE[4])}; row-gap: ${u(SPACE[1])}; ${type(TYPE.caption)} }
.movelist .slot { color: ${COLOR.inkMuted}; }
.movelist .disabled { opacity: ${OPACITY.disabled}; }
.toughness { display: flex; flex-direction: column; gap: ${u(SPACE[1])}; }
.toughness-row { display: grid; grid-template-columns: ${u(TOUGHNESS.legendSwatch * 2)} ${u(LAYOUT.toughnessLabelWidth)} 1fr; gap: ${u(SPACE[3])}; align-items: center; }
.toughness-row .swatch { width: ${u(TOUGHNESS.legendSwatch * 2)}; height: ${u(TOUGHNESS.legendSwatch)}; color: ${COLOR.ink}; }
.stats { ${type(TYPE.caption)} color: ${COLOR.inkMuted}; display: grid; grid-template-columns: auto auto; column-gap: ${u(SPACE[4])}; }

/* ---------------------------------------------------------------- HUD */
.hud-panel { position: absolute; top: ${u(SPACE[6])}; width: ${u(HUD.panelWidth)}; background: ${COLOR.bg800}; border-radius: ${u(RADIUS.sm)};
  border-top: ${u(HUD.panelTopBorder)} solid; box-shadow: ${SHADOW.panel}; padding: ${u(SPACE[3])} ${u(SPACE[4])}; display: flex; flex-direction: column; gap: ${u(SPACE[2])}; }
.hud-panel.p1 { left: ${u(SPACE[6])}; border-top-color: ${COLOR.p1}; }
.hud-panel.p2 { right: ${u(SPACE[6])}; border-top-color: ${COLOR.p2}; }
.hud-panel.p2 .hud-head { flex-direction: row-reverse; }
.hud-panel.p2 .hud-row { flex-direction: row-reverse; }
.hud-head { display: flex; justify-content: space-between; align-items: baseline; }
.hud-row { display: flex; gap: ${u(SPACE[3])}; align-items: center; }
.hud-diagram { width: ${u(HUD.diagramSize)}; height: ${u(HUD.diagramSize)}; flex: none; }
.hud-side { display: flex; flex-direction: column; gap: ${u(SPACE[2])}; flex: 1; min-width: 0; }
.pips { display: flex; gap: ${u(SPACE[2])}; }
.pip { width: ${u(HUD.pipSize)}; height: ${u(HUD.pipSize)}; transform: rotate(45deg); border: ${u(HUD.pipBorder)} solid; }
.toast { min-height: ${u(LAYOUT.toastMinHeight)}; }
.round-counter { position: absolute; top: ${u(SPACE[6])}; left: 50%; transform: translateX(-50%); ${type(TYPE.hudValue)} color: ${COLOR.ink}; }
.net-status { position: absolute; bottom: ${u(SPACE[4])}; right: ${u(SPACE[6])}; ${type(TYPE.caption)} color: ${COLOR.inkMuted}; }
.net-alert { position: absolute; bottom: ${u(SPACE[12])}; left: 50%; transform: translateX(-50%); ${type(TYPE.hudLabel)} color: ${COLOR.danger}; background: ${COLOR.bg800}; padding: ${u(SPACE[2])} ${u(SPACE[4])}; border-radius: ${u(RADIUS.sm)}; }
.bars { display: flex; flex-direction: column; gap: ${u(SPACE[1])}; }
.bar-row { display: grid; grid-template-columns: ${u(LAYOUT.barLabelWidth)} minmax(0, ${u(TOUGHNESS.barMaxWidth)}) ${u(LAYOUT.barValueWidth)}; gap: ${u(SPACE[2])}; align-items: center; }
.bar-row .name { ${type(TYPE.hudLabel)} color: ${COLOR.inkMuted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: ${u(LAYOUT.barLabelSize)}; }
.bar-row.lost .name { text-decoration: line-through; color: ${COLOR.inkFaint}; }
.bar-row .value { ${type(TYPE.caption)} color: ${COLOR.inkMuted}; text-align: right; font-variant-numeric: tabular-nums; }
.bar-row .track { display: flex; }
.bar { height: ${u(HUD.barHeight)}; background: ${COLOR.healthTrack}; border-radius: ${u(RADIUS.sm)}; overflow: hidden; }
.bar.lost { background: transparent; border: ${u(STROKE.hairline)} dashed ${COLOR.inkFaint}; }
.bar .fill { height: 100%; transition: width ${HUD.barAnimMs}ms linear; }
.bar .fill.blink { animation: lc-blink ${1000 / HUD.barBlinkHz}ms steps(1) infinite; }
@keyframes lc-blink { 50% { opacity: 0.25; } }

/* ---------------------------------------------------------------- banners */
.banner { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); background: ${COLOR.bg900};
  border-top: ${u(HUD.bannerRule)} solid; border-bottom: ${u(HUD.bannerRule)} solid; padding: ${u(SPACE[4])} 0;
  display: flex; flex-direction: column; align-items: center; gap: ${u(SPACE[1])}; animation: lc-slide ${HUD.bannerSlideMs}ms ease-out; }
.banner .sub { ${type(TYPE.hudValue)} }
@keyframes lc-slide { from { transform: translate(-100%, -50%); } to { transform: translate(0, -50%); } }

/* ---------------------------------------------------------------- sandbox */
.sandbox-panel { position: absolute; top: ${u(SPACE[6])}; right: ${u(SPACE[6])}; width: ${u(LAYOUT.sandboxWidth)}; max-height: calc(100% - ${u(SPACE[12])}); overflow: auto; }
.sandbox-panel label { display: grid; grid-template-columns: 1fr ${u(LAYOUT.sandboxInputWidth)}; gap: ${u(SPACE[2])}; ${type(TYPE.caption)} align-items: center; }
.sandbox-panel input { background: ${COLOR.bg900}; color: ${COLOR.ink}; border: ${u(STROKE.hairline)} solid ${COLOR.line}; border-radius: ${u(RADIUS.sm)}; padding: ${u(SPACE[1])}; ${type(TYPE.caption)} }
.sandbox-log { ${type(TYPE.caption)} color: ${COLOR.inkMuted}; white-space: pre; }

/* ---------------------------------------------------------------- fighter editor (dev) */
.editor { position: absolute; inset: 0; pointer-events: none; user-select: text; }
.editor > * { pointer-events: auto; }
.ed-top { position: absolute; top: 0; left: 0; right: 0; height: ${u(LAYOUT.editorTopHeight)}; display: flex; align-items: center; gap: ${u(SPACE[2])};
  padding: 0 ${u(SPACE[4])}; background: ${COLOR.bg800}; box-shadow: ${SHADOW.panel}; }
.ed-panel { position: absolute; top: calc(${u(LAYOUT.editorTopHeight)} + ${u(SPACE[2])}); bottom: ${u(SPACE[2])}; overflow: auto; background: ${COLOR.bg800};
  border-radius: ${u(RADIUS.md)}; box-shadow: ${SHADOW.panel}; padding: ${u(SPACE[3])}; ${type(TYPE.caption)} }
.ed-left { left: ${u(SPACE[2])}; width: ${u(LAYOUT.editorOutlineWidth)}; }
.ed-right { right: ${u(SPACE[2])}; width: ${u(LAYOUT.editorInspectorWidth)}; }
.ed-heading { ${type(TYPE.hudLabel)} color: ${COLOR.inkMuted}; margin: ${u(SPACE[3])} 0 ${u(SPACE[1])}; }
.ed-item { padding: ${u(SPACE[1])} ${u(SPACE[2])}; border-radius: ${u(RADIUS.sm)}; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ed-item:hover { background: ${COLOR.bg700}; }
.ed-item.active { background: ${COLOR.bg600}; box-shadow: inset ${u(STROKE.focus)} 0 0 ${COLOR.focus}; }
.ed-item-title { ${type(TYPE.hudValue)} }
.ed-problem { padding: ${u(SPACE[1])} ${u(SPACE[2])}; color: ${COLOR.inkMuted}; cursor: pointer; border-radius: ${u(RADIUS.sm)}; }
.ed-problem.bad { color: ${COLOR.danger}; }
.ed-problem:hover { background: ${COLOR.bg700}; }
.ed-status { flex: 1; text-align: right; color: ${COLOR.inkMuted}; ${type(TYPE.caption)} }
.ed-status.bad { color: ${COLOR.danger}; }
.ed-stack { display: flex; flex-direction: column; gap: ${u(SPACE[2])}; }
.ed-section { display: flex; flex-direction: column; gap: ${u(SPACE[2])}; padding-bottom: ${u(SPACE[3])}; margin-bottom: ${u(SPACE[3])}; border-bottom: ${u(STROKE.hairline)} solid ${COLOR.line}; }
.ed-section-title { ${type(TYPE.hudLabel)} }
.ed-row { display: grid; grid-template-columns: ${u(LAYOUT.editorLabelWidth)} 1fr; gap: ${u(SPACE[2])}; align-items: center; }
.ed-label { color: ${COLOR.inkMuted}; }
.ed-controls { display: flex; gap: ${u(SPACE[2])}; align-items: center; min-width: 0; }
.ed-field { display: flex; flex-direction: column; gap: ${u(SPACE[1])}; }
.ed-num, .ed-text, .ed-select { background: ${COLOR.bg900}; color: ${COLOR.ink}; border: ${u(STROKE.hairline)} solid ${COLOR.line}; border-radius: ${u(RADIUS.sm)};
  padding: ${u(SPACE[1])} ${u(SPACE[2])}; ${type(TYPE.caption)} min-width: 0; }
.ed-num { width: ${u(LAYOUT.sandboxInputWidth)}; flex: none; }
.ed-text { flex: 1; width: 100%; resize: vertical; }
.ed-text.invalid { border-color: ${COLOR.danger}; }
.ed-text:disabled { opacity: ${OPACITY.disabled}; }
.ed-slider { flex: 1; min-width: 0; accent-color: ${COLOR.focus}; }
.ed-check { accent-color: ${COLOR.focus}; }
.ed-error { color: ${COLOR.danger}; ${type(TYPE.caption)} }
.ed-error:empty { display: none; }
.ed-checklist { display: grid; grid-template-columns: 1fr 1fr; gap: ${u(SPACE[1])} ${u(SPACE[2])}; }
.ed-check-item { display: flex; gap: ${u(SPACE[1])}; align-items: center; }
.ed-buttons { display: flex; flex-wrap: wrap; gap: ${u(SPACE[2])}; }
.ed-btn { background: ${COLOR.bg700}; color: ${COLOR.ink}; border: ${u(STROKE.hairline)} solid ${COLOR.line}; border-radius: ${u(RADIUS.sm)};
  padding: ${u(SPACE[1])} ${u(SPACE[3])}; ${type(TYPE.caption)} cursor: pointer; }
.ed-btn:hover:not(:disabled) { background: ${COLOR.bg600}; }
.ed-btn:disabled { opacity: ${OPACITY.disabled}; cursor: default; }
.ed-btn.primary { border-color: ${COLOR.focus}; }
.ed-btn.danger { color: ${COLOR.danger}; }
.ed-btn.small { padding: 0 ${u(SPACE[2])}; }
.ed-point { display: grid; grid-template-columns: 1fr 1fr auto; gap: ${u(SPACE[2])}; align-items: center; }
.ed-point .ed-row { grid-template-columns: auto 1fr; }
.ed-target { display: flex; flex-direction: column; gap: ${u(SPACE[1])}; padding: ${u(SPACE[2])}; border: ${u(STROKE.hairline)} solid ${COLOR.line}; border-radius: ${u(RADIUS.sm)}; }
.ed-phases { display: flex; flex-direction: column; gap: ${u(SPACE[1])}; }
.ed-phase-head { padding: ${u(SPACE[1])} ${u(SPACE[2])}; background: ${COLOR.bg700}; border-radius: ${u(RADIUS.sm)}; cursor: pointer; }
.ed-phase-head.active { background: ${COLOR.bg600}; box-shadow: inset ${u(STROKE.focus)} 0 0 ${COLOR.focus}; }
.ed-phase { display: flex; flex-direction: column; gap: ${u(SPACE[2])}; padding: ${u(SPACE[2])} 0 ${u(SPACE[2])} ${u(SPACE[3])}; }
`;
}

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  const style = document.createElement('style');
  style.textContent = buildStylesheet();
  document.head.appendChild(style);
  injected = true;
}

export function setUiScale(root: HTMLElement, scale: number): void {
  root.style.setProperty('--u', String(scale));
}
