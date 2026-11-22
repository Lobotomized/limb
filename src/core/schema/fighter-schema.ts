/**
 * Fighter definition types. Fighters are pure data (src/content/fighters/<id>/fighter.ts)
 * validated at load time by ./validate.ts. Content may import ONLY these types.
 *
 * Conventions: meters, kilograms, radians, y up, counter-clockwise positive.
 * The root part's local +x axis is the fighter's facing direction.
 */

export type ShapeDef =
  | { kind: 'capsule'; length: number; radius: number } // along local x; length is tip-to-tip
  | { kind: 'circle'; radius: number }
  | { kind: 'polygon'; points: [number, number][] }; // convex, counter-clockwise

/** Well-known part tags. Any other string is allowed (for abilities and bot hints). */
export type PartTag = 'locomotion' | 'armor' | (string & {});

export interface PartDef {
  id: string;
  /** Shown in the HUD, e.g. "Left arm". */
  name: string;
  shape: ShapeDef;
  mass: number;
  maxHealth: number;
  tags?: PartTag[];
  /** Extra fields added by abilities, keyed by ability id. */
  abilities?: Record<string, unknown>;
}

export interface JointDef {
  id: string;
  parent: string;
  child: string;
  /** Anchor in the parent's local space. */
  anchorParent: [number, number];
  /** Anchor in the child's local space. */
  anchorChild: [number, number];
  /** Optional [min, max] relative angle (child minus parent), radians. */
  limits?: [number, number];
  /** Max motor torque (N·m). How hard this joint pushes toward its target. */
  strength: number;
  /** Motor damping (N·m·s/rad). */
  damping: number;
  /** Relative angle (child minus parent) of the idle pose. */
  idleAngle: number;
}

/**
 * The six move buttons. Every fighter has exactly six moves, one per button. A move is
 * triggered by its button alone; the movement stick only moves the fighter.
 */
export type MoveButton = 1 | 2 | 3 | 4 | 5 | 6;
export const MOVE_BUTTONS: readonly MoveButton[] = [1, 2, 3, 4, 5, 6];

/**
 * One step of a move. Phases run in order; each one retargets some joints and may spin or
 * drive the body. A move is still only motion of the fighter's own parts (rule 6).
 */
export interface MovePhase {
  /**
   * Joint targets set in this phase. Joints not listed keep the target an earlier phase of the
   * same move gave them (or stay at idle).
   */
  targets: { joint: string; angle: number }[];
  /** Radians per second this phase's targets travel toward their angles. */
  speed: number;
  /** Ticks (1/60 s) the phase lasts. */
  ticks: number;
  /**
   * Optional: after `ticks`, the phase keeps going while the button is still held (a guard, a
   * cocked swing, a held spin), up to `maxHoldTicks` more (default: tuning `moveMaxHoldTicks`).
   * Releasing moves on to the next phase.
   */
  hold?: boolean;
  maxHoldTicks?: number;
  /** Optional: the root spins at this angular velocity (rad/s, + = counter-clockwise) instead of turning toward the aim. */
  spin?: number;
  /**
   * Optional: the root is driven at this velocity (m/s) in the fighter's own frame: [forward, left].
   * Replaces walking for the phase; scales with surviving locomotion parts like walking does.
   */
  drive?: [number, number];
}

export interface MoveDef {
  /** Input: the move button (1-6) that triggers this move. */
  button: MoveButton;
  name: string;
  /** One short line shown in the move list. */
  description: string;
  phases: MovePhase[];
  /** Radians per second back to the idle pose after the move ends. */
  returnSpeed: number;
  /** Parts that must be alive (and attached) for the move to be usable. */
  requires: string[];
}

export interface LocomotionDef {
  /** Max root speed (m/s) with all locomotion parts alive. */
  walkSpeed: number;
  /** Max steering force (N) on the root. */
  walkForce: number;
  /** Max turning speed (rad/s). */
  turnSpeed: number;
  /** Max turning torque (N·m) on the root. */
  turnTorque: number;
  /** Dash impulse (N·s) on the root. */
  dashImpulse: number;
}

export interface FighterDef {
  id: string;
  name: string;
  description: string;
  parts: PartDef[];
  joints: JointDef[];
  rootPart: string;
  corePart: string;
  /** Exactly six moves, one per move button (1-6). */
  moves: MoveDef[];
  locomotion: LocomotionDef;
  /** Extra fighter-level fields added by abilities, keyed by ability id. */
  abilities?: Record<string, unknown>;
}

// ---------------------------------------------------------------------- optional companions

/** Per-player colors and optional styling (src/content/fighters/<id>/visuals.ts). */
export interface FighterVisuals {
  /** Optional per-part outline style overrides. Colors always come from the theme (player colors). */
  partStyle?: Record<string, { crackCount?: number }>;
  /** Short tagline shown on fighter select. */
  tagline?: string;
}

/** Hints the generic bot brain uses (src/content/fighters/<id>/bot.ts). */
export interface FighterBotHints {
  /** Moves (by name) the bot likes to attack with, best first. */
  attackMoves: string[];
  /** Moves (by name) used to protect the core. */
  guardMoves: string[];
  /** Preferred distance (m) between root parts when attacking. */
  idealDistance: number;
  /** Own parts the bot tries to keep between itself and the opponent. */
  shieldParts: string[];
  /** Max reach (m) of attacks from the root, for range checks. */
  reach: number;
}

export interface FighterModule {
  fighter: FighterDef;
}
export interface VisualsModule {
  visuals: FighterVisuals;
}
export interface BotHintsModule {
  botHints: FighterBotHints;
}
