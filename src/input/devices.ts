/**
 * Maps physical devices to players. "auto" picks sensible defaults:
 *  - 0 pads: P1 keyboard (left), P2 keyboard (right)
 *  - 1 pad:  P1 keyboard (left), P2 gamepad 1
 *  - 2+ pads: P1 gamepad 1, P2 gamepad 2 (keyboards still work for both)
 * A single local player (vs bot / online) reads every keyboard layout and the first pad.
 */
import { GAMEPAD_DEFAULT, KEYBOARD_P1, KEYBOARD_P2, MENU_KEYS, MENU_PAD, type DeviceId } from './bindings';
import { pollGamepads, padToInput, type PadSnapshot } from './gamepad';
import { emptyInput, mergeInputs, type InputFrame } from './input-frame';
import { KeyboardState } from './keyboard';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'start';

export class InputDevices {
  readonly keyboard = new KeyboardState();
  private pads: PadSnapshot[] = [];
  private prevPadButtons = new Map<number, boolean[]>();
  private padRepeat = new Map<string, number>();
  /** Last device that produced any input (for button glyphs). */
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';

  attach(w: Window): void {
    this.keyboard.attach(w);
  }

  /** Call once per frame before reading. */
  poll(): void {
    this.pads = pollGamepads();
  }

  padCount(): number {
    return this.pads.length;
  }

  private pad(i: number): PadSnapshot | undefined {
    return this.pads[i];
  }

  readDevice(d: Exclude<DeviceId, 'auto'>): InputFrame {
    switch (d) {
      case 'kb-left':
        return this.keyboard.read(KEYBOARD_P1);
      case 'kb-right':
        return this.keyboard.read(KEYBOARD_P2);
      default:
        return padToInput(this.pad(Number(d.slice(4))), GAMEPAD_DEFAULT);
    }
  }

  /** Input for local player `player` (0/1) in a two-player local match. */
  readLocal(player: number, assigned: DeviceId): InputFrame {
    if (assigned !== 'auto') return this.readDevice(assigned);
    const n = this.pads.length;
    if (n === 0) return this.readDevice(player === 0 ? 'kb-left' : 'kb-right');
    if (n === 1) return player === 0 ? this.readDevice('kb-left') : mergeInputs(this.readDevice('pad-0'), this.readDevice('kb-right'));
    return mergeInputs(this.readDevice(player === 0 ? 'pad-0' : 'pad-1'), this.readDevice(player === 0 ? 'kb-left' : 'kb-right'));
  }

  /** Input for a single local player: every keyboard layout + the first gamepad. */
  readSolo(assigned: DeviceId = 'auto'): InputFrame {
    if (assigned !== 'auto') return this.readDevice(assigned);
    let f = mergeInputs(this.readDevice('kb-left'), this.readDevice('kb-right'));
    if (this.pads.length > 0) f = mergeInputs(this.readDevice('pad-0'), f);
    return f;
  }

  /** True if a pause button is pressed this frame on any device. */
  pausePressed(keys: string[]): boolean {
    return keys.some((k) => MENU_KEYS.back.includes(k) || KEYBOARD_P1.pause.includes(k)) || this.padEdges().includes('start');
  }

  /** Menu actions since the last call, from every keyboard and gamepad. */
  menuActions(keys: string[]): MenuAction[] {
    const out: MenuAction[] = [];
    for (const k of keys) {
      for (const a of ['up', 'down', 'left', 'right', 'select', 'back'] as const) if (MENU_KEYS[a].includes(k)) out.push(a);
    }
    if (keys.length) this.lastDevice = 'keyboard';
    const padActions = this.padEdges();
    if (padActions.length) this.lastDevice = 'gamepad';
    return out.concat(padActions);
  }

  private padEdgeCache: { frame: number; actions: MenuAction[] } = { frame: -1, actions: [] };
  private frame = 0;

  /** Advances the per-frame edge cache (call once per frame after poll). */
  endFrame(): void {
    this.frame++;
  }

  private padEdges(): MenuAction[] {
    if (this.padEdgeCache.frame === this.frame) return this.padEdgeCache.actions;
    const actions: MenuAction[] = [];
    for (const p of this.pads) {
      const prev = this.prevPadButtons.get(p.index) ?? [];
      const edge = (i: number): boolean => !!p.buttons[i] && !prev[i];
      const dirs: [MenuAction, number, number, number][] = [
        ['up', MENU_PAD.up, 1, -1],
        ['down', MENU_PAD.down, 1, 1],
        ['left', MENU_PAD.left, 0, -1],
        ['right', MENU_PAD.right, 0, 1],
      ];
      for (const [a, btn, axis, sign] of dirs) {
        const stick = (p.axes[axis] ?? 0) * sign > 0.6;
        const held = !!p.buttons[btn] || stick;
        const key = `${p.index}:${a}`;
        const t = this.padRepeat.get(key) ?? 0;
        if (held) {
          if (t === 0 || (t > 18 && t % 6 === 0)) actions.push(a);
          this.padRepeat.set(key, t + 1);
        } else this.padRepeat.set(key, 0);
      }
      if (edge(MENU_PAD.select)) actions.push('select');
      if (edge(MENU_PAD.back)) actions.push('back');
      if (edge(MENU_PAD.start)) actions.push('start');
      this.prevPadButtons.set(p.index, [...p.buttons]);
    }
    this.padEdgeCache = { frame: this.frame, actions };
    return actions;
  }

  static empty(): InputFrame {
    return emptyInput();
  }
}
