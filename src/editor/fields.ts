/**
 * Inspector form fields. `onLive` fires while typing/dragging (preview updates, no undo step);
 * `onCommit` fires when the edit is finished (one undo step). Keystrokes in fields never reach
 * the game's keyboard input.
 */
import { el } from '../ui/dom';

export interface FieldHooks {
  /** Value changed while typing/dragging. */
  live(): void;
  /** Edit finished: record an undo step. */
  commit(): void;
}

const stopKeys = (e: HTMLElement): void => {
  e.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    // Let editor shortcuts (Ctrl+S / Ctrl+Z / Ctrl+Y) through; everything else stays in the field.
    if ((k.ctrlKey || k.metaKey) && ['s', 'z', 'y'].includes(k.key.toLowerCase())) return;
    ev.stopPropagation();
  });
  e.addEventListener('keyup', (ev) => ev.stopPropagation());
};

function row(label: string, ...controls: HTMLElement[]): HTMLElement {
  return el('label', 'ed-row', el('span', 'ed-label', label), el('span', 'ed-controls', ...controls));
}

export interface NumberOpts {
  min?: number;
  max?: number;
  step?: number;
  /** Show a slider between min and max. */
  slider?: boolean;
  integer?: boolean;
  hint?: string;
}

export function numberField(label: string, get: () => number, set: (v: number) => void, hooks: FieldHooks, o: NumberOpts = {}): HTMLElement {
  const input = el('input', 'ed-num');
  input.type = 'number';
  input.step = String(o.step ?? (o.integer ? 1 : 0.01));
  if (o.min !== undefined) input.min = String(o.min);
  if (o.max !== undefined) input.max = String(o.max);
  input.value = String(get());
  stopKeys(input);
  const controls: HTMLElement[] = [input];
  let slider: HTMLInputElement | null = null;
  if (o.slider && o.min !== undefined && o.max !== undefined) {
    slider = el('input', 'ed-slider');
    slider.type = 'range';
    slider.min = String(o.min);
    slider.max = String(o.max);
    slider.step = String(o.step ?? 0.01);
    slider.value = String(get());
    stopKeys(slider);
    controls.unshift(slider);
  }
  const apply = (raw: string, from: HTMLInputElement): boolean => {
    let v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return false;
    if (o.integer) v = Math.round(v);
    set(v);
    if (from !== input) input.value = String(v);
    if (slider && from !== slider) slider.value = String(v);
    return true;
  };
  for (const c of [input, slider]) {
    if (!c) continue;
    c.addEventListener('input', () => apply(c.value, c) && hooks.live());
    c.addEventListener('change', () => {
      if (apply(c.value, c)) hooks.commit();
      else input.value = String(get());
    });
  }
  const r = row(label, ...controls);
  if (o.hint) r.title = o.hint;
  return r;
}

/** Text field. `set` may return an error message; the field then turns red and reverts on blur. */
export function textField(label: string, get: () => string, set: (v: string) => string | null | void, hooks: FieldHooks, o: { commitOnly?: boolean; multiline?: boolean; disabled?: boolean } = {}): HTMLElement {
  const input = o.multiline ? el('textarea', 'ed-text') : el('input', 'ed-text');
  input.value = get();
  if (o.disabled) input.disabled = true;
  stopKeys(input);
  const err = el('span', 'ed-error');
  const apply = (commit: boolean): void => {
    const e = set(input.value);
    err.textContent = e ?? '';
    input.classList.toggle('invalid', !!e);
    if (e) {
      if (commit) {
        input.value = get();
        input.classList.remove('invalid');
      }
      return;
    }
    if (commit) hooks.commit();
    else hooks.live();
  };
  if (!o.commitOnly) input.addEventListener('input', () => apply(false));
  input.addEventListener('change', () => apply(true));
  return el('div', 'ed-field', row(label, input), err);
}

export function selectField<T extends string>(label: string, options: { value: T; label: string }[], get: () => T, set: (v: T) => void, hooks: FieldHooks): HTMLElement {
  const select = el('select', 'ed-select');
  for (const o of options) {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    select.append(opt);
  }
  select.value = get();
  stopKeys(select);
  select.addEventListener('change', () => {
    set(select.value as T);
    hooks.commit();
  });
  return row(label, select);
}

export function checkField(label: string, get: () => boolean, set: (v: boolean) => void, hooks: FieldHooks): HTMLElement {
  const input = el('input', 'ed-check');
  input.type = 'checkbox';
  input.checked = get();
  input.addEventListener('change', () => {
    set(input.checked);
    hooks.commit();
  });
  return row(label, input);
}

/** A set of checkboxes (e.g. which parts a move requires). */
export function checklist(label: string, items: { value: string; label: string }[], get: () => string[], set: (v: string[]) => void, hooks: FieldHooks): HTMLElement {
  const box = el('div', 'ed-checklist');
  for (const it of items) {
    const input = el('input', 'ed-check');
    input.type = 'checkbox';
    input.checked = get().includes(it.value);
    input.addEventListener('change', () => {
      const cur = new Set(get());
      if (input.checked) cur.add(it.value);
      else cur.delete(it.value);
      set(items.map((i) => i.value).filter((v) => cur.has(v)));
      hooks.commit();
    });
    box.append(el('label', 'ed-check-item', input, el('span', '', it.label)));
  }
  return el('div', 'ed-field', el('div', 'ed-label', label), box);
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `ed-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function section(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return el('div', 'ed-section', el('div', 'ed-section-title', title), ...children);
}
