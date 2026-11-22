/**
 * Fighter editor (dev builds): edit a fighter's parts, joints, six moves and bot hints with a
 * live physics preview, validation as you type, undo/redo, and save to
 * src/content/fighters/<id>/*.json through the dev server (POST /__editor/save).
 *
 * Left: outline (fighter, body tree, the six moves, bot hints) + problems. Right: inspector.
 * Center: the fighter in a small walled test pen next to a passive dummy. P1 controls work in
 * the preview; ▶ plays a move. Click a part to select it. The selected part's joint shows its
 * anchor, limits and idle angle; a selected move phase shows its pose as a ghost.
 */
import { Graphics, type Application } from 'pixi.js';
import { discoverAbilities } from '../core/abilities/registry';
import { posesFor } from '../core/fighter';
import { ATTACK_BUTTONS, emptyInput, type InputFrame } from '../core/input-frame';
import { FixedTickLoop } from '../core/loop';
import { cos, sin } from '../core/math';
import type { ArenaDef } from '../core/schema/arena-schema';
import type { MovePhase, PartDef } from '../core/schema/fighter-schema';
import { MOVE_BUTTONS } from '../core/schema/fighter-schema';
import { validateFighter } from '../core/schema/validate';
import { createMatch, step } from '../core/simulation';
import type { SimState } from '../core/state';
import { defaultTuning } from '../core/tuning';
import type { InputDevices } from '../input/devices';
import type { FighterEntry } from '../registry/fighters';
import { captureFrame, interpolate, type RenderFrame } from '../render/frame';
import type { ArenaView } from '../render/renderer';
import { shapePath } from '../render/shapes';
import { COLOR, hex, uiScale } from '../render/theme';
import { el } from '../ui/dom';
import { moveInputLabel } from '../ui/fighter-preview';
import { convertShape, hitSize } from './geometry';
import { button, checkField, checklist, numberField, section, selectField, textField, type FieldHooks } from './fields';
import {
  addPart,
  defaultHints,
  deletePart,
  docFiles,
  hintWarnings,
  History,
  ID_RE,
  mirrorPart,
  MOVE_INPUTS,
  moveFor,
  newFighterFrom,
  parentJointOf,
  previewBlockers,
  partIndex,
  partTree,
  renameJoint,
  renameMove,
  renamePart,
  selectionForError,
  setCorePart,
  subtreeIds,
  type EditorDoc,
  type Selection,
} from './model';

export interface EditorHost {
  readonly app: Application;
  readonly view: ArenaView;
  readonly devices: InputDevices;
  readonly fighters: FighterEntry[];
  closeEditor(): void;
}

/** Small walled pen so the camera stays close and nothing rings out. */
export const EDITOR_ARENA: ArenaDef = {
  id: 'editor-pen',
  name: 'Editor pen',
  width: 8,
  height: 5.5,
  sides: { left: 'wall', right: 'wall', top: 'wall', bottom: 'wall' },
  wallThickness: 0.6,
  spawns: [
    { x: -1, y: 0, angle: 0 },
    { x: 1.8, y: 0, angle: 3.141592653589793 },
  ],
  cameraMargin: 0.4,
};

const SESSION_KEY = 'lc-editor-session';
const SAVE_URL = '/__editor/save';
const PREVIEW_DEBOUNCE_MS = 120;

interface Session {
  folder: string;
  doc: EditorDoc;
  saved: string;
  selection: Selection;
  dummy: string;
}

export function editorSessionFolder(): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return s?.folder ?? null;
  } catch {
    return null;
  }
}

export function clearEditorSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

const docFromEntry = (e: FighterEntry): EditorDoc => ({
  folder: e.folder,
  fighter: structuredClone(e.def),
  bot: structuredClone(e.botHints ?? defaultHints(e.def)),
  visuals: structuredClone(e.visuals),
  isNew: false,
});

const fmt = (v: number, d = 2): string => (Math.round(v * 10 ** d) / 10 ** d).toString();

export class FighterEditor {
  private doc!: EditorDoc;
  private history!: History;
  private saved = '';
  private sel: Selection = { kind: 'fighter' };
  private dummy: string;
  private errors: string[] = [];
  private warnings: string[] = [];
  private status = '';
  private newDialog = false;

  private sim: SimState | null = null;
  private previewDef: string | null = null;
  private rebuildAt = 0;
  private readonly loop = new FixedTickLoop(60);
  private prev: RenderFrame | null = null;
  private curr: RenderFrame | null = null;
  private scripted: { move: number; tick: number; hold: number; stick: [number, number] } | null = null;
  private readonly overlay = new Graphics();
  private readonly abilities = discoverAbilities();

  private readonly root = el('div', 'editor lc-interactive');
  private readonly top = el('div', 'ed-top');
  private readonly left = el('div', 'ed-panel ed-left');
  private readonly right = el('div', 'ed-panel ed-right');
  /** Shown over the preview when it can't follow the edits. */
  private readonly previewNote = el('div', 'ed-preview-note');
  private readonly onPointer = (e: PointerEvent): void => this.pick(e);
  private readonly onKey = (e: KeyboardEvent): void => this.shortcut(e);

  constructor(
    private readonly host: EditorHost,
    private readonly layer: HTMLElement,
    folder?: string,
  ) {
    // The dummy is another fighter, so it is never mistaken for the one being edited.
    this.dummy = host.fighters.find((f) => f.folder !== folder)?.def.id ?? host.fighters[0]?.def.id ?? '';
    host.app.stage.visible = true;
    host.app.stage.addChild(this.overlay);
    this.root.append(this.top, this.left, this.right, this.previewNote);
    layer.replaceChildren(this.root);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKey, true);
    if (!this.restoreSession(folder)) this.load(folder ?? host.fighters[0]!.folder);
  }

  // ------------------------------------------------------------------ documents

  private load(folder: string): void {
    const e = this.host.fighters.find((f) => f.folder === folder) ?? this.host.fighters[0]!;
    const doc = docFromEntry(e);
    this.setDoc(doc, { kind: 'fighter' }, JSON.stringify(docFiles(doc)));
  }

  /** Replaces the document. `saved` is what is on disk (to tell whether there are unsaved changes). */
  private setDoc(doc: EditorDoc, sel: Selection, saved: string): void {
    this.doc = doc;
    this.saved = saved;
    this.history = new History(JSON.stringify(doc));
    this.sel = sel;
    this.newDialog = false;
    this.afterChange(true);
  }

  private restoreSession(folder?: string): boolean {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
      if (!s || (folder && s.folder !== folder)) return false;
      const onDisk = this.host.fighters.find((f) => f.folder === s.folder);
      // After a save the page reloads: the registry now has what we saved.
      const doc = s.doc.isNew && onDisk ? docFromEntry(onDisk) : s.doc;
      this.dummy = s.dummy || this.dummy;
      const saved = onDisk ? JSON.stringify(docFiles(docFromEntry(onDisk))) : s.saved;
      this.setDoc(doc, s.selection ?? { kind: 'fighter' }, saved);
      if (onDisk && JSON.stringify(docFiles(doc)) === saved && s.saved === saved) this.flash('Saved.');
      return true;
    } catch {
      return false;
    }
  }

  private persist(): void {
    const s: Session = { folder: this.doc.folder, doc: this.doc, saved: this.saved, selection: this.sel, dummy: this.dummy };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  private filesKey(): string {
    return JSON.stringify(docFiles(this.doc));
  }

  private get dirty(): boolean {
    return this.filesKey() !== this.saved;
  }

  // ------------------------------------------------------------------ change handling

  private readonly hooks: FieldHooks = {
    live: () => this.afterChange(false, false),
    commit: () => this.afterChange(true, false),
  };

  /** Hooks for edits that change structure (ids, lists): re-render the panels on commit. */
  private readonly structural: FieldHooks = {
    live: () => this.afterChange(false, false),
    commit: () => this.afterChange(true, true),
  };

  private afterChange(commit: boolean, rerender = true): void {
    if (commit) this.history?.commit(this.doc);
    this.errors = validateFighter(this.doc.fighter, this.abilities);
    if (this.doc.fighter.id !== this.doc.folder) this.errors.push(`fighter "${this.doc.fighter.id}": id: must match its folder name "${this.doc.folder}"`);
    this.warnings = hintWarnings(this.doc);
    this.rebuildAt = performance.now() + PREVIEW_DEBOUNCE_MS;
    if (commit) this.status = '';
    this.persist();
    if (rerender) this.renderPanels();
    else this.renderStatus();
  }

  private undo(): void {
    const d = this.history.undo();
    if (d) this.restore(d);
  }

  private redo(): void {
    const d = this.history.redo();
    if (d) this.restore(d);
  }

  private restore(d: EditorDoc): void {
    this.doc = d;
    this.clampSelection();
    this.afterChange(false, true);
  }

  private clampSelection(): void {
    const s = this.sel;
    if (s.kind === 'part' && !this.doc.fighter.parts[s.index]) this.sel = { kind: 'fighter' };
    if (s.kind === 'move') {
      const m = this.doc.fighter.moves[s.index];
      if (!m) this.sel = { kind: 'fighter' };
      else if (s.phase >= m.phases.length) this.sel = { ...s, phase: Math.max(0, m.phases.length - 1) };
    }
  }

  private select(s: Selection): void {
    this.sel = s;
    this.clampSelection();
    this.persist();
    this.renderPanels();
  }

  // ------------------------------------------------------------------ save / switch / exit

  private async save(): Promise<void> {
    if (this.errors.length) {
      this.status = `Fix ${this.errors.length} problem${this.errors.length > 1 ? 's' : ''} before saving.`;
      return this.renderStatus();
    }
    this.status = 'Saving…';
    this.renderStatus();
    try {
      const res = await fetch(SAVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: this.doc.folder, files: docFiles(this.doc) }) });
      const body = (await res.json()) as { ok?: boolean; error?: string; written?: string[] };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      this.saved = this.filesKey();
      this.status = `Saved ${body.written?.join(', ') ?? ''}. Reloading…`;
      this.persist();
      this.renderStatus();
    } catch (e) {
      this.status = `Save failed: ${(e as Error).message}`;
      this.renderStatus();
    }
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm('Discard unsaved changes to this fighter?');
  }

  private switchTo(folder: string): void {
    if (folder === this.doc.folder || !this.confirmDiscard()) return this.renderPanels();
    this.load(folder);
  }

  private exit(): void {
    if (!this.confirmDiscard()) return;
    clearEditorSession();
    this.host.closeEditor();
  }

  private shortcut(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inText = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (mod && k === 's') {
      e.preventDefault();
      void this.save();
    } else if (mod && !inText && ((k === 'z' && e.shiftKey) || k === 'y')) {
      e.preventDefault();
      this.redo();
    } else if (mod && !inText && k === 'z') {
      e.preventDefault();
      this.undo();
    }
  }

  // ------------------------------------------------------------------ panels

  private renderPanels(): void {
    this.renderTop();
    this.renderLeft();
    this.renderRight();
  }

  private renderStatus(): void {
    this.renderTop();
    this.renderProblems();
  }

  private renderTop(): void {
    const fighterSel = el('select', 'ed-select');
    for (const f of this.host.fighters) {
      const o = el('option', '', f.def.name);
      o.value = f.folder;
      fighterSel.append(o);
    }
    if (this.doc.isNew) {
      const o = el('option', '', `${this.doc.fighter.name} (new)`);
      o.value = this.doc.folder;
      fighterSel.append(o);
    }
    fighterSel.value = this.doc.folder;
    fighterSel.addEventListener('change', () => this.switchTo(fighterSel.value));
    const dummySel = el('select', 'ed-select');
    for (const f of this.host.fighters) {
      const o = el('option', '', `vs ${f.def.name}`);
      o.value = f.def.id;
      dummySel.append(o);
    }
    dummySel.value = this.dummy;
    dummySel.addEventListener('change', () => {
      this.dummy = dummySel.value;
      this.previewDef = null;
      this.rebuildAt = 0;
      this.persist();
    });
    const undo = button('Undo', () => this.undo());
    undo.disabled = !this.history.canUndo;
    const redo = button('Redo', () => this.redo());
    redo.disabled = !this.history.canRedo;
    const save = button(this.dirty ? 'Save*' : 'Save', () => void this.save(), 'primary');
    save.disabled = !this.dirty && !this.doc.isNew;
    const revert = button('Revert', () => {
      if (this.doc.isNew || !this.confirmDiscard()) return;
      this.load(this.doc.folder);
    });
    revert.disabled = !this.dirty || this.doc.isNew;
    this.top.replaceChildren(
      el('span', 't-hud-label', 'Fighter editor'),
      fighterSel,
      button('New…', () => {
        this.newDialog = true;
        this.renderRight();
      }),
      dummySel,
      undo,
      redo,
      revert,
      save,
      el('span', `ed-status${this.errors.length ? ' bad' : ''}`, this.status || (this.errors.length ? `${this.errors.length} problem${this.errors.length > 1 ? 's' : ''}` : this.dirty ? 'Unsaved changes' : 'All saved')),
      button('Exit', () => this.exit()),
    );
  }

  private item(label: string, s: Selection, active: boolean, extra = ''): HTMLElement {
    const it = el('div', `ed-item${active ? ' active' : ''} ${extra}`.trim(), label);
    it.addEventListener('click', () => this.select(s));
    return it;
  }

  private renderLeft(): void {
    const def = this.doc.fighter;
    const s = this.sel;
    const body = el('div', 'ed-list');
    for (const { index, depth } of partTree(def)) {
      const p = def.parts[index]!;
      const marks = `${p.id === def.rootPart ? ' ◎' : ''}${p.id === def.corePart ? ' ◆' : ''}`;
      const it = this.item(`${p.name}${marks}`, { kind: 'part', index }, s.kind === 'part' && s.index === index);
      it.style.paddingLeft = `calc(var(--u) * ${8 + depth * 14}px)`;
      body.append(it);
    }
    const moves = el('div', 'ed-list');
    for (const inp of MOVE_INPUTS) {
      const mi = moveFor(def, inp.button, inp.direction);
      const m = def.moves[mi];
      if (!m) continue;
      moves.append(this.item(`${moveInputLabel(m)}  ·  ${m.name}`, { kind: 'move', index: mi, phase: 0 }, s.kind === 'move' && s.index === mi));
    }
    this.left.replaceChildren(
      this.item(`${def.name}`, { kind: 'fighter' }, s.kind === 'fighter', 'ed-item-title'),
      el('div', 'ed-heading', 'Body  (◎ root, ◆ core)'),
      body,
      el('div', 'ed-heading', 'Moves'),
      moves,
      el('div', 'ed-heading', 'Bot'),
      this.item('Bot hints', { kind: 'bot' }, s.kind === 'bot'),
      el('div', 'ed-problems'),
    );
    this.renderProblems();
  }

  private renderProblems(): void {
    const box = this.left.querySelector('.ed-problems');
    if (!box) return;
    const list = [...this.errors.map((m) => ({ m, bad: true })), ...this.warnings.map((m) => ({ m, bad: false }))];
    box.replaceChildren(el('div', 'ed-heading', list.length ? `Problems (${list.length})` : 'No problems'));
    for (const { m, bad } of list) {
      const text = m.replace(/^fighter "[^"]*": /, '');
      const it = el('div', `ed-problem${bad ? ' bad' : ''}`, text);
      it.addEventListener('click', () => {
        const target = bad ? selectionForError(this.doc.fighter, m) : { kind: 'bot' as const };
        if (target) this.select(target);
      });
      box.append(it);
    }
  }

  private renderRight(): void {
    if (this.newDialog) return this.right.replaceChildren(this.newFighterForm());
    const s = this.sel;
    const content = s.kind === 'part' ? this.partInspector(s.index) : s.kind === 'move' ? this.moveInspector(s.index, s.phase) : s.kind === 'bot' ? this.botInspector() : this.fighterInspector();
    this.right.replaceChildren(content);
  }

  // ------------------------------------------------------------------ inspectors

  private newFighterForm(): HTMLElement {
    let id = '';
    let name = '';
    let from = this.doc.folder;
    const err = el('div', 'ed-error');
    const fromSel = selectField(
      'Start from',
      this.host.fighters.map((f) => ({ value: f.folder, label: f.def.name })),
      () => from,
      (v) => (from = v),
      { live: () => {}, commit: () => {} },
    );
    const noop: FieldHooks = { live: () => {}, commit: () => {} };
    return section(
      'New fighter',
      el('div', 't-caption ink-muted', 'Starts as a copy you can reshape. It is saved to src/content/fighters/<id>/.'),
      textField('Id (folder)', () => id, (v) => void (id = v.trim()), noop),
      textField('Name', () => name, (v) => void (name = v), noop),
      fromSel,
      err,
      el(
        'div',
        'ed-buttons',
        button('Create', () => {
          if (!ID_RE.test(id)) return void (err.textContent = 'Id: lowercase a-z, 0-9, _ or -, starting with a letter.');
          if (this.host.fighters.some((f) => f.folder === id)) return void (err.textContent = `A fighter "${id}" already exists.`);
          if (!this.confirmDiscard()) return;
          const src = this.host.fighters.find((f) => f.folder === from)!;
          this.setDoc(newFighterFrom(docFromEntry(src), id, name.trim() || id), { kind: 'fighter' }, '');
        }, 'primary'),
        button('Cancel', () => {
          this.newDialog = false;
          this.renderRight();
        }),
      ),
    );
  }

  private fighterInspector(): HTMLElement {
    const d = this.doc;
    const def = d.fighter;
    const h = this.hooks;
    const parts = def.parts.map((p) => ({ value: p.id, label: p.name }));
    const mass = def.parts.reduce((a, p) => a + p.mass, 0);
    const health = def.parts.reduce((a, p) => a + p.maxHealth, 0);
    const loco = def.locomotion;
    return el(
      'div',
      'ed-stack',
      section(
        'Fighter',
        textField('Id', () => def.id, () => null, h, { disabled: true }),
        textField('Name', () => def.name, (v) => void (def.name = v), h),
        textField('Description', () => def.description, (v) => void (def.description = v), h, { multiline: true }),
        textField('Tagline', () => d.visuals.tagline ?? '', (v) => {
          if (v) d.visuals.tagline = v;
          else delete d.visuals.tagline;
        }, h),
        selectField('Root part', parts, () => def.rootPart, (v) => (def.rootPart = v), this.structural),
        selectField('Core part', parts, () => def.corePart, (v) => (def.corePart = v), this.structural),
        el('div', 't-caption ink-muted', `${def.parts.length} parts · ${fmt(mass, 1)} kg · ${health} total health (≈ 800 is typical)`),
      ),
      section(
        'Locomotion',
        numberField('Walk speed (m/s)', () => loco.walkSpeed, (v) => (loco.walkSpeed = v), h, { min: 0.5, max: 10, slider: true, step: 0.1 }),
        numberField('Walk force (N)', () => loco.walkForce, (v) => (loco.walkForce = v), h, { min: 50, max: 800, slider: true, step: 5 }),
        numberField('Turn speed (rad/s)', () => loco.turnSpeed, (v) => (loco.turnSpeed = v), h, { min: 0.5, max: 15, slider: true, step: 0.1 }),
        numberField('Turn torque (N·m)', () => loco.turnTorque, (v) => (loco.turnTorque = v), h, { min: 5, max: 200, slider: true, step: 1 }),
        numberField('Dash impulse (N·s)', () => loco.dashImpulse, (v) => (loco.dashImpulse = v), h, { min: 0, max: 200, slider: true, step: 1 }),
      ),
    );
  }

  private shapeFields(p: PartDef): HTMLElement {
    const h = this.hooks;
    const kinds = [
      { value: 'circle' as const, label: 'Circle' },
      { value: 'capsule' as const, label: 'Capsule' },
      { value: 'polygon' as const, label: 'Polygon (convex)' },
    ];
    const kindSel = selectField('Shape', kinds, () => p.shape.kind, (k) => (p.shape = convertShape(p.shape, k)), this.structural);
    const s = p.shape;
    if (s.kind === 'circle') return el('div', 'ed-stack', kindSel, numberField('Radius (m)', () => s.radius, (v) => (s.radius = v), h, { min: 0.02, max: 1, slider: true }));
    if (s.kind === 'capsule')
      return el(
        'div',
        'ed-stack',
        kindSel,
        numberField('Length (m, tip to tip)', () => s.length, (v) => (s.length = v), h, { min: 0.05, max: 2, slider: true }),
        numberField('Radius (m)', () => s.radius, (v) => (s.radius = v), h, { min: 0.02, max: 0.5, slider: true }),
      );
    const rows = s.points.map((pt, i) =>
      el(
        'div',
        'ed-point',
        numberField(`P${i + 1} x`, () => pt[0], (v) => (pt[0] = v), h, { step: 0.01 }),
        numberField('y', () => pt[1], (v) => (pt[1] = v), h, { step: 0.01 }),
        button('✕', () => {
          if (s.points.length <= 3) return;
          s.points.splice(i, 1);
          this.afterChange(true);
        }, 'small'),
      ),
    );
    return el(
      'div',
      'ed-stack',
      kindSel,
      el('div', 't-caption ink-muted', 'Points counter-clockwise, local frame (+x forward, +y left).'),
      ...rows,
      button('Add point', () => {
        const a = s.points[s.points.length - 1]!;
        const b = s.points[0]!;
        s.points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        this.afterChange(true);
      }),
    );
  }

  /** One click to move the lose condition to this part; disabled on the current core. */
  private makeCoreButton(partId: string): HTMLButtonElement {
    const isCore = partId === this.doc.fighter.corePart;
    const b = button(isCore ? '◆ Core part' : 'Make core ◆', () => {
      const e = setCorePart(this.doc, partId);
      if (e) return this.flash(e);
      this.afterChange(true);
    });
    b.disabled = isCore;
    b.title = isCore ? 'This part is the core: when it dies, the round is lost.' : 'Make this the core part: when it dies, the round is lost.';
    return b;
  }

  private partInspector(index: number): HTMLElement {
    const d = this.doc;
    const def = d.fighter;
    const p = def.parts[index]!;
    const h = this.hooks;
    const ji = parentJointOf(def, p.id);
    const j = def.joints[ji];
    const tags = ['locomotion', 'armor'];
    const out = el(
      'div',
      'ed-stack',
      section(
        `Part${p.id === def.rootPart ? ' (root)' : ''}${p.id === def.corePart ? ' (core)' : ''}`,
        textField('Id', () => p.id, (v) => renamePart(d, p.id, v.trim()), this.structural, { commitOnly: true }),
        textField('Name', () => p.name, (v) => void (p.name = v), this.structural, { commitOnly: true }),
        this.shapeFields(p),
        numberField('Mass (kg)', () => p.mass, (v) => (p.mass = v), h, { min: 0.05, max: 20, slider: true, step: 0.05 }),
        numberField('Max health', () => p.maxHealth, (v) => (p.maxHealth = v), h, { min: 1, max: 400, slider: true, step: 1, integer: true }),
        checklist('Tags', tags.map((t) => ({ value: t, label: t })), () => (p.tags ?? []).filter((t) => tags.includes(t)), (v) => {
          const other = (p.tags ?? []).filter((t) => !tags.includes(t));
          const all = [...v, ...other];
          if (all.length) p.tags = all;
          else delete p.tags;
        }, h),
        el(
          'div',
          'ed-buttons',
          button('Add limb here', () => {
            const ni = addPart(d, p.id);
            this.afterChange(true);
            this.select({ kind: 'part', index: ni });
          }),
          this.makeCoreButton(p.id),
          button('Mirror to other side', () => {
            const r = mirrorPart(d, p.id);
            if (typeof r === 'string') return this.flash(r);
            this.afterChange(true);
            this.select({ kind: 'part', index: r });
          }),
          button('Delete', () => {
            const n = subtreeIds(def, p.id).length;
            if (n > 1 && !window.confirm(`Delete ${p.name} and the ${n - 1} part(s) attached to it?`)) return;
            const e = deletePart(d, p.id);
            if (e) return this.flash(e);
            this.sel = { kind: 'fighter' };
            this.afterChange(true);
          }, 'danger'),
        ),
      ),
    );
    if (j) {
      const others = def.parts.filter((q) => !subtreeIds(def, p.id).includes(q.id)).map((q) => ({ value: q.id, label: q.name }));
      const lim = j.limits;
      out.append(
        section(
          'Joint (to parent)',
          textField('Joint id', () => j.id, (v) => renameJoint(d, j.id, v.trim()), this.structural, { commitOnly: true }),
          selectField('Attached to', others, () => j.parent, (v) => (j.parent = v), this.structural),
          numberField('Anchor on parent x', () => j.anchorParent[0], (v) => (j.anchorParent[0] = v), h, { min: -1.5, max: 1.5, slider: true }),
          numberField('Anchor on parent y', () => j.anchorParent[1], (v) => (j.anchorParent[1] = v), h, { min: -1.5, max: 1.5, slider: true }),
          numberField('Pivot on this part x', () => j.anchorChild[0], (v) => (j.anchorChild[0] = v), h, { min: -1, max: 1, slider: true }),
          numberField('Pivot on this part y', () => j.anchorChild[1], (v) => (j.anchorChild[1] = v), h, { min: -1, max: 1, slider: true }),
          numberField('Idle angle (rad)', () => j.idleAngle, (v) => (j.idleAngle = v), h, { min: lim?.[0] ?? -3.09, max: lim?.[1] ?? 3.09, slider: true }),
          checkField('Limits', () => !!j.limits, (v) => {
            if (v) j.limits = [Math.min(j.idleAngle, -1), Math.max(j.idleAngle, 1)];
            else delete j.limits;
          }, this.structural),
          lim ? numberField('Min angle', () => lim[0], (v) => (lim[0] = v), h, { min: -3.09, max: 3.09, slider: true }) : null,
          lim ? numberField('Max angle', () => lim[1], (v) => (lim[1] = v), h, { min: -3.09, max: 3.09, slider: true }) : null,
          numberField('Strength (N·m)', () => j.strength, (v) => (j.strength = v), h, { min: 1, max: 1000, slider: true, step: 1, hint: 'Max motor torque: how hard the joint pushes toward its target.' }),
          numberField('Damping', () => j.damping, (v) => (j.damping = v), h, { min: 0, max: 50, slider: true, step: 0.1, hint: '≈ 5–10 % of strength is a good start.' }),
        ),
      );
    }
    return out;
  }

  private moveInspector(index: number, phaseIdx: number): HTMLElement {
    const d = this.doc;
    const def = d.fighter;
    const m = def.moves[index]!;
    const h = this.hooks;
    const joints = def.joints.map((j) => ({ value: j.id, label: `${j.id} (${def.parts[partIndex(def, j.child)]?.name ?? '?'})` }));
    const phases = el('div', 'ed-phases');
    m.phases.forEach((ph, pi) => {
      const head = el('div', `ed-phase-head${pi === phaseIdx ? ' active' : ''}`, `Phase ${pi + 1}  ·  ${ph.ticks} ticks${ph.hold ? ' · hold' : ''}${ph.spin ? ' · spin' : ''}${ph.drive ? ' · drive' : ''}`);
      head.addEventListener('click', () => this.select({ kind: 'move', index, phase: pi }));
      phases.append(head);
      if (pi === phaseIdx) phases.append(this.phaseFields(m.phases, pi, joints, h));
    });
    const req = def.parts.map((p) => ({ value: p.id, label: p.name }));
    return el(
      'div',
      'ed-stack',
      section(
        `Move  ·  ${moveInputLabel(m)}`,
        el('div', 'ed-buttons', button('▶ Play', () => this.play(index), 'primary'), button('▶ Play holding', () => this.play(index, 60))),
        textField('Name', () => m.name, (v) => renameMove(d, index, v), this.structural, { commitOnly: true }),
        textField('Description', () => m.description, (v) => void (m.description = v), h, { multiline: true }),
        numberField('Return speed (rad/s)', () => m.returnSpeed, (v) => (m.returnSpeed = v), h, { min: 1, max: 40, slider: true, step: 0.5 }),
        checklist('Requires (move is disabled if any is lost)', req, () => m.requires, (v) => (m.requires = v), h),
      ),
      section(
        'Phases',
        el('div', 't-caption ink-muted', 'Phases play in order. Joints a phase leaves out keep the target an earlier phase gave them. The ghost shows the selected phase.'),
        phases,
        el(
          'div',
          'ed-buttons',
          button('Add phase', () => {
            m.phases.splice(phaseIdx + 1, 0, { targets: [], speed: 14, ticks: 10 });
            this.afterChange(true);
            this.select({ kind: 'move', index, phase: phaseIdx + 1 });
          }),
          button('Duplicate', () => {
            m.phases.splice(phaseIdx + 1, 0, structuredClone(m.phases[phaseIdx]!));
            this.afterChange(true);
            this.select({ kind: 'move', index, phase: phaseIdx + 1 });
          }),
          button('↑', () => this.movePhase(index, phaseIdx, -1), 'small'),
          button('↓', () => this.movePhase(index, phaseIdx, 1), 'small'),
          button('Delete phase', () => {
            if (m.phases.length <= 1) return this.flash('A move needs at least one phase.');
            m.phases.splice(phaseIdx, 1);
            this.afterChange(true);
            this.select({ kind: 'move', index, phase: Math.max(0, phaseIdx - 1) });
          }, 'danger'),
        ),
      ),
    );
  }

  private movePhase(index: number, pi: number, dir: number): void {
    const ph = this.doc.fighter.moves[index]!.phases;
    const to = pi + dir;
    if (to < 0 || to >= ph.length) return;
    [ph[pi], ph[to]] = [ph[to]!, ph[pi]!];
    this.afterChange(true);
    this.select({ kind: 'move', index, phase: to });
  }

  private phaseFields(phases: MovePhase[], pi: number, joints: { value: string; label: string }[], h: FieldHooks): HTMLElement {
    const def = this.doc.fighter;
    const ph = phases[pi]!;
    const targets = el('div', 'ed-stack');
    ph.targets.forEach((t, ti) => {
      const jd = def.joints.find((j) => j.id === t.joint);
      const lim = jd?.limits ?? [-3.09, 3.09];
      targets.append(
        el(
          'div',
          'ed-target',
          selectField('Joint', joints, () => t.joint, (v) => (t.joint = v), this.structural),
          numberField('Angle', () => t.angle, (v) => (t.angle = v), h, { min: lim[0], max: lim[1], slider: true }),
          button('Remove target', () => {
            ph.targets.splice(ti, 1);
            this.afterChange(true);
          }, 'small'),
        ),
      );
    });
    const free = def.joints.filter((j) => !ph.targets.some((t) => t.joint === j.id));
    const add = el('select', 'ed-select');
    add.append(el('option', '', '+ Add joint target…'));
    for (const j of free) {
      const o = el('option', '', joints.find((x) => x.value === j.id)?.label ?? j.id);
      o.value = j.id;
      add.append(o);
    }
    add.addEventListener('change', () => {
      const j = def.joints.find((x) => x.id === add.value);
      if (!j) return;
      // Start from where the joint is at this point of the move (or idle).
      const prevAngle = [...phases.slice(0, pi)].reverse().flatMap((p) => p.targets).find((t) => t.joint === j.id)?.angle;
      ph.targets.push({ joint: j.id, angle: prevAngle ?? j.idleAngle });
      this.afterChange(true);
    });
    return el(
      'div',
      'ed-phase',
      numberField('Ticks (1/60 s)', () => ph.ticks, (v) => (ph.ticks = v), h, { min: 1, max: 120, slider: true, step: 1, integer: true }),
      numberField('Speed (rad/s)', () => ph.speed, (v) => (ph.speed = v), h, { min: 1, max: 40, slider: true, step: 0.5 }),
      checkField('Hold while button held', () => !!ph.hold, (v) => {
        if (v) ph.hold = true;
        else {
          delete ph.hold;
          delete ph.maxHoldTicks;
        }
      }, this.structural),
      ph.hold ? numberField('Max hold (ticks)', () => ph.maxHoldTicks ?? 180, (v) => (ph.maxHoldTicks = v), h, { min: 1, max: 600, step: 1, integer: true }) : null,
      checkField('Spin body', () => ph.spin !== undefined, (v) => {
        if (v) ph.spin = 8;
        else delete ph.spin;
      }, this.structural),
      ph.spin !== undefined ? numberField('Spin (rad/s, + = CCW)', () => ph.spin!, (v) => (ph.spin = v), h, { min: -20, max: 20, slider: true, step: 0.5 }) : null,
      checkField('Drive body', () => !!ph.drive, (v) => {
        if (v) ph.drive = [3, 0];
        else delete ph.drive;
      }, this.structural),
      ph.drive ? numberField('Drive forward (m/s)', () => ph.drive![0], (v) => (ph.drive![0] = v), h, { min: -10, max: 10, slider: true, step: 0.5 }) : null,
      ph.drive ? numberField('Drive left (m/s)', () => ph.drive![1], (v) => (ph.drive![1] = v), h, { min: -10, max: 10, slider: true, step: 0.5 }) : null,
      el('div', 'ed-heading', 'Joint targets'),
      targets,
      add,
    );
  }

  private botInspector(): HTMLElement {
    const d = this.doc;
    const b = d.bot;
    const h = this.hooks;
    const roles = [
      { value: 'attack' as const, label: 'Attack' },
      { value: 'guard' as const, label: 'Guard' },
      { value: 'none' as const, label: 'Never use' },
    ];
    const moveRows = d.fighter.moves.map((m) =>
      selectField(
        `${moveInputLabel(m)} · ${m.name}`,
        roles,
        () => (b.attackMoves.includes(m.name) ? 'attack' : b.guardMoves.includes(m.name) ? 'guard' : 'none'),
        (v) => {
          b.attackMoves = b.attackMoves.filter((n) => n !== m.name);
          b.guardMoves = b.guardMoves.filter((n) => n !== m.name);
          if (v === 'attack') b.attackMoves.push(m.name);
          if (v === 'guard') b.guardMoves.push(m.name);
        },
        h,
      ),
    );
    return el(
      'div',
      'ed-stack',
      section(
        'Bot hints',
        el('div', 't-caption ink-muted', 'How the computer opponent plays this fighter. Check with npm run sim:bots.'),
        numberField('Ideal distance (m)', () => b.idealDistance, (v) => (b.idealDistance = v), h, { min: 0.5, max: 4, slider: true }),
        numberField('Reach (m)', () => b.reach, (v) => (b.reach = v), h, { min: 0.3, max: 4, slider: true }),
        ...moveRows,
        checklist('Shield parts (kept toward the enemy)', d.fighter.parts.map((p) => ({ value: p.id, label: p.name })), () => b.shieldParts, (v) => (b.shieldParts = v), h),
      ),
    );
  }

  private flash(msg: string): void {
    this.status = msg;
    this.renderTop();
  }

  // ------------------------------------------------------------------ preview

  private play(move: number, extraHold = 0): void {
    const m = this.doc.fighter.moves[move];
    if (!m || !this.sim) return;
    // Hold the button through the first hold phase (plus extra), stick only on the press tick.
    let hold = 0;
    for (const p of m.phases) {
      hold += p.ticks;
      if (p.hold) break;
    }
    const f = this.sim.physics.pose(this.sim.game.fighters[0]!.parts[this.sim.ctx.compiled[0].root]!.body).angle;
    const sign = m.direction === 'forward' ? 1 : m.direction === 'back' ? -1 : 0;
    this.scripted = { move, tick: 0, hold: hold + extraHold, stick: [Math.round(sign * cos(f) * 127), Math.round(sign * sin(f) * 127)] };
  }

  private rebuild(): void {
    const blockers = previewBlockers(this.errors);
    if (blockers.length) {
      // Keep showing the last working version, and say so.
      this.setPreviewNote(`Preview shows the last working version until this is fixed: ${blockers[0]!.replace(/^fighter "[^"]*": /, '')}`);
      return;
    }
    const key = JSON.stringify(this.doc.fighter) + this.dummy;
    if (key === this.previewDef) return this.setPreviewNote('');
    this.previewDef = key;
    const dummy = this.host.fighters.find((f) => f.def.id === this.dummy)?.def ?? this.doc.fighter;
    try {
      const sim = createMatch({ fighters: [structuredClone(this.doc.fighter), dummy], arena: EDITOR_ARENA, seed: 1, tuning: defaultTuning() });
      for (let i = 0; i < sim.ctx.tuning.countdownTicks; i++) step(sim, [emptyInput(), emptyInput()]);
      this.sim?.physics.free();
      this.sim = sim;
      this.prev = null;
      this.curr = captureFrame(sim);
      this.host.view.setMatch(sim.ctx);
      this.scripted = null;
      this.setPreviewNote('');
    } catch (e) {
      this.setPreviewNote(`Preview shows the last working version: ${(e as Error).message}`);
    }
  }

  private setPreviewNote(text: string): void {
    if (this.previewNote.textContent !== text) this.previewNote.textContent = text;
  }

  frame(dtMs: number): void {
    if (this.rebuildAt && performance.now() >= this.rebuildAt) {
      this.rebuildAt = 0;
      this.rebuild();
    }
    const sim = this.sim;
    if (!sim || !this.curr) return;
    const n = this.loop.advance(dtMs);
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLSelectElement;
    for (let i = 0; i < n; i++) {
      let p1: InputFrame = typing ? emptyInput() : this.host.devices.readSolo();
      const sc = this.scripted;
      if (sc) {
        const m = sim.ctx.compiled[0].moves[sc.move];
        if (m && sc.tick < sc.hold) p1 = { ...p1, buttons: p1.buttons | ATTACK_BUTTONS[MOVE_BUTTONS.indexOf(m.button)]! };
        if (sc.tick === 0) p1 = { ...p1, moveX: sc.stick[0], moveY: sc.stick[1] };
        if (++sc.tick > sc.hold + 2) this.scripted = null;
      }
      const events = step(sim, [p1, emptyInput()]);
      if (events.length) this.host.view.onEvents(events);
      if (sim.game.phase !== 'fight' && sim.game.phase !== 'countdown') {
        // A core died or the round ended: start over.
        this.previewDef = null;
        this.rebuild();
        return;
      }
      this.prev = this.curr;
      this.curr = captureFrame(sim);
    }
    const scale = uiScale(window.innerHeight);
    this.host.view.render(interpolate(this.prev, this.curr, this.loop.alpha), dtMs, scale);
    this.drawOverlay(scale);
  }

  /** Selected part highlight, its joint (anchor, limits, idle) and the selected phase's ghost pose. */
  private drawOverlay(scale: number): void {
    const g = this.overlay;
    g.clear();
    const sim = this.sim;
    if (!sim) return;
    const cam = this.host.view.camera;
    const cf = sim.ctx.compiled[0];
    const f = sim.game.fighters[0]!;
    const def = cf.def;
    const s = this.sel;
    const accent = hex(COLOR.focus);
    if (s.kind === 'part' && def.parts[s.index] && this.doc.fighter.parts.length === def.parts.length) {
      const ps = f.parts[s.index]!;
      if (ps.body >= 0) {
        const pose = sim.physics.pose(ps.body);
        shapePath(g, cam, def.parts[s.index]!.shape, pose.x, pose.y, pose.angle, 4 * scale);
        g.stroke({ width: 2 * scale, color: accent, alpha: 0.9 });
      }
      const ji = cf.parentJoint[s.index] ?? -1;
      const parent = ji >= 0 ? f.parts[cf.jointParent[ji]!]! : null;
      if (ji >= 0 && parent && parent.body >= 0) {
        const j = def.joints[ji]!;
        const pp = sim.physics.pose(parent.body);
        const ax = pp.x + j.anchorParent[0] * cos(pp.angle) - j.anchorParent[1] * sin(pp.angle);
        const ay = pp.y + j.anchorParent[0] * sin(pp.angle) + j.anchorParent[1] * cos(pp.angle);
        const r = 0.35;
        if (j.limits) {
          // Screen angles run clockwise, so draw the world arc by sampling points.
          const steps = 24;
          for (let i = 0; i <= steps; i++) {
            const a = pp.angle + j.limits[0] + ((j.limits[1] - j.limits[0]) * i) / steps;
            const x = cam.sx(ax + cos(a) * r);
            const y = cam.sy(ay + sin(a) * r);
            if (i === 0) g.moveTo(cam.sx(ax), cam.sy(ay)).lineTo(x, y);
            else g.lineTo(x, y);
          }
          g.lineTo(cam.sx(ax), cam.sy(ay));
          g.fill({ color: accent, alpha: 0.08 }).stroke({ width: 1 * scale, color: accent, alpha: 0.5 });
        }
        const idle = pp.angle + j.idleAngle;
        g.moveTo(cam.sx(ax), cam.sy(ay)).lineTo(cam.sx(ax + cos(idle) * r), cam.sy(ay + sin(idle) * r));
        g.stroke({ width: 1.5 * scale, color: accent, alpha: 0.9 });
        g.circle(cam.sx(ax), cam.sy(ay), 4 * scale).fill({ color: accent });
      }
    }
    if (s.kind === 'move') {
      const cm = cf.moves[s.index];
      const ph = cm?.phases[s.phase];
      const root = f.parts[cf.root]!;
      if (ph && root.body >= 0) {
        const rp = sim.physics.pose(root.body);
        const angles = def.joints.map((j) => j.idleAngle);
        for (const t of ph.targets) angles[t.joint] = t.angle;
        const poses = posesFor(cf, rp.x, rp.y, rp.angle, angles);
        def.parts.forEach((p, i) => {
          if (f.parts[i]!.status !== 'attached') return;
          shapePath(g, cam, p.shape, poses[i]!.x, poses[i]!.y, poses[i]!.angle);
        });
        g.stroke({ width: 1.5 * scale, color: accent, alpha: 0.55 });
        if (ph.drive) {
          const dx = ph.drive[0] * cos(rp.angle) - ph.drive[1] * sin(rp.angle);
          const dy = ph.drive[0] * sin(rp.angle) + ph.drive[1] * cos(rp.angle);
          const k = 0.15;
          g.moveTo(cam.sx(rp.x), cam.sy(rp.y)).lineTo(cam.sx(rp.x + dx * k), cam.sy(rp.y + dy * k));
          g.stroke({ width: 3 * scale, color: accent, alpha: 0.8 });
        }
      }
    }
  }

  /** Click on the arena: select the part under the cursor. */
  private pick(e: PointerEvent): void {
    if (e.target !== this.host.app.canvas || !this.sim) return;
    const cam = this.host.view.camera;
    const rect = this.host.app.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * cam.screenW;
    const sy = ((e.clientY - rect.top) / rect.height) * cam.screenH;
    const wx = (sx - cam.screenW / 2 - cam.shakeX) / cam.zoom + cam.cx;
    const wy = cam.cy - (sy - cam.screenH / 2 - cam.shakeY) / cam.zoom;
    const f = this.sim.game.fighters[0]!;
    const def = this.sim.ctx.compiled[0].def;
    let best = -1;
    let bestSize = Infinity;
    def.parts.forEach((p, i) => {
      const ps = f.parts[i]!;
      if (ps.status !== 'attached' || ps.body < 0) return;
      const pose = this.sim!.physics.pose(ps.body);
      const c = cos(-pose.angle);
      const s = sin(-pose.angle);
      const lx = (wx - pose.x) * c - (wy - pose.y) * s;
      const ly = (wx - pose.x) * s + (wy - pose.y) * c;
      const size = hitSize(p.shape, lx, ly);
      if (size !== null && size < bestSize) {
        bestSize = size;
        best = i;
      }
    });
    if (best >= 0 && this.doc.fighter.parts[best]?.id === def.parts[best]!.id) this.select({ kind: 'part', index: best });
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKey, true);
    this.overlay.destroy();
    this.layer.replaceChildren();
    this.sim?.physics.free();
    this.host.app.stage.visible = false;
  }
}
