/**
 * The ability plugin interface. Future mechanics (grappling, flying, ...) implement this.
 * NO abilities ship today; see the add-ability skill.
 *
 * Rules for implementers:
 *  - Deterministic code only (same lint rules as the rest of core/).
 *  - All persistent data lives in the ability's own state object, which must be
 *    JSON-compatible: it is saved/restored and hashed automatically.
 *  - Hooks are called in this fixed order every simulated tick:
 *      beforeStep -> onInput (per fighter, fighter 0 first) -> [physics step]
 *      -> onContact (sorted pairs) -> [damage] -> onPartDied (per death, in order) -> afterStep
 *    onFighterCreated runs whenever a round builds the fighters.
 *  - Abilities are processed in ascending `id` order.
 */
import type { PartRef } from '../events';
import type { SimContext, SimState } from '../state';

export interface ContactPair {
  /** Lower (fighter, part) of the pair. */
  a: PartRef;
  /** Other part, or null for a wall. */
  b: PartRef | null;
  colliderA: number;
  colliderB: number;
}

export interface AbilityApi<S> {
  readonly sim: SimState;
  /** Current ability state (mutate via setState for clarity). */
  readonly state: S;
  setState(next: S): void;
  /** Emits an `ability` event (presentation, audio, UI may react). */
  emit(data: unknown): void;
}

export interface FieldValidator {
  /** Returns human-readable problems (empty = valid). */
  validate(value: unknown): string[];
}

export interface Ability<S = unknown> {
  id: string;
  /** Validates `part.abilities[id]` when present on a part. */
  partFields?: FieldValidator;
  /** Validates `fighter.abilities[id]` when present on a fighter. */
  fighterFields?: FieldValidator;
  /** Initial state for a new match (JSON-compatible). */
  initialState(ctx: SimContext): S;
  onFighterCreated?(api: AbilityApi<S>, fighter: number): void;
  beforeStep?(api: AbilityApi<S>): void;
  /** `actions`: bitmask of the spare input buttons (bit 0 = ACTION1, bit 1 = ACTION2). */
  onInput?(api: AbilityApi<S>, fighter: number, actions: number): void;
  onContact?(api: AbilityApi<S>, pairs: readonly ContactPair[]): void;
  onPartDied?(api: AbilityApi<S>, ref: PartRef): void;
  afterStep?(api: AbilityApi<S>): void;
}
