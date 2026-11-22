/**
 * Stable, readable JSON for content files written by the fighter editor (and the
 * fighters:json tool). Objects/arrays that fit on one line (≤ `width` chars including their
 * indentation and key) are written inline; numbers are rounded to `digits` decimals so editor
 * float noise never shows up in diffs. Key order is preserved (insertion order).
 */
export function roundNumbers<T>(value: T, digits = 4): T {
  const f = Math.pow(10, digits);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') {
      const r = Math.round(v * f) / f;
      return Object.is(r, -0) ? 0 : r;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** One-line JSON with a space after commas and colons: {"kind": "circle", "radius": 0.17}. */
function inline(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  return `{${Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
    .join(', ')}}`;
}

export function formatJson(value: unknown, width = 100, digits = 4): string {
  const NL = '\n';
  const fmt = (v: unknown, indent: string, prefix: number): string => {
    const one = inline(v);
    if (v === null || typeof v !== 'object' || indent.length + prefix + one.length <= width) return one;
    const inner = indent + '  ';
    if (Array.isArray(v)) return '[' + NL + v.map((x) => inner + fmt(x, inner, 0)).join(',' + NL) + NL + indent + ']';
    const entries = Object.entries(v as Record<string, unknown>);
    return '{' + NL + entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner, k.length + 4)}`).join(',' + NL) + NL + indent + '}';
  };
  return fmt(roundNumbers(value, digits), '', 0) + NL;
}
