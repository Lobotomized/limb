/**
 * Seeded random input generator for determinism and netcode tests. Inputs change every
 * few ticks (like a mashing player), so moves, dashes and turns all get exercised.
 */
import { AimMode, BUTTON_MASK, type InputFrame } from '../core/input-frame';
import { Rng } from '../core/rng';

export class RandomInputs {
  private readonly rng: Rng;
  private current: InputFrame;
  private hold = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.current = this.make();
  }

  private make(): InputFrame {
    const r = this.rng;
    return {
      moveX: r.chance(0.7) ? r.int(-127, 127) : 0,
      moveY: r.chance(0.7) ? r.int(-127, 127) : 0,
      aimX: r.int(-127, 127),
      aimY: r.int(-127, 127),
      aimMode: r.pick([AimMode.AUTO, AimMode.AUTO, AimMode.VECTOR, AimMode.TURN_LEFT, AimMode.TURN_RIGHT]),
      buttons: r.int(0, BUTTON_MASK) & r.int(0, BUTTON_MASK),
    };
  }

  next(): InputFrame {
    if (this.hold <= 0) {
      this.current = this.make();
      this.hold = this.rng.int(1, 12);
    }
    this.hold--;
    return { ...this.current };
  }
}
