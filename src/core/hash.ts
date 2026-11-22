/**
 * Small deterministic hashing utilities used for state hashes (desync detection).
 * 64-bit result built from two FNV-1a style lanes, returned as a 16-char hex string.
 */
export class Hasher {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9;
  private readonly f64 = new Float64Array(1);
  private readonly u32 = new Uint32Array(this.f64.buffer);

  /** Mixes one unsigned 32-bit integer. */
  u32v(v: number): this {
    this.a = Math.imul(this.a ^ (v >>> 0), 0x01000193) >>> 0;
    this.b = Math.imul(this.b ^ ((v >>> 0) + 0x7f4a7c15), 0x5bd1e995) >>> 0;
    this.b = (this.b ^ (this.b >>> 15)) >>> 0;
    return this;
  }

  /** Mixes the exact bit pattern of a float64 (so -0 and 0 differ, as they should for determinism). */
  num(v: number): this {
    this.f64[0] = v;
    return this.u32v(this.u32[0] as number).u32v(this.u32[1] as number);
  }

  bytes(data: Uint8Array): this {
    for (let i = 0; i < data.length; i++) this.u32v(data[i] as number);
    return this;
  }

  str(s: string): this {
    this.u32v(s.length);
    for (let i = 0; i < s.length; i++) this.u32v(s.charCodeAt(i));
    return this;
  }

  /** Mixes any JSON-compatible value with sorted object keys. */
  value(v: unknown): this {
    if (v === null || v === undefined) return this.u32v(0xdead);
    if (typeof v === 'number') return this.u32v(1).num(v);
    if (typeof v === 'boolean') return this.u32v(v ? 3 : 2);
    if (typeof v === 'string') return this.u32v(4).str(v);
    if (Array.isArray(v)) {
      this.u32v(5).u32v(v.length);
      for (const item of v) this.value(item);
      return this;
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v as object).sort();
      this.u32v(6).u32v(keys.length);
      for (const k of keys) this.str(k).value((v as Record<string, unknown>)[k]);
      return this;
    }
    return this;
  }

  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0');
  }
}
