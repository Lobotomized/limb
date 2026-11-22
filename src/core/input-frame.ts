/**
 * One player's input for one tick. This is what the simulation, bots and the network see.
 * Sticks are quantized to integers in [-127, 127] so inputs are exact and compact.
 * The format already carries two spare `action` buttons for future abilities.
 */
export const Button = {
  SLOT1: 1 << 0,
  SLOT2: 1 << 1,
  SLOT3: 1 << 2,
  SLOT4: 1 << 3,
  DASH: 1 << 4,
  ACTION1: 1 << 5,
  ACTION2: 1 << 6,
} as const;

export const SLOT_BUTTONS = [Button.SLOT1, Button.SLOT2, Button.SLOT3, Button.SLOT4] as const;
export const ACTION_BUTTONS = [Button.ACTION1, Button.ACTION2] as const;

/** How facing is controlled this tick. */
export const AimMode = {
  /** Face the opponent's core. */
  AUTO: 0,
  /** Face along (aimX, aimY). */
  VECTOR: 1,
  /** Rotate left (counter-clockwise) at turn speed. */
  TURN_LEFT: 2,
  /** Rotate right (clockwise) at turn speed. */
  TURN_RIGHT: 3,
} as const;

export interface InputFrame {
  /** Movement stick, world space (y up), -127..127. */
  moveX: number;
  moveY: number;
  /** Aim stick, world space, -127..127 (used when aimMode = VECTOR). */
  aimX: number;
  aimY: number;
  aimMode: number;
  /** Bitmask of Button. */
  buttons: number;
}

export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimMode: AimMode.AUTO, buttons: 0 });

export function emptyInput(): InputFrame {
  return { ...EMPTY_INPUT };
}

export function inputsEqual(a: InputFrame, b: InputFrame): boolean {
  return a.moveX === b.moveX && a.moveY === b.moveY && a.aimX === b.aimX && a.aimY === b.aimY && a.aimMode === b.aimMode && a.buttons === b.buttons;
}

/** Clamps/rounds a float stick value in [-1, 1] to the wire range. */
export function quantizeAxis(v: number): number {
  const q = Math.round(v * 127);
  return (q < -127 ? -127 : q > 127 ? 127 : q) | 0; // | 0 also turns -0 into 0
}

/**
 * Coerces any input into exact wire values (integers in range, no -0). The simulation
 * calls this on every input so local and network inputs are bit-identical.
 */
export function sanitizeInput(f: InputFrame): InputFrame {
  const ax = (v: number): number => {
    const q = Math.round(Number.isFinite(v) ? v : 0) | 0;
    return q < -127 ? -127 : q > 127 ? 127 : q;
  };
  return { moveX: ax(f.moveX), moveY: ax(f.moveY), aimX: ax(f.aimX), aimY: ax(f.aimY), aimMode: (f.aimMode | 0) & 3, buttons: (f.buttons | 0) & 0xff };
}
