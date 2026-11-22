/**
 * Fixed-tick accumulator. The caller passes real elapsed time (measured outside core);
 * this returns how many 1/60 s ticks to simulate and the interpolation alpha for rendering.
 * Pure logic: it never reads a clock itself.
 */
export class FixedTickLoop {
  private accumulator = 0;
  readonly tickMs: number;

  constructor(
    ticksPerSecond = 60,
    /** Never simulate more than this many ticks per frame (avoids a spiral of death). */
    private readonly maxTicksPerFrame = 8,
  ) {
    this.tickMs = 1000 / ticksPerSecond;
  }

  /** Adds elapsed milliseconds; returns the number of ticks to run now. */
  advance(elapsedMs: number): number {
    this.accumulator += Math.max(0, elapsedMs);
    let n = Math.floor(this.accumulator / this.tickMs);
    if (n > this.maxTicksPerFrame) {
      n = this.maxTicksPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator -= n * this.tickMs;
    }
    return n;
  }

  /** Fraction of the next tick already elapsed (0..1), for render interpolation. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.tickMs);
  }

  /** Slows or speeds the accumulator (used by rollback time-sync). */
  nudge(ms: number): void {
    this.accumulator += ms;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
