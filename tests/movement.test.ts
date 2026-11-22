// Phase 3 check: each fighter moves, turns, dashes and performs every move headless;
// losing locomotion parts reduces speed.
import { beforeAll, describe, expect, it } from 'vitest';
import { BIG_BOX, input, jointAngle, newMatch, partIndex, rootSpeed, run, setup } from './helpers';
import { AimMode, Button, SLOT_BUTTONS } from '../src/core/input-frame';
import { facingOf, locomotionShare } from '../src/core/locomotion';
import { killPart } from '../src/core/fighter';
import { EventSink } from '../src/core/events';
import { angleDiff, atan2, cos, sin } from '../src/core/math';
import { allFighters } from '../src/registry/fighters';
import { resolveMove } from '../src/core/moves';

beforeAll(setup);

const FIGHTERS = allFighters().map((f) => f.def.id);

describe.each(FIGHTERS)('%s movement', (id) => {
  it('walks toward the stick direction near walkSpeed', () => {
    const s = newMatch({ a: id, b: id, arena: BIG_BOX });
    run(s, 120, () => [input({ moveY: 127 }), input({})]);
    const speed = rootSpeed(s, 0);
    const walk = s.ctx.defs[0].locomotion.walkSpeed;
    expect(speed).toBeGreaterThan(walk * 0.6);
    expect(speed).toBeLessThan(walk * 1.25);
  });

  it('turns to face the aim direction', () => {
    const s = newMatch({ a: id, b: id, arena: BIG_BOX });
    const target = 1.6;
    run(s, 180, () => [input({ aimMode: AimMode.VECTOR, aimX: Math.round(127 * Math.cos(target)), aimY: Math.round(127 * Math.sin(target)) }), input({})]);
    expect(Math.abs(angleDiff(facingOf(s, 0), target))).toBeLessThan(0.25);
  });

  it('turns with turn-left input and auto-faces the opponent otherwise', () => {
    const s = newMatch({ a: id, b: id, arena: BIG_BOX });
    const before = facingOf(s, 0);
    run(s, 20, () => [input({ aimMode: AimMode.TURN_LEFT }), input({})]);
    expect(angleDiff(before, facingOf(s, 0))).toBeGreaterThan(0.3);
    run(s, 200, () => [input({}), input({})]);
    const cf = s.ctx.compiled[1];
    const op = s.physics.pose(s.game.fighters[1]!.parts[cf.core]!.body);
    const me = s.physics.pose(s.game.fighters[0]!.parts[s.ctx.compiled[0].root]!.body);
    expect(Math.abs(angleDiff(facingOf(s, 0), atan2(op.y - me.y, op.x - me.x)))).toBeLessThan(0.3);
  });

  it('dashes with a cooldown', () => {
    const s = newMatch({ a: id, b: id, arena: BIG_BOX });
    const ev = run(s, 3, (t) => [input({ moveY: 127, buttons: t % 2 === 0 ? Button.DASH : 0 }), input({})]);
    expect(ev.filter((e) => e.type === 'dash' && e.fighter === 0).length).toBe(1);
    expect(rootSpeed(s, 0)).toBeGreaterThan(s.ctx.defs[0].locomotion.walkSpeed * 0.8);
    const later = run(s, 60, (t) => [input({ buttons: t % 2 === 0 ? Button.DASH : 0 }), input({})]);
    expect(later.filter((e) => e.type === 'dash' && e.fighter === 0).length).toBe(1); // cooldown 45
  });

  it('performs every move (joints reach their targets)', () => {
    const def = allFighters().find((f) => f.def.id === id)!.def;
    const dirs: Record<string, { x: number; y: number }> = { neutral: { x: 0, y: 0 }, forward: { x: 1, y: 0 }, back: { x: -1, y: 0 }, up: { x: 0, y: 1 }, down: { x: 0, y: -1 } };
    def.moves.forEach((m, mi) => {
      const s = newMatch({ a: id, b: id, arena: BIG_BOX });
      const f = facingOf(s, 0);
      const d = dirs[m.direction]!;
      const wx = d.x * cos(f) - d.y * sin(f);
      const wy = d.x * sin(f) + d.y * cos(f);
      expect(resolveMove(s.ctx.compiled[0], m.slot, m.direction)).toBe(mi);
      // Hold the slot; stick only on the press tick (so the fighter doesn't walk away).
      const startTick = s.game.tick;
      const ev = run(s, 50, (t) => [
        input({ moveX: t === startTick ? Math.round(wx * 127) : 0, moveY: t === startTick ? Math.round(wy * 127) : 0, buttons: SLOT_BUTTONS[m.slot - 1], aimMode: m.spin ? AimMode.AUTO : AimMode.VECTOR, aimX: Math.round(cos(f) * 127), aimY: Math.round(sin(f) * 127) }),
        input({}),
      ]);
      expect(ev.some((e) => e.type === 'moveStarted' && e.move === mi), `${m.name} started`).toBe(true);
      for (const tg of m.targets) {
        const a = jointAngle(s, 0, tg.joint);
        expect(Math.abs(angleDiff(a, tg.angle)), `${m.name}: ${tg.joint} at ${a.toFixed(2)} target ${tg.angle}`).toBeLessThan(0.45);
      }
      s.physics.free();
    });
  });

  it('losing locomotion parts reduces speed', () => {
    const fast = newMatch({ a: id, b: id, arena: BIG_BOX });
    run(fast, 120, () => [input({ moveY: 127 }), input({})]);
    const full = rootSpeed(fast, 0);
    const slow = newMatch({ a: id, b: id, arena: BIG_BOX });
    const cf = slow.ctx.compiled[0];
    const sink = new EventSink(slow.game.tick);
    const loco = cf.locomotionParts;
    if (loco.length === 0) return;
    for (const p of loco.slice(0, Math.ceil(loco.length / 2))) killPart(slow, 0, p, sink, { x: 0, y: 0 });
    expect(locomotionShare(slow.game.fighters[0]!, cf)).toBeLessThan(0.6);
    run(slow, 120, () => [input({ moveY: 127 }), input({})]);
    const half = rootSpeed(slow, 0);
    expect(half).toBeLessThan(full * 0.8);
    const none = newMatch({ a: id, b: id, arena: BIG_BOX });
    const sink2 = new EventSink(0);
    for (const p of loco) killPart(none, 0, p, sink2, { x: 0, y: 0 });
    const ev = run(none, 120, (t) => [input({ moveY: 127, buttons: t % 2 ? Button.DASH : 0 }), input({})]);
    expect(rootSpeed(none, 0)).toBeLessThan(full * 0.4);
    expect(ev.some((e) => e.type === 'dash' && e.fighter === 0)).toBe(false);
  });
});

describe('humanoid specifics', () => {
  it('has the expected parts', () => {
    const s = newMatch({ arena: BIG_BOX });
    expect(partIndex(s, 0, 'head')).toBe(s.ctx.compiled[0].core);
    expect(partIndex(s, 0, 'torso')).toBe(s.ctx.compiled[0].root);
  });
});
