/**
 * Moves: move button (1-6) -> a sequence of phases.
 *
 * Every fighter has exactly six moves, one per move button. Pressing a button starts its move;
 * the movement stick plays no part in choosing it (directions are only for movement). A fighter
 * performs one move at a time: its phases play in order, each retargeting joints (and optionally
 * spinning or driving the body); `hold` phases last while the button stays held. A press during
 * a move is buffered and starts when the move ends. When the move ends, joints travel back to
 * idle at `returnSpeed`. Moves only change motor targets and body drive. Physics does the rest.
 */
import type { CompiledFighter, CompiledPhase } from './fighter-compile';
import type { EventSink } from './events';
import { partAlive } from './fighter';
import { MOVE_BUTTON_BITS, moveButtonBit, type InputFrame } from './input-frame';
import { approach } from './math';
import { MOVE_BUTTONS, type MoveButton } from './schema/fighter-schema';
import type { FighterState, SimState } from './state';

/** A move is usable if every part it requires is alive and attached. */
export function moveAvailable(f: FighterState, cf: CompiledFighter, move: number): boolean {
  const m = cf.moves[move];
  return !!m && m.requires.every((r) => partAlive(f, r));
}

/** Resolves a move button to a move index, or -1. */
export function resolveMove(cf: CompiledFighter, button: MoveButton): number {
  return cf.moveByButton[button - 1] ?? -1;
}

/** The phase the fighter is in, or null when no move is active. */
export function activePhase(f: FighterState, cf: CompiledFighter): CompiledPhase | null {
  const a = f.action;
  if (a.move < 0) return null;
  return cf.moves[a.move]!.phases[a.phase] ?? null;
}

function startMove(s: SimState, fi: number, mi: number, held: boolean, sink: EventSink): void {
  const f = s.game.fighters[fi]!;
  const a = f.action;
  a.move = mi;
  a.phase = 0;
  a.phaseTick = 0;
  a.held = held;
  a.queued = -1;
  f.stats.moveUses[mi] = (f.stats.moveUses[mi] ?? 0) + 1;
  sink.emit({ type: 'moveStarted', fighter: fi, move: mi });
}

/** Advances the active move, then handles move-button presses for one fighter this tick. */
export function updateMoves(s: SimState, fi: number, input: InputFrame, sink: EventSink): void {
  const f = s.game.fighters[fi]!;
  const cf = s.ctx.compiled[fi]!;
  const t = s.ctx.tuning;
  const a = f.action;
  const tick = s.game.tick;

  // ---- advance the active move
  if (a.move >= 0) {
    const m = cf.moves[a.move]!;
    a.held = a.held && (input.buttons & moveButtonBit(m.button)) !== 0;
    a.phaseTick++;
    for (;;) {
      const p = m.phases[a.phase];
      if (!p) break;
      if (a.phaseTick < p.ticks) break;
      if (p.hold && a.held && a.phaseTick < p.ticks + (p.maxHoldTicks ?? t.moveMaxHoldTicks)) break;
      a.phase++;
      a.phaseTick = 0;
    }
    if (a.phase >= m.phases.length) {
      a.move = -1;
      a.held = false;
      if (a.queued >= 0) {
        const q = a.queued;
        a.queued = -1;
        if (tick - a.queuedTick <= t.moveBufferTicks && moveAvailable(f, cf, q)) {
          const bit = moveButtonBit(cf.moves[q]!.button);
          startMove(s, fi, q, (input.buttons & bit) !== 0, sink);
        }
      }
    }
  }

  // ---- new presses (the lowest button number wins if several land on the same tick)
  const pressed = input.buttons & ~f.prevButtons;
  for (let bi = 0; bi < MOVE_BUTTONS.length; bi++) {
    const bit = MOVE_BUTTON_BITS[bi] as number;
    if (!(pressed & bit)) continue;
    const mi = resolveMove(cf, MOVE_BUTTONS[bi]!);
    if (mi < 0 || !moveAvailable(f, cf, mi)) continue; // unavailable: pressing does nothing
    if (a.move < 0) startMove(s, fi, mi, true, sink);
    else if (a.queued < 0) {
      a.queued = mi;
      a.queuedTick = tick;
    }
    break;
  }
}

/** Spin override of the active phase, or null. */
export function activeSpin(f: FighterState, cf: CompiledFighter): number | null {
  return activePhase(f, cf)?.spin ?? null;
}

/** Drive velocity [forward, left] (m/s, fighter frame) of the active phase, or null. */
export function activeDrive(f: FighterState, cf: CompiledFighter): [number, number] | null {
  return activePhase(f, cf)?.drive ?? null;
}

/** Sets joint goals from the active move phase and drives the motors at the limited speed. */
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
  const phase = activePhase(f, cf);
  if (phase) {
    const m = cf.moves[f.action.move]!;
    for (const tg of phase.targets) {
      const j = f.joints[tg.joint]!;
      j.goal = tg.angle;
      j.speed = tg.speed;
    }
    for (const ji of m.joints) f.joints[ji]!.returnSpeed = m.returnSpeed;
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
