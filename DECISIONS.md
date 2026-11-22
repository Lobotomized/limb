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
- Damage constants retuned from measured impacts (typical limb impacts are 0.5–2, peaks ~20): `impactThreshold` 0.8, `damageScale` 11, `wallDamageScale` 0.5 — the first guesses (threshold 4) filtered out almost every real hit.
- Bots ram (charge + dash body-first) when they have no usable attack, or when the opponent's health hasn't dropped for 15 s — breaks stalemates (e.g. two clawless crabs) without special cases.
- Hard bots strafe toward the opponent's weakest attached part — generic way to go for weak spots like the crab's back plate.
- Bots score spin moves as a ring around the root (×0.7 value) rather than a single strike point — spins hit all around.
- Mirror matches are reported as P1-side vs P2-side win rates in `sim:bots` — "fighter a vs fighter a" is meaningless otherwise.
- The humanoid torso carries extra health (205) — it is the root, so losing it detaches the head and loses the round.
- Crab health budget is lower (~690) — its tankiness comes from heavy armor mass and the enclosed core, not raw health.

## Balance pass 1 (hard bots, 50 matches per pairing, seeds 1..50, sides alternate)

| Matchup | A wins | B wins | Timeouts (6 min) | Draw rounds | Avg round |
| --- | --- | --- | --- | --- | --- |
| crab mirror (P1/P2) | 48% | 52% | 0 | 80 | 19.3 s |
| crab vs humanoid | 62% | 38% | 0 | 24 | 14.0 s |
| crab vs octopus | 44% | 56% | 0 | 51 | 25.0 s |
| humanoid mirror (P1/P2) | 52% | 48% | 0 | 62 | 15.0 s |
| humanoid vs octopus | 62% | 38% | 0 | 28 | 23.5 s |
| octopus mirror (P1/P2) | 40% | 44% | 8 | 42 | 70.8 s |

Known balancing issue left for the human: octopus mirrors are long (mantle-on-mantle hits deal equal damage, so both cores often die the same tick → replayed draw rounds). Easy/medium bots are less balanced than hard (humanoid–octopus swings strongly by difficulty).
- Menus and HUD are DOM (with a stylesheet generated from `theme.ts`); the arena, fighters and effects are PixiJS — DOM gives focus/mouse/text/fonts for free, Pixi handles the per-frame drawing.
- All UI sizes are `calc(var(--u) * Npx)` with `--u = windowHeight / 1080 × UI-scale setting` — the whole UI scales with window height as specified.
- Fighters are redrawn every frame in screen space (immediate-mode Graphics) instead of scaled containers — stroke widths stay in screen pixels at any zoom, matching the design tokens.
- The camera's minimum zoom fits the whole arena plus its margin; when the window aspect differs from the arena's, the extra space shows the bg-900 surround — keeps "never zoom out past the arena" and "keep both fighters on screen" compatible.
- Local PvP fighter select is sequential (P1 then P2, any device); the result banner shows for the 2 s round-end phase while the round-start banner uses the specified 900 ms.
- Online pause does not freeze the simulation (overlay only) — the opponent keeps playing; local pause freezes.
- Dev-only `?demo=a,b` URL runs a hard bot-vs-bot match (used for screenshots and attract mode); `window.__limbClash` exposes the game for scripted play-tests.
- The sandbox is reachable from the main menu in dev builds only (`import.meta.env.DEV`).
- Online: the room creator is P1 (host) and decides the seed and input delay; control messages (ready/start/bye) are JSON sent reliably over the same unreliable channel (resent until acked) — one channel for WebRTC and Steam alike.
- Auto input delay from RTT: <40 ms → 1, <100 → 2, <170 → 3, else 4 frames.
- Time-sync: hard stall when prediction would exceed 8 ticks; soft stall (one tick in four) when more than 2 ticks ahead of the opponent's reported tick adjusted by RTT/2.
- Rollback de-duplicates presentation events by tick + type + parts involved (not damage values), so a resimulated hit with slightly different damage doesn't spark twice.
- Desync reports go through the platform layer: browser → console + downloaded text file; Electron → a file in the user data folder.
- The WebRTC transport uses public Google STUN for NAT traversal (configurable in `src/net/config.ts`); a TURN server is not included (see MANUAL_STEPS.md).
- The signaling URL defaults to `ws(s)://<page host>:8787`; override with `?signal=wss://…` or the `signalingUrl` setting.
