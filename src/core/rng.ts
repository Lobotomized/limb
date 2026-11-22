/**
 * Seeded deterministic random number generator (mulberry32).
 * The whole generator state is one 32-bit integer, so it serializes trivially.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks an element (array must be non-empty). */
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }
}

/** Derives a well-mixed seed from several integers (e.g. match seed + fighter id + part index). */
export function mixSeed(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= v >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}
