// The ability plugin system: hooks run in the documented order, ability state is saved,
// restored and hashed, ability fields are validated, and everything stays deterministic.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, newMatch, BIG_BOX } from './helpers';
import type { Ability } from '../src/core/abilities/ability';
import { discoverAbilities } from '../src/core/abilities/registry';
import { step } from '../src/core/simulation';
import { hashState, restoreState, saveState } from '../src/core/state';
import { Button, emptyInput, type InputFrame } from '../src/core/input-frame';
import { RandomInputs } from '../src/bots/random-input';
import { validateFighter } from '../src/core/schema/validate';
import { getFighter } from '../src/registry/fighters';

beforeAll(setup);

interface DummyState {
  calls: string[];
  actionTicks: number[];
  contacts: number;
  died: string[];
  created: number;
  /** A value that depends on the physics state, so a bad restore would show. */
  sumX: number;
}

/** Test-only ability. Records what happens and nudges the root when ACTION1 is held. */
function makeDummy(log = true): Ability<DummyState> {
  return {
    id: 'dummy',
    partFields: {
      validate: (v) => (typeof v === 'object' && v !== null && typeof (v as { power?: unknown }).power === 'number' ? [] : ['must be { power: number }']),
    },
    initialState: () => ({ calls: [], actionTicks: [], contacts: 0, died: [], created: 0, sumX: 0 }),
    onFighterCreated(api) {
      api.setState({ ...api.state, created: api.state.created + 1 });
    },
    beforeStep(api) {
      if (log && api.sim.game.tick < 200) api.state.calls.push('before');
    },
    onInput(api, fighter, actions) {
      if (log && api.sim.game.tick < 200) api.state.calls.push(`input${fighter}`);
      if (actions & 1) {
        api.state.actionTicks.push(api.sim.game.tick);
        const f = api.sim.game.fighters[fighter]!;
        const root = f.parts[api.sim.ctx.compiled[fighter]!.root]!;
        api.sim.physics.applyImpulse(root.body, 0, 5);
        api.emit({ boosted: fighter });
      }
    },
    onContact(api, pairs) {
      if (log && api.sim.game.tick < 200) api.state.calls.push('contact');
      api.state.contacts += pairs.length;
    },
    onPartDied(api, ref) {
      api.state.died.push(`${ref.fighter}.${ref.part}`);
    },
    afterStep(api) {
      if (log && api.sim.game.tick < 200) api.state.calls.push('after');
      const f = api.sim.game.fighters[0]!;
      const root = f.parts[api.sim.ctx.compiled[0]!.root]!;
      if (root.body >= 0) api.state.sumX += api.sim.physics.pose(root.body).x;
    },
  };
}

describe('ability system', () => {
  it('ships no real abilities', () => {
    expect(discoverAbilities()).toEqual([]);
  });

  it('calls hooks in the fixed order and receives the spare action buttons', () => {
    const dummy = makeDummy();
    const s = newMatch({ arena: BIG_BOX, abilities: [dummy] });
    const st = () => s.game.abilities.dummy as DummyState;
    expect(st().created).toBe(2);
    st().calls.length = 0;
    const ev = step(s, [{ ...emptyInput(), buttons: Button.ACTION1 }, emptyInput()]);
    expect(st().calls).toEqual(['before', 'input0', 'input1', 'contact', 'after']);
    expect(st().actionTicks.length).toBe(1);
    expect(ev.some((e) => e.type === 'ability' && e.ability === 'dummy')).toBe(true);
  });

  it('ability state is saved, restored, hashed and deterministic', () => {
    const run = () => {
      const s = newMatch({ seed: 4, abilities: [makeDummy(false)], skipCountdown: false });
      const g = [new RandomInputs(11), new RandomInputs(12)];
      const inputs: [InputFrame, InputFrame][] = [];
      for (let t = 0; t < 900; t++) inputs.push([g[0]!.next(), g[1]!.next()]);
      const hashes: string[] = [];
      for (let t = 0; t < 900; t++) {
        step(s, inputs[t]!);
        hashes.push(hashState(s));
      }
      return { s, inputs, hashes };
    };
    const a = run();
    const b = run();
    expect(a.hashes).toEqual(b.hashes);
    const st = a.s.game.abilities.dummy as DummyState;
    expect(st.actionTicks.length).toBeGreaterThan(0);
    expect(st.contacts).toBeGreaterThan(0);

    // Restore mid-match: ability state rolls back with everything else.
    const s = newMatch({ seed: 4, abilities: [makeDummy(false)], skipCountdown: false });
    for (let t = 0; t < 400; t++) step(s, a.inputs[t]!);
    const snap = saveState(s);
    const before = structuredClone(s.game.abilities.dummy);
    for (let t = 400; t < 600; t++) step(s, a.inputs[t]!);
    expect(s.game.abilities.dummy).not.toEqual(before);
    restoreState(s, snap);
    expect(s.game.abilities.dummy).toEqual(before);
    for (let t = 400; t < 900; t++) step(s, a.inputs[t]!);
    expect(hashState(s)).toBe(a.hashes[899]);

    // The hash covers ability state.
    const h = hashState(s);
    (s.game.abilities.dummy as DummyState).contacts++;
    expect(hashState(s)).not.toBe(h);
  });

  it('validates ability fields on parts', () => {
    const def = structuredClone(getFighter('humanoid').def);
    def.parts[0]!.abilities = { dummy: { power: 'lots' } };
    expect(validateFighter(def, [makeDummy()]).some((e) => e.includes('parts[0].abilities.dummy') && e.includes('power'))).toBe(true);
    def.parts[0]!.abilities = { dummy: { power: 3 } };
    expect(validateFighter(def, [makeDummy()])).toEqual([]);
  });
});
