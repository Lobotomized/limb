/**
 * Every global gameplay constant lives here. Per-fighter numbers live in the fighter files.
 * Change one thing at a time and re-run `npm run sim:bots` (see the balance-tuning skill).
 */
export const TUNING = {
  ticksPerSecond: 60,

  // ---- damage (core/damage.ts)
  /** Damage per unit of impact above the threshold. impact = closingSpeed (m/s) * reducedMass (kg). */
  damageScale: 1.6,
  /** Impacts at or below this deal nothing (gentle touches). */
  impactThreshold: 4,
  /** Cap on a single hit's damage. */
  maxHitDamage: 45,
  /** Ticks before the same part pair (or part-wall pair) can deal damage again. */
  pairCooldownTicks: 9,
  /** Multiplier on wall hits (impact uses the part's own mass). */
  wallDamageScale: 1.0,

  // ---- hit-stop (core/match.ts)
  /** Damage of a "big hit" (used by hit-stop and every presentation effect scale). */
  bigHitDamage: 30,
  /** Damage below which a hit causes no hit-stop. */
  hitStopMinDamage: 10,
  hitStopMaxTicks: 6,
  coreDeathHitStopTicks: 18,

  // ---- round flow
  countdownTicks: 90,
  roundEndTicks: 120,
  roundsToWin: 2,
  /** Debris lifetime before removal. */
  debrisTicks: 120,

  // ---- physics feel
  /** Ground friction emulation, scaled per fighter by mass (heavier = slower to stop). */
  linearDamping: 3.2,
  angularDamping: 5.0,
  /** Fighter mass at which damping is exactly the base value. */
  dampingReferenceMass: 14,
  /** Damping scale clamp so extreme masses stay playable. */
  dampingScaleMin: 0.6,
  dampingScaleMax: 1.6,
  /** Debris damping (slides a while then settles). */
  debrisLinearDamping: 1.5,
  debrisAngularDamping: 1.5,
  partRestitution: 0.35,
  partFriction: 0.2,
  wallRestitution: 0.45,
  wallFriction: 0.3,
  solverIterations: 8,

  // ---- joint motors (core/moves.ts)
  /** Motor stiffness (N·m/rad) per unit of joint strength. */
  motorStiffnessPerStrength: 6,
  /** Return speed (rad/s) for joints with no move history. */
  defaultReturnSpeed: 8,

  // ---- locomotion (core/locomotion.ts)
  /** Proportional gain of the steering controller (1/s). */
  steerGain: 8,
  /** Force share when no locomotion part is left. */
  driftForceShare: 0.1,
  /** Max-speed share when no locomotion part is left. */
  driftSpeedShare: 0.25,
  /** Turn controller: desired angular velocity per radian of facing error. */
  turnGain: 7,
  dashCooldownTicks: 45,
  /** Stick deadzone for movement and move-direction selection (0..1). */
  stickDeadzone: 0.3,
  /** Ticks of "aim stick released" before facing returns to auto-tracking. */
  aimReleaseTicks: 0,
} as const;

export type Tuning = { -readonly [K in keyof typeof TUNING]: number };

/** Mutable copy (the sandbox can edit it live; matches pass it in their context). */
export function defaultTuning(): Tuning {
  return { ...TUNING };
}
