// Phase 3 check: each fighter moves, turns, dashes and performs every move headless;
// losing locomotion parts reduces speed.
import { beforeAll, describe, expect, it } from 'vitest';
import { BIG_BOX, input, jointAngle, newMatch, partIndex, rootSpeed, run, setup } from './helpers';
import { AimMode, ATTACK_BUTTONS, Button } from '../src/core/input-frame';
import { MOVE_BUTTONS } from '../src/core/schema/fighter-schema';
import { step } from '../src/core/simulation';
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

  it('performs every move: each phase reaches its pose, drives move the body, the move ends', () => {
    const def = allFighters().find((f) => f.def.id === id)!.def;
    def.moves.forEach((m, mi) => {
      const s = newMatch({ a: id, b: id, arena: BIG_BOX });
      const cf = s.ctx.compiled[0];
      const face = facingOf(s, 0);
      const sign = m.direction === 'forward' ? 1 : m.direction === 'back' ? -1 : 0;
      expect(resolveMove(cf, m.button, m.direction)).toBe(mi);
      const cm = cf.moves[mi]!;
      // Hold the button through the first hold phase (plus a little), stick only on the press tick.
      let holdTicks = 0;
      for (const p of cm.phases) {
        holdTicks += p.ticks;
        if (p.hold) {
          holdTicks += 6;
          break;
        }
      }
      const startTick = s.game.tick;
      const root0 = s.physics.pose(s.game.fighters[0]!.parts[cf.root]!.body);
      const spins = cm.phases.some((p) => p.spin !== null);
      // Best error per phase per target seen while in that phase (or the 3 ticks after).
      const best = cm.phases.map((p) => new Map(p.targets.map((t) => [t.joint, Infinity])));
      const seen: number[] = [];
      let started = false;
      for (let k = 0; k < 400; k++) {
        const tk = s.game.tick;
        const ev = step(s, [
          input({ moveX: tk === startTick ? Math.round(sign * cos(face) * 127) : 0, moveY: tk === startTick ? Math.round(sign * sin(face) * 127) : 0, buttons: tk - startTick < holdTicks ? ATTACK_BUTTONS[MOVE_BUTTONS.indexOf(m.button)] : 0, aimMode: spins ? AimMode.AUTO : AimMode.VECTOR, aimX: Math.round(cos(face) * 127), aimY: Math.round(sin(face) * 127) }),
          input({}),
        ]);
        if (ev.some((e) => e.type === 'moveStarted' && e.move === mi)) started = true;
        const a = s.game.fighters[0]!.action;
        if (a.move === mi) seen.push(a.phase);
        const phases = a.move === mi ? [a.phase] : [];
        if (a.move === mi && a.phase > 0 && a.phaseTick < 3) phases.push(a.phase - 1);
        if (a.move < 0 && seen.length && seen.length + 3 > k) phases.push(cm.phases.length - 1);
        for (const ph of phases)
          for (const t of cm.phases[ph]!.targets) {
            const err = Math.abs(angleDiff(jointAngle(s, 0, def.joints[t.joint]!.id), t.angle));
            best[ph]!.set(t.joint, Math.min(best[ph]!.get(t.joint)!, err));
          }
        if (started && a.move < 0 && k > 3) break;
      }
      expect(started, `${m.name} started`).toBe(true);
      expect(s.game.fighters[0]!.action.move, `${m.name} ended`).toBe(-1);
      expect(new Set(seen).size, `${m.name} went through every phase`).toBe(cm.phases.length);
      best.forEach((errs, ph) =>
        errs.forEach((err, j) => expect.soft(err, `${m.name} phase ${ph}: joint ${def.joints[j]!.id} best error ${err.toFixed(2)}`).toBeLessThan(0.5)),
      );
      // Net drive (forward, left) moves the root that way relative to the starting facing.
      const fwd = cm.phases.reduce((acc, p) => acc + (p.drive ? p.drive[0] * p.ticks : 0), 0) / 60;
      if (Math.abs(fwd) > 0.5) {
        const r = s.physics.pose(s.game.fighters[0]!.parts[cf.root]!.body);
        const moved = (r.x - root0.x) * cos(face) + (r.y - root0.y) * sin(face);
        expect.soft(Math.sign(moved), `${m.name} drives ${fwd > 0 ? 'forward' : 'back'} (moved ${moved.toFixed(2)} m)`).toBe(Math.sign(fwd));
        expect.soft(Math.abs(moved), `${m.name} drive distance`).toBeGreaterThan(Math.abs(fwd) * 0.35);
      }
      s.physics.free();
    });
  });

  it('stick direction relative to facing picks the move; sideways counts as neutral', () => {
    const s = newMatch({ a: id, b: id, arena: BIG_BOX });
    const cf = s.ctx.compiled[0];
    const face = facingOf(s, 0);
    const press = (dx: number, dy: number): number => {
      const x = dx * cos(face) - dy * sin(face);
      const y = dx * sin(face) + dy * cos(face);
      const ev = run(s, 1, () => [input({ moveX: Math.round(x * 127), moveY: Math.round(y * 127), buttons: Button.ATTACK_B }), input({})]);
      const st = ev.find((e) => e.type === 'moveStarted');
      // Cancel the move so the next press starts fresh.
      s.game.fighters[0]!.action.move = -1;
      run(s, 1, () => [input({}), input({})]);
      return st && st.type === 'moveStarted' ? st.move : -2;
    };
    expect(press(1, 0)).toBe(resolveMove(cf, 'B', 'forward'));
    expect(press(-1, 0)).toBe(resolveMove(cf, 'B', 'back'));
    expect(press(0, 1)).toBe(resolveMove(cf, 'B', 'neutral'));
    expect(press(0, 0)).toBe(resolveMove(cf, 'B', 'neutral'));
    expect(press(0.7, 0.7)).toBe(resolveMove(cf, 'B', 'forward'));
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
