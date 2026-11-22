---
name: add-fighter
description: Use when adding a new fighter (a new body shape with its own parts, joints, slots and moves) to Limb Clash. Covers the folder layout, schema, health budget, bot hints, visuals, validation and balancing runs.
---

# Add a fighter

A fighter is pure data in its own folder. **Nothing outside the folder changes** — discovery,
validation, HUD body diagram, fighter-select preview, move list and bot support are automatic.

## Steps

1. **Create the folder** `src/content/fighters/<id>/` (`<id>`: lowercase, `a-z0-9_-`, starts with a
   letter; must equal `fighter.id`).
2. **Write `fighter.ts`** exporting `fighter: FighterDef` (type-only import:
   `import type { FighterDef } from '../../../core/schema/fighter-schema';`). Read the schema in
   `src/core/schema/fighter-schema.ts` first. Conventions:
   - Meters, kg, radians. Seen from above, **facing +x**, `+y` is the fighter's LEFT side.
   - Exactly one `rootPart` (movement/turning act on it; its +x is the facing) and one `corePart`
     (they may be the same part). If the root dies, everything detaches → the core is lost.
   - Parts form a **tree** from the root through `joints` (each non-root part is the `child` of exactly
     one joint). Anchors are in each part's local frame. Capsules lie along local x; `length` is
     tip-to-tip and must exceed 2×radius. Polygons must be **convex and counter-clockwise**.
   - Joint angles (`idleAngle`, `limits`, move targets) must stay within ±3.09 rad (Rapier measures
     relative angles in (-π, π]); point limbs so their poses avoid ±π.
   - `strength` = max motor torque (N·m); `damping` ≈ 5–10 % of strength is a good start.
   - Tag legs/tentacles/feet `locomotion` (speed scales with how many survive), heavy plates `armor`.
   - ≤ 4 `slots` (ids 1–4), ≤ 20 `moves`, one move per slot+direction. Directions are relative to
     facing: `forward`, `back`, `up` (left side), `down` (right side), `neutral`. A slot with no move
     for a direction falls back to its `neutral` move. `requires` = parts that must be alive.
   - Optional `spin` (rad/s) on a move makes the root spin while it is held.
   - No `Math.sin/cos` in content (lint): precompute coordinates (see the crab/octopus files).
3. **Health budget**: total `maxHealth` ≈ 800 (humanoid 849, octopus 784, crab ~690 + heavy armor).
   Remember equal damage: a part's health is what it can *trade*. Core health vs. the opponent's
   limb pool decides fights; a root that is not the core needs extra health.
4. **Optional `bot.ts`** exporting `botHints: FighterBotHints` — `attackMoves`/`guardMoves` by move
   name, `idealDistance` (m, root to enemy core), `reach`, `shieldParts` (presented toward the enemy).
   Without it, every move is treated as an attack.
5. **Optional `visuals.ts`** exporting `visuals: FighterVisuals` (`tagline`). Colors always come from
   the theme (player colors); never put colors in content.
6. **Validate**: `npx vitest run tests/fighters-validate.test.ts tests/movement.test.ts` — a test is
   generated for the new folder automatically (validation + walk/turn/dash/every move/locomotion loss).
   Fix every validator message (they name fighter, field and problem).
7. **Look at it**: `npm run dev` → Sandbox (dev builds) → cycle to the fighter, trigger each move,
   watch joint targets and impact values. Or `http://localhost:5173/?demo=<id>,humanoid`.
8. **Balance**: `npm run sim:bots -- --a <id> --difficulty hard --matches 50` against every existing
   fighter, plus `npm run sim:parts -- <id> <other>` for per-part damage. Target 40–60 % per matchup at
   hard (see the balance-tuning skill). Report the win-rate table.
9. **Check**: `npm run check`; `git status` must show changes only inside the new folder (plus
   DECISIONS.md / this skill if you learned something).
