// Part death, detachment, round flow and win conditions.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, newMatch, BIG_BOX, input, run, partIndex, translateFighter } from './helpers';
import { ballMatch, place, idle, hits } from './ball';
import { killPart } from '../src/core/fighter';
import { EventSink, type SimEvent } from '../src/core/events';
import { moveAvailable } from '../src/core/moves';
import { Button } from '../src/core/input-frame';
import { defaultTuning } from '../src/core/tuning';

beforeAll(setup);
const T = defaultTuning();

const ofType = <K extends SimEvent['type']>(ev: SimEvent[], t: K) => ev.filter((e): e is Extract<SimEvent, { type: K }> => e.type === t);

describe('part death', () => {
  it('detaches descendants and disables the moves that need them', () => {
    const s = newMatch({ arena: BIG_BOX });
    const f = s.game.fighters[0]!;
    const cf = s.ctx.compiled[0];
    const sink = new EventSink(s.game.tick);
    const ua = partIndex(s, 0, 'upper_arm_l');
    killPart(s, 0, ua, sink, { x: 0, y: 0 });
    expect(f.parts[ua]!.status).toBe('debris');
    expect(f.parts[partIndex(s, 0, 'forearm_l')]!.status).toBe('debris');
    expect(f.parts[partIndex(s, 0, 'hand_l')]!.status).toBe('debris');
    expect(f.parts[partIndex(s, 0, 'forearm_r')]!.status).toBe('attached');
    expect(ofType(sink.events, 'partDied').map((e) => e.ref.part)).toEqual([ua]);
    expect(ofType(sink.events, 'partDetached').length).toBe(2);
    const oneTwo = cf.def.moves.findIndex((m) => m.name === 'One-two'); // needs both arms
    const haymaker = cf.def.moves.findIndex((m) => m.name === 'Haymaker'); // right arm only
    expect(moveAvailable(f, cf, oneTwo)).toBe(false);
    expect(moveAvailable(f, cf, haymaker)).toBe(true);
    // Pressing A (neutral) now does nothing.
    const ev = run(s, 5, (t) => [input({ buttons: t % 2 ? Button.ATTACK_A : 0 }), input({})]);
    expect(ofType(ev, 'moveStarted')).toEqual([]);
    // Debris is removed after its lifetime.
    run(s, T.debrisTicks + 2, () => [input({}), input({})]);
    expect(f.parts[ua]!.status).toBe('removed');
    expect(f.parts[partIndex(s, 0, 'hand_l')]!.status).toBe('removed');
  });

  it('debris that leaves the arena is removed', () => {
    const s = newMatch();
    const hand = partIndex(s, 0, 'hand_r');
    killPart(s, 0, hand, new EventSink(s.game.tick), { x: 0, y: 0 });
    s.physics.setPose(s.game.fighters[0]!.parts[hand]!.body, -s.ctx.arena.width / 2 - 2, 0, 0);
    const ev = run(s, 1, () => [input({}), input({})]);
    expect(s.game.fighters[0]!.parts[hand]!.status).toBe('removed');
    expect(ofType(ev, 'debrisRemoved').length).toBe(1);
  });
});

describe('round flow', () => {
  it('core death ends the round after the core hit-stop', () => {
    const s = ballMatch(4, 4, 1000, 5);
    place(s, 0, -2, 0, 15, 0);
    place(s, 1, 0, 0, 0, 0);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 40 && !ofType(ev, 'coreDied').length; i++) ev.push(...idle(s, 1));
    expect(ofType(ev, 'coreDied')[0]!.fighter).toBe(1);
    expect(s.game.hitStop).toBe(T.coreDeathHitStopTicks);
    expect(s.game.phase).toBe('fight');
    ev = idle(s, T.coreDeathHitStopTicks);
    const over = ofType(ev, 'roundOver');
    expect(over.length).toBe(1);
    expect(over[0]!.winner).toBe(0);
    expect(over[0]!.reason).toBe('core');
    expect(s.game.wins).toEqual([1, 0]);
    // Next round starts after the round-end phase, fighters back to full health.
    ev = idle(s, T.roundEndTicks);
    expect(ofType(ev, 'roundStart')[0]!.round).toBe(2);
    expect(s.game.fighters[1]!.parts[0]!.health).toBe(5);
    expect(s.game.phase).toBe('countdown');
  });

  it('simultaneous core death is a draw and the round is replayed', () => {
    const s = ballMatch(4, 4, 5, 5);
    place(s, 0, -2, 0, 15, 0);
    place(s, 1, 0, 0, 0, 0);
    const ev = idle(s, 40 + T.coreDeathHitStopTicks);
    expect(ofType(ev, 'coreDied').length).toBe(2);
    const over = ofType(ev, 'roundOver');
    expect(over[0]!.winner).toBeNull();
    expect(over[0]!.reason).toBe('draw');
    expect(s.game.wins).toEqual([0, 0]);
    const next = idle(s, T.roundEndTicks);
    expect(ofType(next, 'roundStart')[0]!.round).toBe(1);
  });

  it('a core crossing a ring-out edge ends the round that tick', () => {
    const s = newMatch();
    const core = s.game.fighters[1]!.parts[s.ctx.compiled[1].core]!;
    const x = s.physics.pose(core.body).x;
    translateFighter(s, 1, s.ctx.arena.width / 2 + 0.3 - x, 0);
    const ev = run(s, 1, () => [input({}), input({})]);
    expect(ofType(ev, 'ringOut')[0]!.fighter).toBe(1);
    const over = ofType(ev, 'roundOver')[0]!;
    expect(over.winner).toBe(0);
    expect(over.reason).toBe('ringout');
  });

  it('best of 3: two round wins end the match', () => {
    const s = ballMatch(4, 4, 1000, 5);
    let ev: SimEvent[] = [];
    for (let round = 0; round < 2; round++) {
      place(s, 0, -2, 0, 15, 0);
      place(s, 1, 0, 0, 0, 0);
      ev = idle(s, 40 + T.coreDeathHitStopTicks + T.roundEndTicks + T.countdownTicks);
    }
    expect(s.game.wins).toEqual([2, 0]);
    expect(s.game.phase).toBe('matchOver');
    expect(s.game.matchWinner).toBe(0);
    expect(ev.some((e) => e.type === 'matchOver')).toBe(true);
    expect(hits(ev).length).toBeGreaterThan(0);
  });
});
