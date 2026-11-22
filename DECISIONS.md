# Decisions

One line each: decision — why.

- Physics package: `@dimforge/rapier2d-deterministic-compat` 0.21 — required deterministic build; compat inlines the WASM so Vite, Vitest and Node tools all load it without bundler config.
- Tool runner: `vite-node` for `tools/` and `server/` — the fighter/ability auto-discovery uses `import.meta.glob`, which plain `tsx`/Node cannot evaluate.
- Lint boundaries: `eslint-plugin-boundaries` v7 `boundaries/dependencies` policies with `dependency.kind: 'type'` for content→schema — enforces "types only" precisely.
- Lint test fixtures are stored as `.txt` and linted through `ESLint.lintText` under a virtual path inside `src/` — keeps the real tree clean while exercising the real rules.
- Added `src/app/` (game wiring: screens, match controller) and `src/registry/` (content discovery + validation) folders not in the spec's tree — `main.ts` must import everything, and content discovery needs both content and the core validator, which neither `core/` nor `content/` may do.
- Forbidden in core/content/bots additionally: `Math.hypot`, `Math.cbrt`, `**`, `for..in`, `Intl`, `crypto`, `process`, `globalThis` — same engine-dependence / non-determinism reasons as the listed ones.
- Playwright is not a project dependency; the environment's preinstalled copy is used for screenshots — avoids downloading a second browser.
- `step()` mutates the state in place and returns the tick's events — avoids copying a Rapier world every tick; `saveState`/`restoreState` provide the functional snapshot semantics rollback needs.
- Coordinates: meters, y-up, CCW angles; the root part's local +x is the facing direction — standard math convention; the renderer flips y.
- Capsule `length` is tip-to-tip and capsules lie along the part's local x axis — limbs point "forward" along +x, which makes joint angles intuitive.
- Joint angles (idle, limits, move targets) must stay within ±3.09 rad — Rapier measures revolute angles in (-π, π], so poses near ±π would flip sign.
- Motors use Rapier's force-based position motor with target velocity = the commanded angle's rate of change — without it, motor damping drags limbs back and moves never reach their speed.
- A move's direction is latched when its slot is pressed; if the slot has no move for that direction it falls back to the slot's neutral move — common fighting-game behavior and makes every slot always do something.
- When several held slots target the same joint, the most recently pressed wins — deterministic and intuitive.
- New generic schema field `MoveDef.spin` (rad/s while held) — needed for "spin attack" and "shell turn" without special-casing fighters.
- Polygons must be convex and counter-clockwise (validated) — what is drawn is exactly what collides; no hidden hull computation.
- If a part dies, only its parent joint is removed; its subtree leaves as one jointed chunk. If the root dies, everything (including the core) is detached, which loses the round — consistent with "parts attached only through the dead part also detach".
- Forces are applied as impulses (force × dt) — Rapier's `addForce` persists across steps, impulses cannot leak between ticks.
- Damage uses the contact-point velocity (v + ω×r) from the end of the previous tick, not just the center velocity — swinging limbs hit with their tips, which is the whole point of the game.
- Inputs during hit-stop are not lost: held buttons register when the freeze ends (presses and releases fully inside a freeze are dropped) — freezes are ≤ 6 ticks except core death.
- Debris is also removed as soon as it leaves the arena bounds (any side) — walls contain it otherwise.
- Draws (both cores in the same tick) keep the round number and replay the round.
