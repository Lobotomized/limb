/** Match driver for online play: wraps a RollbackSession (prediction, rollback, time-sync). */
import type { SimEvent } from '../core/events';
import type { InputFrame } from '../core/input-frame';
import type { SimState } from '../core/state';
import type { RollbackSession } from '../net/rollback';
import { captureFrame, type RenderFrame } from '../render/frame';
import type { MatchDriver } from './drivers';

export class OnlineDriver implements MatchDriver {
  prevFrame: RenderFrame | null = null;
  currFrame: RenderFrame;

  constructor(
    readonly session: RollbackSession,
    private readonly readLocal: () => InputFrame,
    private readonly extraStatus: () => string,
  ) {
    this.currFrame = captureFrame(session.sim);
  }

  get sim(): SimState {
    return this.session.sim;
  }

  tick(): SimEvent[] {
    const events = this.session.poll();
    if (this.session.shouldStall()) {
      this.session.stalls++;
      this.session.sendInputs();
      return events;
    }
    this.session.addLocalInput(this.readLocal());
    events.push(...this.session.advance());
    this.prevFrame = this.currFrame;
    this.currFrame = captureFrame(this.sim);
    return events;
  }

  status(): string {
    const extra = this.extraStatus();
    return `${this.session.status()}${extra ? ` · ${extra}` : ''}`;
  }

  dispose(): void {
    this.sim.physics.free();
  }
}
