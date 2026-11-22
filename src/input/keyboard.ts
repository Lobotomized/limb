/** Keyboard state tracking and conversion to InputFrames. */
import { AimMode, Button, SLOT_BUTTONS, ACTION_BUTTONS, quantizeAxis, type InputFrame } from './input-frame';
import type { KeyboardBinding } from './bindings';

export class KeyboardState {
  private readonly down = new Set<string>();
  private readonly pressedQueue: string[] = [];
  private readonly onDown = (e: KeyboardEvent): void => {
    if (!e.repeat) this.pressedQueue.push(e.code);
    this.down.add(e.code);
    // Keep game keys from scrolling the page or triggering browser shortcuts.
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code.startsWith('Numpad') || e.code === 'Tab') e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();

  attach(target: Window): void {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(target: Window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
    target.removeEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  any(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** Key codes pressed since the last call (for menus). */
  takePressed(): string[] {
    return this.pressedQueue.splice(0);
  }

  /** Builds an InputFrame for one keyboard binding. */
  read(b: KeyboardBinding): InputFrame {
    let x = (this.any(b.right) ? 1 : 0) - (this.any(b.left) ? 1 : 0);
    let y = (this.any(b.up) ? 1 : 0) - (this.any(b.down) ? 1 : 0); // world y is up
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    let buttons = 0;
    b.slots.forEach((codes, i) => {
      if (this.any(codes)) buttons |= SLOT_BUTTONS[i]!;
    });
    if (this.any(b.dash)) buttons |= Button.DASH;
    b.actions.forEach((codes, i) => {
      if (this.any(codes)) buttons |= ACTION_BUTTONS[i]!;
    });
    const tl = this.any(b.turnLeft);
    const tr = this.any(b.turnRight);
    const aimMode = tl && !tr ? AimMode.TURN_LEFT : tr && !tl ? AimMode.TURN_RIGHT : AimMode.AUTO;
    return { moveX: quantizeAxis(x), moveY: quantizeAxis(y), aimX: 0, aimY: 0, aimMode, buttons };
  }
}
