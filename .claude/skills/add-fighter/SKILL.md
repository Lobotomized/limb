---
name: add-fighter
description: Use when adding a new fighter (a new body shape with its own parts, joints and six moves) to Limb Clash. Covers the folder layout, schema, health budget, bot hints, visuals, validation and balancing runs.
---

# Add a fighter

A fighter is pure data in its own folder. **Nothing outside the folder changes** — discovery,
validation, HUD body diagram, fighter-select preview, move list and bot support are automatic.

## Fastest path: the fighter editor

`npm run dev` → main menu → **Fighter editor** (or open `http://localhost:5173/?editor`).
**New…** copies an existing fighter under a new id; reshape the body (select a part in the outline
or click it in the preview; **Add limb here**, **Make core ◆** (moves the lose condition to that
part in one click), **Mirror to other side**, **Delete**), edit the six
moves (phases, joint targets with sliders inside the joint limits, hold/spin/drive; **▶ Play** runs
the move in the live physics preview, the outline ghost shows the selected phase) and bot hints.
Problems from the validator are listed on the left (click one to jump to it); **Save** (Ctrl+S) is
refused while there are any. Save writes `fighter.json`, `bot.json`, `visuals.json` into the
folder through the dev server and the page reloads with the new content. Undo/redo: Ctrl+Z / Ctrl+Y.
Then continue at step 6 below (tests, balance). The conventions in step 2 still apply.

## Steps (by hand)

1. **Create the folder** `src/content/fighters/<id>/` (`<id>`: lowercase, `a-z0-9_-`, starts with a
   letter; must equal `fighter.id`).
2. **Write `fighter.json`** (a `FighterDef`, see `src/core/schema/fighter-schema.ts`; the existing
   fighters are examples), or a `fighter.ts` exporting `fighter: FighterDef` if you want to compute
   values in code (type-only import from the schema). A folder may not have both. The editor only
   edits JSON fighters; `npm run fighters:json -- <id>` converts a `.ts` fighter. Conventions:
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
   - `locomotion.steering`: leave it out (`tank`: up/down drives along facing, left/right turns) unless
     the body is fully symmetric with no front — then `"omni"` (stick moves in screen directions, like
     the octopus). Nobody auto-faces the opponent, so a front-heavy design must be turned by the player.
   - **Exactly six `moves`**: one per move button, `"button": 1` … `6` (no direction: the stick only
     moves the fighter). Each move is a sequence of phases (targets, speed, ticks, optional
     `hold`, `spin`, `drive`) — follow the add-move skill and make every move interesting, not a
     plain poke. `requires` = parts that must be alive; give each a one-line `description`.
   - No `Math.sin/cos` in `.ts` content (lint): precompute coordinates.
3. **Health budget**: total `maxHealth` ≈ 800 (humanoid 849, octopus 784, crab ~690 + heavy armor).
   Remember equal damage: a part's health is what it can *trade*. Each part's max health also sets
   its **toughness tier** (`TOUGHNESS` in `src/render/theme.ts`: ≤ 40 fragile, 41–99 medium, ≥ 100
   tough), shown automatically as outline weight in the arena (thin / normal / double), as HP labels
   and a tier list on fighter select, and as bar length in the detailed HUD. Name mirrored parts
   "Left …"/"Right …" so the tier list can group them. Core health vs. the opponent's
   limb pool decides fights; a root that is not the core needs extra health.
4. **Optional `bot.json`** (or `bot.ts` exporting `botHints`) with `FighterBotHints` — `attackMoves`/`guardMoves` by move
   name, `idealDistance` (m, root to enemy core), `reach`, `shieldParts` (presented toward the enemy).
   Without it, every move is treated as an attack.
5. **Optional `visuals.json`** (or `visuals.ts` exporting `visuals`) with `FighterVisuals` (`tagline`). Colors always come from
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
