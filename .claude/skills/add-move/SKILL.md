---
name: add-move
description: Use when adding or changing a move (slot + direction → joint targets) on an existing Limb Clash fighter. Covers targets, speeds, requirements, testing in the sandbox and checking bot usage.
---

# Add a move

Moves only set joint motor targets; physics does the rest (rule 6). Edit only the fighter's
`src/content/fighters/<id>/fighter.ts` (and its `bot.ts` hints).

1. **Pick slot + direction** (`neutral|forward|back|up|down`, relative to facing; `up` = left side).
   Each slot+direction pair may be used once; ≤ 20 moves per fighter.
2. **Targets**: `{ joint, angle }` per joint, angles relative to the parent part (child − parent),
   within the joint's `limits` and within ±3.09 rad. Joints you leave out stay where other held
   moves (or idle) put them; the most recently pressed slot wins shared joints.
3. **Speed** (rad/s) — how fast targets travel to the pose (jabs 15–20, swings 10–14, heavy 8–12).
   **returnSpeed** — back to idle after release. Real limb speed is also limited by joint `strength`
   vs. the mass it moves.
4. **requires**: every part the move needs (usually the slot's driving segments). When any is dead or
   detached, the move is disabled (HUD move list greys it out; pressing does nothing).
5. Optional **spin** (rad/s, + = counter-clockwise) for spinning moves.
6. **Test**: `npx vitest run tests/movement.test.ts` (checks every move reaches its targets). Then
   `npm run dev` → Sandbox → trigger the move; the white lines show commanded joint targets, red
   circles show contact points, the log shows impact → damage.
7. **Bots**: add the move name to `attackMoves` or `guardMoves` in `bot.ts`. Run
   `npm run sim:bots -- --a <id> --matches 20` and check the "Move usage" section uses it.
8. `npm run check`.
