/**
 * Movement, facing and dash. All forces act on the root part.
 *  - Move: steering force toward stick direction * walkSpeed, scaled by the share of
 *    locomotion parts still attached (10% force drift with none left).
 *  - Facing: torque on the root toward the aim direction (or a held move's spin).
 *  - Dash: one impulse with a cooldown; needs a living locomotion part.
 */
import type { CompiledFighter } from './fighter-compile';
import type { EventSink } from './events';
import { partAlive } from './fighter';
import { AimMode, Button, type InputFrame } from './input-frame';
import { angleDiff, atan2, clamp, cos, sin } from './math';
import type { FighterState, SimState } from './state';

/** Share (0..1) of locomotion parts still alive. Fighters without locomotion tags count as 1. */
export function locomotionShare(f: FighterState, cf: CompiledFighter): number {
  if (cf.locomotionParts.length === 0) return 1;
  let alive = 0;
  for (const p of cf.locomotionParts) if (partAlive(f, p)) alive++;
  return alive / cf.locomotionParts.length;
}

/** Facing angle = the root part's rotation (its local +x axis). */
export function facingOf(s: SimState, fi: number): number {
  const f = s.game.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  return s.physics.pose(f.parts[cf.root]!.body).angle;
}

/** Mass still attached to the body (what the root has to drag along). */
export function attachedMass(f: FighterState, cf: CompiledFighter): number {
  let m = 0;
  cf.def.parts.forEach((p, i) => {
    if (f.parts[i]!.status === 'attached') m += p.mass;
  });
  return m;
}

export function updateLocomotion(s: SimState, fi: number, input: InputFrame, spin: number | null, drive: [number, number] | null, sink: EventSink): void {
  const f = s.game.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  const t = s.ctx.tuning;
  const loco = cf.def.locomotion;
  const root = f.parts[cf.root]!;
  if (root.status !== 'attached') return;
  const dt = 1 / t.ticksPerSecond;
  const share = locomotionShare(f, cf);
  const forceShare = share > 0 ? share : t.driftForceShare;
  const speedShare = share > 0 ? share : t.driftSpeedShare;
  const mass = attachedMass(f, cf);
  const pose = s.physics.pose(root.body);
  const vel = s.physics.velocity(root.body);

  // ---- movement
  let mx = input.moveX / 127;
  let my = input.moveY / 127;
  const mag = Math.sqrt(mx * mx + my * my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  if (drive || mag >= t.stickDeadzone) {
    let desiredX: number;
    let desiredY: number;
    let maxF = loco.walkForce * forceShare;
    if (drive) {
      // A move phase drives the body in its own frame (replaces walking for the phase).
      const c = cos(pose.angle);
      const sn = sin(pose.angle);
      desiredX = (drive[0] * c - drive[1] * sn) * speedShare;
      desiredY = (drive[0] * sn + drive[1] * c) * speedShare;
      maxF *= t.driveForceScale;
    } else {
      const maxSpeed = loco.walkSpeed * speedShare;
      desiredX = mx * maxSpeed;
      desiredY = my * maxSpeed;
    }
    let fx = (desiredX - vel.vx) * mass * t.steerGain;
    let fy = (desiredY - vel.vy) * mass * t.steerGain;
    const fl = Math.sqrt(fx * fx + fy * fy);
    if (fl > maxF) {
      fx = (fx / fl) * maxF;
      fy = (fy / fl) * maxF;
    }
    s.physics.applyImpulse(root.body, fx * dt, fy * dt);
  }

  // ---- facing
  let desiredW: number;
  if (spin !== null) {
    desiredW = spin;
  } else if (input.aimMode === AimMode.TURN_LEFT) {
    desiredW = loco.turnSpeed;
    f.aimAngle = pose.angle;
  } else if (input.aimMode === AimMode.TURN_RIGHT) {
    desiredW = -loco.turnSpeed;
    f.aimAngle = pose.angle;
  } else {
    if (input.aimMode === AimMode.VECTOR && (input.aimX !== 0 || input.aimY !== 0)) {
      f.aimAngle = atan2(input.aimY, input.aimX);
    } else {
      // Auto: face the opponent's core (or root if the core is gone).
      const other = s.game.fighters[1 - fi]!;
      const ocf = s.ctx.compiled[1 - fi]!;
      const target = other.parts[ocf.core]!.body >= 0 ? other.parts[ocf.core]! : other.parts[ocf.root]!;
      if (target.body >= 0) {
        const tp = s.physics.pose(target.body);
        f.aimAngle = atan2(tp.y - pose.y, tp.x - pose.x);
      }
    }
    const err = angleDiff(pose.angle, f.aimAngle);
    desiredW = clamp(err * t.turnGain, -loco.turnSpeed, loco.turnSpeed);
  }
  // Torque proportional to angular-velocity error, saturating at turnTorque.
  const wErr = desiredW - vel.w;
  const torque = clamp((wErr / Math.max(0.1, loco.turnSpeed)) * 4, -1, 1) * loco.turnTorque * forceShare;
  s.physics.applyTorqueImpulse(root.body, torque * dt);

  // ---- dash
  if (f.dashCooldown > 0) f.dashCooldown--;
  const dashPressed = (input.buttons & Button.DASH) !== 0 && (f.prevButtons & Button.DASH) === 0;
  if (dashPressed && f.dashCooldown === 0 && share > 0) {
    let dx = mx;
    let dy = my;
    if (mag < t.stickDeadzone) {
      dx = cos(pose.angle);
      dy = sin(pose.angle);
    } else {
      const l = Math.sqrt(dx * dx + dy * dy);
      dx /= l;
      dy /= l;
    }
    s.physics.applyImpulse(root.body, dx * loco.dashImpulse, dy * loco.dashImpulse);
    f.dashCooldown = t.dashCooldownTicks;
    f.stats.dashes++;
    sink.emit({ type: 'dash', fighter: fi });
  }
}
