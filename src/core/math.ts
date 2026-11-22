/**
 * Deterministic math for the simulation.
 *
 * `Math.sin/cos/atan2/...` are implementation-defined in JavaScript and may differ in
 * the last bits between engines, which would break rollback netcode. Everything here is
 * built from + - * / Math.sqrt Math.round Math.floor Math.abs, which IEEE 754 and the
 * ECMAScript spec define exactly.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const SQRT3_INV = 0.5773502691896257; // 1/sqrt(3) = tan(pi/6)
const TAN_PI_12 = 0.2679491924311227; // tan(pi/12)
const PI_6 = 0.5235987755982988;

/** Wraps an angle into [-PI, PI]. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.round(a / TAU);
}

/** Deterministic sine. Max error ~1e-9 over all inputs. */
export function sin(x: number): number {
  let a = wrapAngle(x);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const a2 = a * a;
  // Taylor series to x^15, Horner form; |a| <= pi/2.
  return (
    a *
    (1 +
      a2 *
        (-1 / 6 +
          a2 *
            (1 / 120 +
              a2 *
                (-1 / 5040 +
                  a2 * (1 / 362880 + a2 * (-1 / 39916800 + a2 * (1 / 6227020800 + a2 * (-1 / 1307674368000))))))))
  );
}

/** Deterministic cosine. */
export function cos(x: number): number {
  return sin(x + HALF_PI);
}

/** atan for |x| <= tan(pi/12) via series. */
function atanSmall(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 3 + x2 * (1 / 5 + x2 * (-1 / 7 + x2 * (1 / 9 + x2 * (-1 / 11 + x2 * (1 / 13 + x2 * (-1 / 15))))))));
}

/** Deterministic arctangent. */
export function atan(x: number): number {
  if (x !== x) return x; // NaN
  const neg = x < 0;
  let v = neg ? -x : x;
  let offset = 0;
  let invert = false;
  if (v > 1) {
    v = 1 / v;
    invert = true;
  }
  if (v > TAN_PI_12) {
    v = (v - SQRT3_INV) / (1 + v * SQRT3_INV);
    offset = PI_6;
  }
  let r = offset + atanSmall(v);
  if (invert) r = HALF_PI - r;
  return neg ? -r : r;
}

/** Deterministic atan2 (same quadrant conventions as Math.atan2). */
export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Signed shortest difference b - a between two angles, in [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (d > maxDelta) return current + maxDelta;
  if (d < -maxDelta) return current - maxDelta;
  return target;
}

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const vlen = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

/** Rotates a vector by angle `a` (counter-clockwise, y-up). */
export function vrotate(v: Vec2, a: number): Vec2 {
  const c = cos(a);
  const s = sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Normalizes a vector; returns (0,0) for a zero vector. */
export function vnorm(v: Vec2): Vec2 {
  const l = vlen(v);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

/** Unit vector for an angle. */
export const fromAngle = (a: number): Vec2 => ({ x: cos(a), y: sin(a) });
