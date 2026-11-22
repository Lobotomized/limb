/**
 * Match drivers advance the simulation. The local driver steps with local inputs
 * (keyboard/gamepad/bot). The online driver (app/online-driver.ts) wraps a rollback session.
 */
import type { SimEvent } from '../core/events';
import type { InputFrame } from '../core/input-frame';
import { step } from '../core/simulation';
import type { SimState } from '../core/state';
import { captureFrame, type RenderFrame } from '../render/frame';

export type InputProvider = (sim: SimState, fighter: number) => InputFrame;

export interface MatchDriver {
  readonly sim: SimState;
  /** Runs one tick; returns presentation events. */
  tick(): SimEvent[];
  /** Frames for interpolation: previous and current tick. */
  readonly prevFrame: RenderFrame | null;
  readonly currFrame: RenderFrame;
  /** Called once per rendered frame before ticks (e.g. to poll devices or the network). */
  beginFrame?(): void;
  /** Optional time-sync adjustment in ms (online). */
  timeSyncMs?(): number;
  /** Optional status line (online: ping, desync). */
  status?(): string;
  dispose(): void;
}

export class LocalDriver implements MatchDriver {
  prevFrame: RenderFrame | null = null;
  currFrame: RenderFrame;

  constructor(
    public sim: SimState,
    private readonly providers: [InputProvider, InputProvider],
  ) {
    this.currFrame = captureFrame(sim);
  }

  tick(): SimEvent[] {
    const inputs: [InputFrame, InputFrame] = [this.providers[0](this.sim, 0), this.providers[1](this.sim, 1)];
    const events = step(this.sim, inputs);
    this.prevFrame = this.currFrame;
    this.currFrame = captureFrame(this.sim);
    return events;
  }

  dispose(): void {
    this.sim.physics.free();
  }
}
