/**
 * Calls ability hooks with a small API object bound to each ability's state slot.
 */
import type { EventSink, PartRef } from '../events';
import type { SimState } from '../state';
import type { Ability, AbilityApi, ContactPair } from './ability';

function apiFor(s: SimState, a: Ability, sink: EventSink): AbilityApi<unknown> {
  return {
    sim: s,
    get state() {
      return s.game.abilities[a.id];
    },
    setState(next: unknown) {
      s.game.abilities[a.id] = next;
    },
    emit(data: unknown) {
      sink.emit({ type: 'ability', ability: a.id, data });
    },
  };
}

export const AbilityHooks = {
  fighterCreated(s: SimState, sink: EventSink, fighter: number): void {
    for (const a of s.ctx.abilities) a.onFighterCreated?.(apiFor(s, a, sink), fighter);
  },
  beforeStep(s: SimState, sink: EventSink): void {
    for (const a of s.ctx.abilities) a.beforeStep?.(apiFor(s, a, sink));
  },
  input(s: SimState, sink: EventSink, fighter: number, actions: number): void {
    for (const a of s.ctx.abilities) a.onInput?.(apiFor(s, a, sink), fighter, actions);
  },
  contact(s: SimState, sink: EventSink, pairs: readonly ContactPair[]): void {
    for (const a of s.ctx.abilities) a.onContact?.(apiFor(s, a, sink), pairs);
  },
  partDied(s: SimState, sink: EventSink, ref: PartRef): void {
    for (const a of s.ctx.abilities) a.onPartDied?.(apiFor(s, a, sink), ref);
  },
  afterStep(s: SimState, sink: EventSink): void {
    for (const a of s.ctx.abilities) a.afterStep?.(apiFor(s, a, sink));
  },
};
