/** Gamepad polling (W3C standard mapping) and conversion to InputFrames. */
import { AimMode, Button, MOVE_BUTTON_BITS, ACTION_BUTTONS, quantizeAxis, emptyInput, type InputFrame } from './input-frame';
import type { GamepadBinding } from './bindings';

export interface PadSnapshot {
  index: number;
  id: string;
  axes: number[];
  buttons: boolean[];
}

/** Reads connected gamepads (null-safe outside browsers). */
export function pollGamepads(): PadSnapshot[] {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const pads = nav?.getGamepads ? nav.getGamepads() : [];
  const out: PadSnapshot[] = [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    out.push({ index: p.index, id: p.id, axes: [...p.axes], buttons: p.buttons.map((b) => b.pressed || b.value > 0.5) });
  }
  return out;
}

function radial(x: number, y: number, dz: number): [number, number] {
  const m = Math.sqrt(x * x + y * y);
  if (m < dz) return [0, 0];
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  return [(x / m) * scaled, (y / m) * scaled];
}

export function padToInput(p: PadSnapshot | undefined, b: GamepadBinding): InputFrame {
  if (!p) return emptyInput();
  const [mx, my] = radial(p.axes[b.moveAxes[0]] ?? 0, p.axes[b.moveAxes[1]] ?? 0, b.deadzone);
  const [ax, ay] = radial(p.axes[b.aimAxes[0]] ?? 0, p.axes[b.aimAxes[1]] ?? 0, b.deadzone);
  let buttons = 0;
  b.moves.forEach((bi, i) => {
    if (p.buttons[bi]) buttons |= MOVE_BUTTON_BITS[i]!;
  });
  if (b.dash.some((bi) => p.buttons[bi])) buttons |= Button.DASH;
  b.actions.forEach((list, i) => {
    if (list.some((bi) => p.buttons[bi])) buttons |= ACTION_BUTTONS[i]!;
  });
  const aiming = ax !== 0 || ay !== 0;
  // Screen y points down on sticks; world y points up.
  return {
    moveX: quantizeAxis(mx),
    moveY: quantizeAxis(-my),
    aimX: aiming ? quantizeAxis(ax) : 0,
    aimY: aiming ? quantizeAxis(-ay) : 0,
    aimMode: aiming ? AimMode.VECTOR : AimMode.AUTO,
    buttons,
  };
}
