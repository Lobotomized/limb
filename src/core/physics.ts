/**
 * Thin wrapper around Rapier 2D (deterministic build).
 *
 * Coordinate convention: meters, y axis points UP, angles are counter-clockwise radians.
 * The renderer flips y when converting to screen pixels.
 *
 * Every body/collider/joint is referred to by its integer Rapier handle. Handles survive
 * snapshot/restore, so game state can store them as plain numbers.
 */
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type { Vec2 } from './math';
import type { ShapeDef } from './schema/fighter-schema';

let initialized = false;

/** Must be awaited once before any PhysicsWorld is created. Safe to call repeatedly. */
export async function initPhysics(): Promise<void> {
  if (initialized) return;
  await RAPIER.init();
  initialized = true;
}

export function physicsReady(): boolean {
  return initialized;
}

/** Collision layers. A fighter's own parts never collide with each other. */
export const Layer = {
  WALL: 1 << 0,
  FIGHTER0: 1 << 1,
  FIGHTER1: 1 << 2,
  DEBRIS: 1 << 3,
} as const;

export type CollisionRole = 'fighter0' | 'fighter1' | 'debris' | 'wall';

function groupsFor(role: CollisionRole): number {
  let member: number;
  let filter: number;
  switch (role) {
    case 'fighter0':
      member = Layer.FIGHTER0;
      filter = Layer.WALL | Layer.FIGHTER1;
      break;
    case 'fighter1':
      member = Layer.FIGHTER1;
      filter = Layer.WALL | Layer.FIGHTER0;
      break;
    case 'debris':
      member = Layer.DEBRIS;
      filter = Layer.WALL;
      break;
    case 'wall':
      member = Layer.WALL;
      filter = Layer.FIGHTER0 | Layer.FIGHTER1 | Layer.DEBRIS;
      break;
  }
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export interface BodyPose {
  x: number;
  y: number;
  angle: number;
}

export interface BodyVelocity {
  vx: number;
  vy: number;
  w: number;
}

export interface PartBodyOptions {
  x: number;
  y: number;
  angle: number;
  shape: ShapeDef;
  mass: number;
  role: CollisionRole;
  linearDamping: number;
  angularDamping: number;
  restitution: number;
  friction: number;
}

export interface MotorSettings {
  target: number;
  /** Velocity the target is moving at (rad/s); damping acts relative to it. */
  targetVel: number;
  stiffness: number;
  damping: number;
  maxForce: number;
}

export interface ContactInfo {
  /** World-space unit normal pointing from collider A toward collider B. */
  normal: Vec2;
  /** World-space contact point (or midpoint estimate). */
  point: Vec2;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly queue: RAPIER.EventQueue;

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.world.timestep = 1 / 60;
    this.queue = new RAPIER.EventQueue(true);
  }

  static create(gravity: Vec2 = { x: 0, y: 0 }, solverIterations = 8): PhysicsWorld {
    const w = new RAPIER.World(new RAPIER.Vector2(gravity.x, gravity.y));
    w.integrationParameters.numSolverIterations = solverIterations;
    return new PhysicsWorld(w);
  }

  static fromSnapshot(bytes: Uint8Array): PhysicsWorld {
    return new PhysicsWorld(RAPIER.World.restoreSnapshot(bytes));
  }

  snapshot(): Uint8Array {
    return this.world.takeSnapshot();
  }

  /** Releases WASM memory. The object must not be used afterwards. */
  free(): void {
    this.queue.free();
    this.world.free();
  }

  // ------------------------------------------------------------------ creation

  createPartBody(o: PartBodyOptions): { body: number; collider: number } {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(o.x, o.y)
      .setRotation(o.angle)
      .setLinearDamping(o.linearDamping)
      .setAngularDamping(o.angularDamping)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    const cdesc = colliderFor(o.shape)
      .setMass(o.mass)
      .setRestitution(o.restitution)
      .setFriction(o.friction)
      .setCollisionGroups(groupsFor(o.role))
      .setSolverGroups(groupsFor(o.role))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(cdesc, body);
    return { body: body.handle, collider: collider.handle };
  }

  /** Creates a static rectangular wall centered at (x, y). */
  createWall(x: number, y: number, halfW: number, halfH: number, restitution: number, friction: number): number {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfW, halfH)
        .setRestitution(restitution)
        .setFriction(friction)
        .setCollisionGroups(groupsFor('wall'))
        .setSolverGroups(groupsFor('wall'))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return c.handle;
  }

  /** Revolute joint with a position motor. Anchors are in each body's local space. */
  createRevolute(parentBody: number, childBody: number, anchorParent: Vec2, anchorChild: Vec2, limits?: [number, number]): number {
    const data = RAPIER.JointData.revolute(new RAPIER.Vector2(anchorParent.x, anchorParent.y), new RAPIER.Vector2(anchorChild.x, anchorChild.y));
    if (limits) {
      data.limitsEnabled = true;
      data.limits = [limits[0], limits[1]];
    }
    const j = this.world.createImpulseJoint(data, this.world.getRigidBody(parentBody), this.world.getRigidBody(childBody), true) as RAPIER.RevoluteImpulseJoint;
    j.setContactsEnabled(false);
    j.configureMotorModel(RAPIER.MotorModel.ForceBased);
    return j.handle;
  }

  setMotor(joint: number, m: MotorSettings): void {
    const j = this.world.getImpulseJoint(joint) as RAPIER.RevoluteImpulseJoint;
    j.configureMotor(m.target, m.targetVel, m.stiffness, m.damping);
    j.setMotorMaxForce(m.maxForce);
  }

  removeJoint(joint: number): void {
    const j = this.world.getImpulseJoint(joint);
    if (j) this.world.removeImpulseJoint(j, true);
  }

  removeBody(body: number): void {
    const b = this.world.getRigidBody(body);
    if (b) this.world.removeRigidBody(b);
  }

  setRole(collider: number, role: CollisionRole): void {
    const c = this.world.getCollider(collider);
    c.setCollisionGroups(groupsFor(role));
    c.setSolverGroups(groupsFor(role));
  }

  setDamping(body: number, linear: number, angular: number): void {
    const b = this.world.getRigidBody(body);
    b.setLinearDamping(linear);
    b.setAngularDamping(angular);
  }

  // ------------------------------------------------------------------ queries

  pose(body: number): BodyPose {
    const b = this.world.getRigidBody(body);
    const t = b.translation();
    return { x: t.x, y: t.y, angle: b.rotation() };
  }

  velocity(body: number): BodyVelocity {
    const b = this.world.getRigidBody(body);
    const v = b.linvel();
    return { vx: v.x, vy: v.y, w: b.angvel() };
  }

  mass(body: number): number {
    return this.world.getRigidBody(body).mass();
  }

  // ------------------------------------------------------------------ forces (impulses: never persistent)

  applyImpulse(body: number, ix: number, iy: number): void {
    this.world.getRigidBody(body).applyImpulse(new RAPIER.Vector2(ix, iy), true);
  }

  applyTorqueImpulse(body: number, t: number): void {
    this.world.getRigidBody(body).applyTorqueImpulse(t, true);
  }

  setPose(body: number, x: number, y: number, angle: number): void {
    const b = this.world.getRigidBody(body);
    b.setTranslation(new RAPIER.Vector2(x, y), true);
    b.setRotation(angle, true);
    b.setLinvel(new RAPIER.Vector2(0, 0), true);
    b.setAngvel(0, true);
  }

  // ------------------------------------------------------------------ stepping

  /** Steps the world one tick and returns the collider pairs that STARTED touching. */
  step(): Array<[number, number]> {
    this.world.step(this.queue);
    const started: Array<[number, number]> = [];
    this.queue.drainCollisionEvents((h1, h2, isStart) => {
      if (isStart) started.push(h1 < h2 ? [h1, h2] : [h2, h1]);
    });
    return started;
  }

  /** Contact normal (A→B) and point for a touching pair, or a center-to-center estimate. */
  contactInfo(colliderA: number, colliderB: number): ContactInfo {
    const ca = this.world.getCollider(colliderA);
    const cb = this.world.getCollider(colliderB);
    let result: ContactInfo | null = null;
    this.world.contactPair(ca, cb, (manifold, flipped) => {
      if (result) return;
      const n = manifold.normal();
      const sign = flipped ? -1 : 1;
      let point: Vec2 | null = null;
      if (manifold.numSolverContacts() > 0) {
        const p = manifold.solverContactPoint(0);
        if (p) point = { x: p.x, y: p.y };
      }
      if (n.x === 0 && n.y === 0) return;
      const ta = ca.translation();
      const tb = cb.translation();
      result = { normal: { x: n.x * sign, y: n.y * sign }, point: point ?? { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 } };
    });
    if (result) return result;
    const ta = ca.translation();
    const tb = cb.translation();
    const dx = tb.x - ta.x;
    const dy = tb.y - ta.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    return { normal: l > 1e-9 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 }, point: { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 } };
  }

  /** World position of a collider's center (for walls: the wall center). */
  colliderCenter(collider: number): Vec2 {
    const t = this.world.getCollider(collider).translation();
    return { x: t.x, y: t.y };
  }
}

function colliderFor(shape: ShapeDef): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case 'circle':
      return RAPIER.ColliderDesc.ball(shape.radius);
    case 'capsule': {
      // Capsules lie along the part's local x axis; `length` is the tip-to-tip length.
      const half = Math.max(0.001, shape.length / 2 - shape.radius);
      return RAPIER.ColliderDesc.capsule(half, shape.radius).setRotation(1.5707963267948966);
    }
    case 'polygon': {
      const pts = new Float32Array(shape.points.length * 2);
      shape.points.forEach(([x, y], i) => {
        pts[i * 2] = x;
        pts[i * 2 + 1] = y;
      });
      const d = RAPIER.ColliderDesc.convexHull(pts);
      if (!d) throw new Error('Invalid convex polygon');
      return d;
    }
  }
}
