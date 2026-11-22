# Six-move controls — work in progress (branch `six-move-controls`)

## Done
- `src/core/schema/fighter-schema.ts`: `SlotDef`/`slots` removed. New `MoveButton` (A/B),
  `MoveDirection` (neutral/back/forward), `MovePhase` (targets, speed, ticks, hold, maxHoldTicks,
  spin, drive [forward, left] m/s), `MoveDef` (button, direction, name, description, phases,
  returnSpeed, requires).
- `src/core/input-frame.ts`: `Button.ATTACK_A` / `ATTACK_B` (bits 0, 1; bits 2–3 reserved),
  `ATTACK_BUTTONS` replaces `SLOT_BUTTONS`. `src/input/input-frame.ts` re-export updated.

## Left
1. **Core**
   - `state.ts`: replace `slots: SlotState[]` with `action: { move, phase, phaseTick, held, queued, queuedTick }`.
   - `fighter.ts`: init `action`; `killPart` cancels the active/queued move if a required part is lost.
   - `fighter-compile.ts`: compiled phases with *accumulated* targets (joint, angle, speed);
     `moveByInput` map keyed `button/direction`.
   - `moves.ts`: stick → forward/back/neutral via dot with facing (tuning `moveDirectionDot` 0.38;
     sideways = neutral). Press starts a move or buffers it (`moveBufferTicks` 8). Phase advances
     after `ticks`; hold phases continue while the button is held (cap `maxHoldTicks` /
     `moveMaxHoldTicks` 180). `activeSpin`, new `activeDrive`.
   - `locomotion.ts`: when a drive is active, desired velocity = drive rotated by facing ×
     speedShare, force cap = walkForce × `driveForceScale` (3) × forceShare; stick ignored.
   - `events.ts`: `moveStarted { fighter, move }` (drop `slot`).
   - `validate.ts`: exactly 6 moves, one per button × direction; 1–8 phases; ticks int 1–240;
     targets within limits; drive ±15; spin ±40; total ticks ≤ 300.
2. **Content** (designs):
   - Humanoid: A One-Two (L jab → R cross) · B Haymaker (hold to cock right arm, release swing + spin 6)
     · Back+A Cover & Shove (hold guard, release double push with drive) · Back+B Slip & Counter
     (drive back, then step in with right hook) · Fwd+A Bull Rush (forearms tucked, drive 7 m/s)
     · Fwd+B Whirlwind (arms out, full spin 13 rad/s while stepping in).
   - Crab: A Snip Flurry (3 small-claw pecks) · B Crusher Slam (hold wide, slam across) · Back+A
     Turtle Snap (hold claws over shell, fling open) · Back+B Sidle (scuttle sideways right, crusher
     swings back across with spin) · Fwd+A Shell Ram (brace back, ram 5.5 m/s) · Fwd+B Scissor Pinch
     (open both claws stepping in, snap shut).
   - Octopus: A Lash Flurry (alternating front whips) · B Coil Crack (hold coil, crack at speed 30)
     · Back+A Jet Retreat (drive −7 m/s, front curl guard) · Back+B Maelstrom (spread + held spin)
     · Fwd+A Spear Dive (streamline, drive 8 m/s) · Fwd+B Embrace (six tentacles open, then curl shut).
   - Update each `bot.ts` attack/guard move names.
3. **Input**: bindings `slots` → `attacks: [A, B]` (P1 F/G, P2 Numpad1/J + Numpad2/K, pad A/B);
   `keyboard.ts`, `gamepad.ts`.
4. **Bots**: model strike point per phase (farthest part of targeted subtrees, plus drive offset;
   drive-dominant moves use the frontmost part along the drive); ring scoring when spin×ticks > 1.5 rad;
   hold button through hold phases; wait for full move duration; `oppHolding` = `action.move >= 0`.
5. **UI/tools**: move list (fighter-preview) in order A, B, Back+A, Back+B, Fwd+A, Fwd+B with
   descriptions; sandbox triggers; `tools/sim-bots.ts` key; tests (`ball.ts` no slots,
   input/match/movement/validator tests).
6. `npm run check`, `sim:bots`, `sim:determinism`, `sim:net`, browser play-test.
7. Update README controls, add-move/add-fighter skills, CLAUDE.md, DECISIONS.md (phases, drive,
   buffering, sideways = neutral), then commit.
