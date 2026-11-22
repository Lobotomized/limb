/**
 * ALL input bindings live here. Keyboard codes are KeyboardEvent.code values; gamepad
 * indices follow the W3C "standard" mapping. Both players can use either device.
 */
export interface KeyboardBinding {
  id: string;
  label: string;
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  turnLeft: string[];
  turnRight: string[];
  /** Attack buttons A and B. */
  attacks: [string[], string[]];
  dash: string[];
  /** Spare buttons for future abilities (ignored today). */
  actions: [string[], string[]];
  pause: string[];
}

export interface GamepadBinding {
  moveAxes: [number, number];
  aimAxes: [number, number];
  attacks: [number, number];
  dash: number[];
  actions: [number[], number[]];
  pause: number[];
  deadzone: number;
}

export const KEYBOARD_P1: KeyboardBinding = {
  id: 'kb-left',
  label: 'Keyboard (left)',
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['KeyQ'],
  turnRight: ['KeyE'],
  attacks: [['KeyF'], ['KeyG']],
  dash: ['ShiftLeft'],
  actions: [['KeyR'], ['KeyV']],
  pause: ['Escape'],
};

/** P2 uses the arrow keys + numpad, with a no-numpad fallback on the same binding. */
export const KEYBOARD_P2: KeyboardBinding = {
  id: 'kb-right',
  label: 'Keyboard (right)',
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  turnLeft: ['Numpad7', 'Comma'],
  turnRight: ['Numpad9', 'Period'],
  attacks: [['Numpad1', 'KeyJ'], ['Numpad2', 'KeyK']],
  dash: ['Numpad0', 'ShiftRight'],
  actions: [['NumpadAdd', 'KeyO'], ['NumpadEnter', 'KeyU']],
  pause: ['Escape'],
};

/** Twin-stick default: left stick move, right stick aim, X = attack A, Y = attack B, RB dash, Start pause. */
export const GAMEPAD_DEFAULT: GamepadBinding = {
  moveAxes: [0, 1],
  aimAxes: [2, 3],
  attacks: [2, 3], // X, Y
  dash: [5, 0], // RB, A
  actions: [[4], [7]], // LB, RT (spare)
  pause: [9], // Start
  deadzone: 0.25,
};

/** Menu navigation keys (any keyboard). */
export const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  select: ['Enter', 'Space', 'KeyF', 'NumpadEnter'],
  back: ['Escape', 'Backspace'],
};

/** Menu navigation on gamepads (standard mapping). */
export const MENU_PAD = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  select: 0, // A
  back: 1, // B
  start: 9,
};

/** Device choices for a player slot. */
export type DeviceId = 'auto' | 'kb-left' | 'kb-right' | 'pad-0' | 'pad-1' | 'pad-2' | 'pad-3';
export const DEVICE_LABELS: Record<DeviceId, string> = {
  auto: 'Auto',
  'kb-left': 'Keyboard (left)',
  'kb-right': 'Keyboard (right)',
  'pad-0': 'Gamepad 1',
  'pad-1': 'Gamepad 2',
  'pad-2': 'Gamepad 3',
  'pad-3': 'Gamepad 4',
};
