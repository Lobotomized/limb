/**
 * Menu framework. A screen has a list of focusable items; exactly one is focused at all
 * times. Works with controller (d-pad/stick + A/B), keyboard (arrows/WASD + Enter/Esc) and
 * mouse (hover focuses, click selects).
 */
import type { MenuAction } from '../../input/devices';
import { el } from '../dom';

export interface MenuItem {
  label: string;
  /** Current value shown on the right (settings). */
  value?: () => string;
  /** Called on select (A / Enter / click). */
  action?: () => void;
  /** Left/right adjust (settings). */
  adjust?: (dir: -1 | 1) => void;
  /** Non-null = disabled, with a short reason. */
  disabled?: () => string | null;
  destructive?: boolean;
}

export interface UiSounds {
  menuMove(): void;
  menuSelect(): void;
  menuBack(): void;
}

export interface ScreenOptions {
  /** Called on back (B / Esc). Return false to stay. */
  onBack?: () => void;
  /** Drawn over the running game (pause). */
  overlay?: boolean;
  /** Extra per-frame hook (e.g. to refresh dynamic content). */
  onFrame?: (dtMs: number) => void;
  /** Extra input hook (fighter select uses left/right to browse). Return true if consumed. */
  onAction?: (a: MenuAction) => boolean;
}

export class MenuScreen {
  readonly root: HTMLElement;
  readonly content: HTMLElement;
  private readonly buttons: HTMLElement[] = [];
  focus = 0;
  private menuEl: HTMLElement;
  private promptEl: HTMLElement;

  constructor(
    private items: MenuItem[],
    readonly options: ScreenOptions,
    private readonly sounds: UiSounds,
    glyphs: () => 'keyboard' | 'gamepad',
  ) {
    this.root = el('div', `screen${options.overlay ? ' overlay' : ''}`);
    if (options.overlay) this.root.append(el('div', 'scrim'));
    this.content = el('div', 'content');
    this.menuEl = el('div', 'menu');
    this.promptEl = el('div', 'prompts');
    this.root.append(this.content);
    this.glyphs = glyphs;
    this.setItems(items);
  }

  private readonly glyphs: () => 'keyboard' | 'gamepad';

  /** The menu element (place it inside `content` where the screen wants it). */
  get menu(): HTMLElement {
    return this.menuEl;
  }

  get prompts(): HTMLElement {
    return this.promptEl;
  }

  setItems(items: MenuItem[]): void {
    this.items = items;
    this.buttons.length = 0;
    this.menuEl.replaceChildren();
    items.forEach((it, i) => {
      const b = el('div', `btn${it.destructive ? ' destructive' : ''}`);
      b.addEventListener('mouseenter', () => this.setFocus(i, true));
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.setFocus(i, false);
        this.select();
      });
      b.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.items[i]?.adjust?.(-1);
        this.refresh();
      });
      this.buttons.push(b);
      this.menuEl.append(b);
    });
    if (this.focus >= items.length) this.focus = Math.max(0, items.length - 1);
    this.refresh();
  }

  setFocus(i: number, sound: boolean): void {
    if (i === this.focus) return;
    this.focus = i;
    if (sound) this.sounds.menuMove();
    this.refresh();
  }

  refresh(): void {
    this.items.forEach((it, i) => {
      const b = this.buttons[i]!;
      const reason = it.disabled?.() ?? null;
      b.classList.toggle('disabled', reason !== null);
      b.classList.toggle('focused', i === this.focus);
      const left = el('div', 'col', el('span', '', it.label));
      if (reason) left.append(el('span', 'reason', reason));
      const right = el('div', 'row');
      if (it.value) right.append(el('span', 'value', it.value()));
      right.append(el('span', 'arrow', '▶'));
      b.replaceChildren(left, right);
    });
    const pad = this.glyphs() === 'gamepad';
    const prompt = (glyph: string, verb: string): HTMLElement => el('span', '', el('span', 'glyph', glyph), verb);
    this.promptEl.replaceChildren(prompt(pad ? 'Ⓐ' : 'Enter', 'Select'), prompt(pad ? 'Ⓑ' : 'Esc', 'Back'));
    if (this.items.some((it) => it.adjust)) this.promptEl.append(prompt(pad ? '◀ ▶' : '← →', 'Change'));
  }

  private select(): void {
    const it = this.items[this.focus];
    if (!it) return;
    if (it.disabled?.()) {
      this.sounds.menuBack();
      return;
    }
    if (it.action) {
      this.sounds.menuSelect();
      it.action();
    } else if (it.adjust) {
      it.adjust(1);
      this.sounds.menuMove();
    }
    this.refresh();
  }

  handle(a: MenuAction): void {
    if (this.options.onAction?.(a)) return;
    const n = this.items.length;
    switch (a) {
      case 'up':
        if (n) this.setFocus((this.focus - 1 + n) % n, true);
        break;
      case 'down':
        if (n) this.setFocus((this.focus + 1) % n, true);
        break;
      case 'left':
      case 'right': {
        const it = this.items[this.focus];
        if (it?.adjust && !it.disabled?.()) {
          it.adjust(a === 'left' ? -1 : 1);
          this.sounds.menuMove();
          this.refresh();
        }
        break;
      }
      case 'select':
        this.select();
        break;
      case 'back':
      case 'start':
        if (a === 'start' && !this.options.overlay) {
          this.select();
          break;
        }
        if (this.options.onBack) {
          this.sounds.menuBack();
          this.options.onBack();
        }
        break;
    }
  }
}

/** A stack of screens; only the top one receives input. */
export class ScreenStack {
  private stack: MenuScreen[] = [];
  constructor(private readonly host: HTMLElement) {}

  get top(): MenuScreen | undefined {
    return this.stack[this.stack.length - 1];
  }

  get size(): number {
    return this.stack.length;
  }

  push(s: MenuScreen): void {
    this.top?.root.remove();
    this.stack.push(s);
    this.host.append(s.root);
  }

  pop(): void {
    this.stack.pop()?.root.remove();
    if (this.top) this.host.append(this.top.root);
  }

  replace(s: MenuScreen): void {
    this.stack.pop()?.root.remove();
    this.push(s);
  }

  clear(): void {
    while (this.stack.length) this.stack.pop()?.root.remove();
  }

  handle(actions: MenuAction[]): void {
    for (const a of actions) this.top?.handle(a);
  }

  frame(dtMs: number): void {
    this.top?.options.onFrame?.(dtMs);
  }
}
