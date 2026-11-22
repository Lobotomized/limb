import { describe, expect, it } from 'vitest';
import { decodeInput, encodeInput, mergeInputs, AimMode, Button, emptyInput } from '../src/input/input-frame';
import { KeyboardState } from '../src/input/keyboard';
import { KEYBOARD_P1, KEYBOARD_P2, GAMEPAD_DEFAULT } from '../src/input/bindings';
import { padToInput } from '../src/input/gamepad';

function kb(codes: string[]): KeyboardState {
  const k = new KeyboardState();
  const listeners: Record<string, (e: unknown) => void> = {};
  k.attach({ addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f) } as unknown as Window);
  for (const code of codes) listeners.keydown!({ code, repeat: false, preventDefault() {} });
  return k;
}

describe('input frames', () => {
  it('round-trip through the 7-byte wire format', () => {
    const f = { moveX: -127, moveY: 64, aimX: 3, aimY: -90, aimMode: AimMode.VECTOR, buttons: 0x1ff };
    const bytes = encodeInput(f);
    expect(bytes.length).toBe(7);
    expect(decodeInput(bytes)).toEqual(f);
  });

  it('keyboard P1: WASD world-relative, Q/E turn, F G H R T Y = moves 1-6, Shift dash, spare actions', () => {
    const f = kb(['KeyW', 'KeyD', 'KeyQ', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyV']).read(KEYBOARD_P1);
    expect(f.moveX).toBeGreaterThan(80);
    expect(f.moveY).toBeGreaterThan(80); // up on screen = +y in the world
    expect(f.aimMode).toBe(AimMode.TURN_LEFT);
    expect(f.buttons).toBe(Button.MOVE1 | Button.MOVE2 | Button.DASH | Button.ACTION1);
    const all = kb(['KeyF', 'KeyG', 'KeyH', 'KeyR', 'KeyT', 'KeyY']).read(KEYBOARD_P1);
    expect(all.buttons).toBe(Button.MOVE1 | Button.MOVE2 | Button.MOVE3 | Button.MOVE4 | Button.MOVE5 | Button.MOVE6);
  });

  it('keyboard P2 numpad and no-numpad fallback', () => {
    const a = kb(['ArrowLeft', 'Numpad9', 'Numpad2', 'Numpad6', 'Numpad0']).read(KEYBOARD_P2);
    const b = kb(['ArrowLeft', 'Period', 'KeyK', 'KeyO', 'ShiftRight']).read(KEYBOARD_P2);
    expect(a).toEqual(b);
    expect(a.moveX).toBe(-127);
    expect(a.aimMode).toBe(AimMode.TURN_RIGHT);
    expect(a.buttons).toBe(Button.MOVE2 | Button.MOVE6 | Button.DASH);
  });

  it('gamepad twin-stick mapping: X Y B LB RB RT = moves 1-6, A or LT dash, right stick aims', () => {
    const buttons = new Array(17).fill(false);
    buttons[2] = true; // X
    buttons[7] = true; // RT
    buttons[0] = true; // A
    const f = padToInput({ index: 0, id: 'pad', axes: [1, 0, 0, -1], buttons }, GAMEPAD_DEFAULT);
    expect(f.moveX).toBe(127);
    expect(f.aimMode).toBe(AimMode.VECTOR);
    expect(f.aimY).toBe(127); // stick up = world +y
    expect(f.buttons).toBe(Button.MOVE1 | Button.MOVE6 | Button.DASH);
    const idle = padToInput({ index: 0, id: 'pad', axes: [0.1, 0.1, 0.05, 0], buttons: new Array(17).fill(false) }, GAMEPAD_DEFAULT);
    expect(idle).toEqual(emptyInput()); // deadzone; released aim stick = auto-face opponent
  });

  it('merges two devices for one player', () => {
    const m = mergeInputs({ ...emptyInput(), moveX: 20, buttons: Button.MOVE1 }, { ...emptyInput(), moveX: -100, aimMode: AimMode.VECTOR, aimX: 5, buttons: Button.DASH });
    expect(m.moveX).toBe(-100);
    expect(m.aimMode).toBe(AimMode.VECTOR);
    expect(m.buttons).toBe(Button.MOVE1 | Button.DASH);
  });
});

describe('input sanitizing', () => {
  it('never produces -0 or out-of-range values', async () => {
    const { sanitizeInput, quantizeAxis } = await import('../src/core/input-frame');
    expect(Object.is(quantizeAxis(-0.001), 0)).toBe(true);
    const s = sanitizeInput({ moveX: -0, moveY: 300.7, aimX: -999, aimY: NaN, aimMode: 7, buttons: 0xfff });
    expect(Object.is(s.moveX, 0)).toBe(true);
    expect(s).toEqual({ moveX: 0, moveY: 127, aimX: -127, aimY: 0, aimMode: 3, buttons: 0x1ff });
  });
});
