/**
 * Moves: slot + direction -> joint motor targets.
 *
 * A move is chosen when its slot button is pressed, using the movement stick direction
 * relative to the fighter's facing. While held, its joint targets travel toward the move
 * pose at `speed`; on release they travel back to the idle pose at `returnSpeed`.
 * Moves only change motor targets. Physics does the rest.
 */
import type { CompiledFighter } from './fighter-compile';
import type { EventSink } from './events';
import { partAlive } from './fighter';
import { SLOT_BUTTONS, type InputFrame } from './input-frame';
import { approach, atan2, angleDiff, PI } from './math';
import type { MoveDirection } from './schema/fighter-schema';
import type { FighterState, SimState } from './state';

/** Classifies the movement stick relative to facing. Neutral inside the deadzone. */
export function stickDirection(input: InputFrame, facing: number, deadzone: number): MoveDirection {
  const mx = input.moveX / 127;
  const my = input.moveY / 127;
  if (mx * mx + my * my < deadzone * deadzone) return 'neutral';
  const rel = angleDiff(facing, atan2(my, mx));
  const q = PI / 4;
  if (rel > -q && rel <= q) return 'forward';
  if (rel > q && rel <= 3 * q) return 'up'; // fighter's left side
  if (rel < -q && rel >= -3 * q) return 'down'; // fighter's right side
  return 'back';
}

/** A move is usable if every part it requires is alive and attached. */
export function moveAvailable(f: FighterState, cf: CompiledFighter, move: number): boolean {
  const m = cf.moves[move];
  return !!m && m.requires.every((r) => partAlive(f, r));
}

/** Resolves slot + direction to a move index (falls back to the slot's neutral move), or -1. */
export function resolveMove(cf: CompiledFighter, slotId: number, dir: MoveDirection): number {
  const byDir = cf.moveBySlotDir.get(slotId);
  if (!byDir) return -1;
  return byDir.get(dir) ?? byDir.get('neutral') ?? -1;
}

/** Handles slot presses/releases for one fighter this tick. */
export function updateSlots(s: SimState, fi: number, input: InputFrame, facing: number, sink: EventSink): void {
  const f = s.game.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  const pressed = input.buttons & ~f.prevButtons;
  for (let si = 0; si < 4; si++) {
    const bit = SLOT_BUTTONS[si] as number;
    const slot = f.slots[si]!;
    const slotId = si + 1;
    if (pressed & bit) {
      const dir = stickDirection(input, facing, s.ctx.tuning.stickDeadzone);
      const mi = resolveMove(cf, slotId, dir);
      if (mi >= 0 && moveAvailable(f, cf, mi)) {
        slot.held = true;
        slot.move = mi;
        slot.pressTick = s.game.tick;
        f.stats.moveUses[mi] = (f.stats.moveUses[mi] ?? 0) + 1;
        sink.emit({ type: 'moveStarted', fighter: fi, slot: slotId, move: mi });
      } else {
        // Unavailable move: pressing does nothing.
        slot.held = false;
        slot.move = -1;
      }
    } else if (!(input.buttons & bit) && slot.held) {
      slot.held = false;
      // Keep slot.move so the joints know which return speed to use until re-targeted.
      slot.move = -1;
    }
  }
}

/** Active moves in priority order: earlier presses first, later presses override shared joints. */
export function activeMoves(f: FighterState): number[] {
  return f.slots
    .map((sl, i) => ({ sl, i }))
    .filter(({ sl }) => sl.held && sl.move >= 0)
    .sort((a, b) => a.sl.pressTick - b.sl.pressTick || a.i - b.i)
    .map(({ sl }) => sl.move);
}

/** Spin override from the highest-priority held move that has one, or null. */
export function activeSpin(f: FighterState, cf: CompiledFighter): number | null {
  let spin: number | null = null;
  for (const mi of activeMoves(f)) {
    const m = cf.moves[mi]!;
    if (m.spin !== null) spin = m.spin;
  }
  return spin;
}

/** Sets joint goals from the held moves and drives the motors at the limited speed. */
export function updateJoints(s: SimState, fi: number): void {
  const f = s.game.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  const t = s.ctx.tuning;
  const def = cf.def;
  // Default: every joint returns to idle at its remembered return speed.
  f.joints.forEach((j, ji) => {
    j.goal = def.joints[ji]!.idleAngle;
    j.speed = j.returnSpeed;
  });
  for (const mi of activeMoves(f)) {
    const m = cf.moves[mi]!;
    for (const tg of m.targets) {
      const j = f.joints[tg.joint]!;
      j.goal = tg.angle;
      j.speed = m.speed;
      j.returnSpeed = m.returnSpeed;
    }
  }
  const dt = 1 / t.ticksPerSecond;
  f.joints.forEach((j, ji) => {
    if (j.handle < 0) return;
    if (f.parts[cf.jointChild[ji] as number]!.status !== 'attached') return;
    const before = j.commanded;
    j.commanded = approach(j.commanded, j.goal, j.speed * dt);
    const jd = def.joints[ji]!;
    s.physics.setMotor(j.handle, {
      target: j.commanded,
      targetVel: (j.commanded - before) / dt,
      stiffness: jd.strength * t.motorStiffnessPerStrength,
      damping: jd.damping,
      maxForce: jd.strength,
    });
  });
}
