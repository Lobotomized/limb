/**
 * Deterministic fake network: latency, jitter, packet loss and reordering on a virtual
 * clock. Pair with FakeTransport. `advance(ms)` delivers every packet that is due.
 */
import { Rng } from '../core/rng';

export interface NetConditions {
  /** One-way base latency in ms. */
  latencyMs: number;
  /** +/- random extra latency in ms (causes reordering). */
  jitterMs: number;
  /** 0..1 probability a packet is dropped. */
  loss: number;
}

interface InFlight {
  at: number;
  seq: number;
  to: (d: Uint8Array) => void;
  data: Uint8Array;
}

export class NetSimulator {
  now = 0;
  private seq = 0;
  private queue: InFlight[] = [];
  private readonly rng: Rng;
  sent = 0;
  dropped = 0;

  constructor(
    public conditions: NetConditions,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
  }

  /** Schedules a packet for delivery (or drops it). */
  transmit(data: Uint8Array, to: (d: Uint8Array) => void): void {
    this.sent++;
    if (this.rng.chance(this.conditions.loss)) {
      this.dropped++;
      return;
    }
    const jitter = this.conditions.jitterMs ? this.rng.range(-this.conditions.jitterMs, this.conditions.jitterMs) : 0;
    const at = this.now + Math.max(0, this.conditions.latencyMs + jitter);
    this.queue.push({ at, seq: this.seq++, to, data: data.slice() });
  }

  /** Advances the virtual clock and delivers due packets in arrival order. */
  advance(ms: number): void {
    this.now += ms;
    const due = this.queue.filter((p) => p.at <= this.now).sort((a, b) => a.at - b.at || a.seq - b.seq);
    this.queue = this.queue.filter((p) => p.at > this.now);
    for (const p of due) p.to(p.data);
  }
}
