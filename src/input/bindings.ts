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
  /** Move buttons 1-6 (each triggers one move). */
  moves: [string[], string[], string[], string[], string[], string[]];
  dash: string[];
  /** Spare buttons for future abilities (ignored today). */
  actions: [string[], string[]];
  pause: string[];
}

export interface GamepadBinding {
  moveAxes: [number, number];
  aimAxes: [number, number];
  /** Move buttons 1-6 (each triggers one move). */
  moves: [number, number, number, number, number, number];
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
  // Moves 1-3 on the home row, 4-6 on the row above.
  moves: [['KeyF'], ['KeyG'], ['KeyH'], ['KeyR'], ['KeyT'], ['KeyY']],
  dash: ['ShiftLeft'],
  actions: [['KeyV'], ['KeyC']],
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
  // Moves 1-3 on numpad 1-3 / J K L, 4-6 on numpad 4-6 / U I O.
  moves: [['Numpad1', 'KeyJ'], ['Numpad2', 'KeyK'], ['Numpad3', 'KeyL'], ['Numpad4', 'KeyU'], ['Numpad5', 'KeyI'], ['Numpad6', 'KeyO']],
  dash: ['Numpad0', 'ShiftRight'],
  actions: [['NumpadAdd', 'KeyP'], ['NumpadEnter', 'Semicolon']],
  pause: ['Escape'],
};

/**
 * Twin-stick default: left stick move, right stick aim, X Y B LB RB RT = moves 1-6, A or LT dash,
 * Start pause. A (menu select) never starts a move, so confirming a menu can't trigger one.
 */
export const GAMEPAD_DEFAULT: GamepadBinding = {
  moveAxes: [0, 1],
  aimAxes: [2, 3],
  moves: [2, 3, 1, 4, 5, 7], // X, Y, B, LB, RB, RT
  dash: [0, 6], // A, LT
  actions: [[10], [11]], // L3, R3 (spare)
  pause: [9], // Start
  deadzone: 0.25,
};

/** W3C standard-mapping button names, for UI hints. */
export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3'];

/** Short hint for move button 1-6 on P1's keyboard and on a gamepad, e.g. "F / A". */
export function moveButtonHint(button: number): string {
  const key = (KEYBOARD_P1.moves[button - 1]?.[0] ?? '').replace(/^Key/, '');
  const pad = PAD_BUTTON_NAMES[GAMEPAD_DEFAULT.moves[button - 1] ?? -1] ?? '';
  return `${key} / ${pad}`;
}

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
