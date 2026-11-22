/**
 * Input frames for the game and the network. The type itself lives in core (the simulation
 * consumes it); this module adds the compact binary wire format.
 *
 * Wire format per frame (6 bytes): moveX i8, moveY i8, aimX i8, aimY i8, aimMode u8, buttons u8.
 */
export { AimMode, Button, SLOT_BUTTONS, ACTION_BUTTONS, EMPTY_INPUT, emptyInput, inputsEqual, quantizeAxis, type InputFrame } from '../core/input-frame';
import type { InputFrame } from '../core/input-frame';

export const INPUT_BYTES = 6;

export function writeInput(view: DataView, offset: number, f: InputFrame): void {
  view.setInt8(offset, f.moveX);
  view.setInt8(offset + 1, f.moveY);
  view.setInt8(offset + 2, f.aimX);
  view.setInt8(offset + 3, f.aimY);
  view.setUint8(offset + 4, f.aimMode);
  view.setUint8(offset + 5, f.buttons);
}

export function readInput(view: DataView, offset: number): InputFrame {
  return {
    moveX: view.getInt8(offset),
    moveY: view.getInt8(offset + 1),
    aimX: view.getInt8(offset + 2),
    aimY: view.getInt8(offset + 3),
    aimMode: view.getUint8(offset + 4),
    buttons: view.getUint8(offset + 5),
  };
}

export function encodeInput(f: InputFrame): Uint8Array {
  const out = new Uint8Array(INPUT_BYTES);
  writeInput(new DataView(out.buffer), 0, f);
  return out;
}

export function decodeInput(bytes: Uint8Array): InputFrame {
  return readInput(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0);
}

/** Combines two inputs (e.g. keyboard + gamepad for one player): buttons OR'ed, larger stick wins. */
export function mergeInputs(a: InputFrame, b: InputFrame): InputFrame {
  const pick = (x: number, y: number): number => (Math.abs(y) > Math.abs(x) ? y : x);
  const aimFromB = b.aimMode !== 0 && a.aimMode === 0;
  return {
    moveX: pick(a.moveX, b.moveX),
    moveY: pick(a.moveY, b.moveY),
    aimX: aimFromB ? b.aimX : a.aimX,
    aimY: aimFromB ? b.aimY : a.aimY,
    aimMode: aimFromB ? b.aimMode : a.aimMode,
    buttons: a.buttons | b.buttons,
  };
}
