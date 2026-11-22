// Phase 2 check: a physics-only world (falling boxes with gravity) is bit-identical across
// runs, and save/restore mid-run continues identically.
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, PhysicsWorld } from '../src/core/physics';
import { Hasher } from '../src/core/hash';
import { Rng } from '../src/core/rng';

beforeAll(async () => {
  await initPhysics();
});

function buildBoxes(seed: number): { w: PhysicsWorld; bodies: number[] } {
  const w = PhysicsWorld.create({ x: 0, y: -9.81 });
  w.createWall(0, -1, 20, 1, 0.3, 0.5);
  const rng = new Rng(seed);
  const bodies: number[] = [];
  for (let i = 0; i < 40; i++) {
    const h = w.createPartBody({
      x: rng.range(-5, 5),
      y: 2 + i * 0.7,
      angle: rng.range(-3, 3),
      shape: i % 3 === 0 ? { kind: 'circle', radius: 0.3 } : i % 3 === 1 ? { kind: 'capsule', length: 0.9, radius: 0.15 } : { kind: 'polygon', points: [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]] },
      mass: rng.range(0.5, 3),
      role: i % 2 ? 'fighter0' : 'fighter1',
      linearDamping: 0.1,
      angularDamping: 0.1,
      restitution: 0.3,
      friction: 0.5,
    });
    bodies.push(h.body);
  }
  return { w, bodies };
}

function hashWorld(w: PhysicsWorld, bodies: number[]): string {
  const h = new Hasher();
  for (const b of bodies) {
    const p = w.pose(b);
    const v = w.velocity(b);
    h.num(p.x).num(p.y).num(p.angle).num(v.vx).num(v.vy).num(v.w);
  }
  return h.hex();
}

describe('physics determinism (falling boxes)', () => {
  it('two runs give identical hashes every tick', () => {
    const a = buildBoxes(3);
    const b = buildBoxes(3);
    for (let t = 0; t < 600; t++) {
      a.w.step();
      b.w.step();
      expect(hashWorld(a.w, a.bodies)).toBe(hashWorld(b.w, b.bodies));
    }
    a.w.free();
    b.w.free();
  });

  it('save/restore mid-run continues identically', () => {
    const a = buildBoxes(9);
    for (let t = 0; t < 200; t++) a.w.step();
    const snap = a.w.snapshot();
    const b = PhysicsWorld.fromSnapshot(snap);
    expect(hashWorld(b, a.bodies)).toBe(hashWorld(a.w, a.bodies));
    for (let t = 0; t < 400; t++) {
      a.w.step();
      b.step();
      expect(hashWorld(b, a.bodies)).toBe(hashWorld(a.w, a.bodies));
    }
    a.w.free();
    b.free();
  });
});
