---
name: add-move
description: Use when changing one of a Limb Clash fighter's six moves (button A/B + neutral/back/forward → a sequence of phases). Covers phases, targets, speeds, hold/spin/drive, requirements, testing in the sandbox and checking bot usage.
---

# Change a move

Every fighter has **exactly six moves**, one per input (validated):

| Input | `button` | `direction` |
| --- | --- | --- |
| A | `A` | `neutral` |
| B | `B` | `neutral` |
| Back + A / Back + B | `A` / `B` | `back` |
| Fwd + A / Fwd + B | `A` / `B` | `forward` |

Direction is the movement stick at the moment of the press, relative to facing (sideways or no
stick = `neutral`). You don't add moves, you replace one. Edit only the fighter's
`src/content/fighters/<id>/fighter.json` (and its `bot.json` hints) — easiest in the **Fighter
editor** (`npm run dev` → main menu, or `?editor=<id>`): select the move, edit its phases, ▶ Play it
in the live preview; the ghost outline shows the selected phase's pose.

Moves only move the fighter's own parts (rule 6). Make each one **interesting**: a sequence, a
wind-up you can hold, a body spin, a lunge or hop, a guard that turns into something. Avoid
"one pose in one direction" — that is what the old slot system did.

1. **Phases** (1–8, ≤ 300 ticks total) play in order. Each phase:
   - `targets`: `{ joint, angle }` (relative to the parent part, within the joint's `limits` and ±3.09).
     Joints not listed keep the target an earlier phase of the same move gave them, so later phases
     only list what changes. When the move ends every joint returns to idle at `returnSpeed`.
   - `speed` (rad/s) — jabs 15–20, swings 12–16, cracks/whips up to 30, heavy 8–12. Real limb speed
     is also limited by joint `strength` vs. the mass it moves.
   - `ticks` (1/60 s) — how long the phase lasts. Give the limb time to arrive (`movement.test.ts`
     checks each phase's targets get within 0.5 rad).
   - Optional `hold: true` (+ `maxHoldTicks`, default tuning `moveMaxHoldTicks`): after `ticks`, stays
     in the phase while the button is held. Use for guards and cocked wind-ups ("hold, release to swing").
   - Optional `spin` (rad/s, + = CCW): the root spins instead of turning to the aim. Small values
     (3–7) add body twist to a swing; 10+ for ~30 ticks is a full spinning attack.
   - Optional `drive: [forward, left]` (m/s, fighter frame): the body is driven instead of walking
     (lunges, hops back, sidesteps). Scales with surviving locomotion parts. Keep lunges short
     (≈ 0.5–1 m of travel) and **lead with limbs**: heavy roots/cores slamming into each other trade
     huge equal damage and cause mirror draws.
2. A fighter performs one move at a time; a press during a move is buffered (`moveBufferTicks`).
3. **requires**: every part the move needs. When any is dead or detached the move is disabled
   (greyed out in the move list; pressing does nothing) and an active move using it is cancelled.
4. **name** + one-line **description** (shown on fighter select and in the sandbox).
5. **Test**: `npx vitest run tests/movement.test.ts` (each phase reaches its pose, drives move the
   body the right way, the move ends). Then `npm run dev` → Sandbox → trigger the move (it holds the
   button ~50 ticks so hold phases show); white lines = commanded joint targets, red circles =
   contacts, the log shows impact → damage.
6. **Bots**: list the move in `attackMoves` or `guardMoves` in `bot.ts` (or neither, to never use
   it — e.g. a pure escape). The bot derives the strike point from the non-hold phases (halfway and
   end poses, plus drive travel), holds the button through hold phases, waits for the whole move,
   and skips drives that would end near its own ring-out edge. Run
   `npm run sim:bots -- --a <id> --matches 20` and check "Move usage".
7. `npm run check`.
