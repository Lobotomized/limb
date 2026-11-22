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
- Controls (six-move redesign): limb slots 1–4 replaced by two attack buttons A/B; every fighter has exactly six moves (A/B × neutral/back/forward), validated — the user's design; one fixed layout for every fighter.
- Move direction is latched at the press from the movement stick relative to facing; forward/back when the stick's dot product with facing exceeds 0.38 (±~68°), anything sideways is neutral — up/down no longer exist, so diagonals toward/away from the opponent still count. (Superseded: moves no longer use a direction.)
- A move is a sequence of phases (targets, speed, ticks, optional hold/spin/drive) instead of one held pose — lets every move be a combo, a held wind-up, a guard that turns into a counter, a lunge or a spin, while still only moving the fighter's own parts (rule 6).
- Phase targets accumulate within a move (a joint keeps the last target any earlier phase set) — later phases only list what changes.
- One move at a time; a press during a move is buffered for 10 ticks and starts when it ends — commitment makes moves readable; the buffer keeps combos responsive.
- `hold` phases continue while the starting button is held (cap `maxHoldTicks`, default 180) — one generic block for guards, cocked swings and held spins.
- New generic phase field `drive: [forward, left]` (m/s, fighter frame) replaces walking during the phase, force up to 3× walkForce, scaled by surviving locomotion like walking — lunges, hops back and the crab's sidestep without special cases. `spin` moved from MoveDef to the phase.
- Single-button redesign (user's call): A/B × direction replaced by six move buttons 1–6, one move each (`MoveDef.button` 1–6, no `direction`); the stick only moves. Existing moves kept their order: A, B, Back+A, Back+B, Fwd+A, Fwd+B → 1–6. `moveDirectionDot` removed.
- Six move buttons + dash + two spare actions = 9 bits, so `InputFrame.buttons` is now u16 on the wire (7-byte frames) rather than dropping the spare ability buttons.
- Keys: P1 F G H / R T Y (home row = 1–3), P2 numpad 1–6 (or J K L / U I O); gamepad X Y B LB RB RT = 1–6, dash A or LT, spare actions L3 / R3.
- Slots are gone from the schema; HUD/move list order is button 1–6 with a one-line `description` per move.
- Gamepad: X / Y = attacks A / B, A doubles as dash (with RB) — face buttons stay together and A (menu select) can't trigger an attack by accident when a match starts. (Superseded by the single-button redesign below; A still never starts a move.)
- Bot: strike point = farthest swung part at the halfway and end pose of each non-hold phase (plus estimated drive travel; forward drives use the part leading along the drive); "spin" (ring scoring) only for ≥ half a turn; holds the button through hold phases (+8 ticks, guards +30, spins 0); never picks a move whose drive would end within 1 m of its own ring-out edge.
- Bot health-trade weight halved (0.8 → 0.4) — with the new moves it made the octopus (21 HP segments) refuse every attack and lose ~95 % to the humanoid; at 0.4 it still prefers good trades.
- Octopus bot uses neither Jet retreat (as a guard it fled whenever the opponent started a move) nor Spear dive (it drove the mantle into the opponent; humanoid vs octopus went 78 % → 57–62 % without it) — both stay player moves.
- Crab Shell ram drive 4 m/s × 12 ticks — at 5.5 × 18 the crab rammed constantly (crab vs humanoid 85 %).
- Long root-first drives were shortened (humanoid Lunging palms 5 m/s × 10 ticks with arms leading, crab Shell ram 4.5 × 12, octopus Spear dive 6 × 10) — torso/mantle collisions trade huge equal damage and made humanoid mirrors end in ~5 s draws.
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
- Steam wrapper: `steamworks.js` 0.4 — has lobbies, invite overlay, P2P send/read/accept, rich presence and callbacks (everything needed); it bundles the Steamworks redistributables.
- Steam runs in the Electron main process (`electron/steam-core.cjs`, pure logic over the client object so tests use a fake); the renderer talks to it only through the preload bridge. P2P packets are pushed to the renderer over IPC.
- Steam lobbies are friends-only with 2 members; P2P sessions are accepted only from the other lobby member.
- Pixi, Rapier and fonts are devDependencies (bundled by Vite); runtime dependencies are only what the Electron main process or the server needs (steamworks.js, ws) — smaller packaged app.
- `npm run dist` builds for the current OS only (AppImage + unpacked dir on Linux, NSIS on Windows, DMG on macOS); electron-builder publishing is disabled because builds go to Steam.
- The Electron window background color is a literal `#111318` (bg-900) in `electron/main.cjs` — the main process can't import the TypeScript theme; it only shows before the page paints.
- add-fighter walkthrough (Phase 12): a throwaway fighter `zz-walkthrough` was added in its own folder; validation, movement, pairing and bot tests picked it up automatically, `sim:bots` ran it against every fighter, and `git status` showed zero changes outside the folder. It was then deleted.
- Part toughness is shown by MAX health tier (fragile ≤ 40, medium 41–99, tough ≥ 100, tokens in `theme.ts`) using outline weight — thin / normal / double with a dark inner rim — never fill lightness, which stays reserved for damage. Tiers are absolute so they compare across fighters.
- Fighter select shows a toughness map (tier outlines + HP numbers on parts big enough for a label) and a tier list grouping mirrored parts by type ("Upper arm ×2 80").
- Health-bar track length is proportional to each part's max health on one scale shared by both fighters in the match (the toughest part = full length), with "current/max" numbers.
- Current health is drawn on every living part in the arena (setting "Health on parts", on by default): number at the shape's centroid, colored by health band with a dark outline; small parts place first and larger parts shift their label inside their own shape to avoid overlaps. This deliberately puts small text on the fighters (an exception to "HUD at the edges") because players asked to read limb health mid-fight; it can be turned off.

## Final verification (Phase 13)
- `npm run check`: typecheck + lint + 118 tests (19 files) pass.
- `sim:bots`, 20 matches per pairing at easy, medium and hard (360 matches, 12-min cap): 0 crashes, 0 stuck, 0 timeouts.
- `sim:determinism` (20 matches × 3,000 ticks, twice + save/restore): identical. `sim:net` (0–200 ms RTT, up to 15 % loss, 40 ms jitter): all runs equal the offline simulation, max rollback ≤ 8.
- Browser play-test (headless Chromium, scripted keyboard, mouse and mocked gamepad): every screen, local versus, vs bot to results, rematch, pause/quit, settings persistence, sandbox, online between two tabs through the signaling server (hashes match). No console errors.
- Performance: per-frame CPU for simulation + draw-command building ≈ 2.5 ms median / 5 ms p95 in headless Chromium on this container (budget 16.7 ms). GPU time could not be measured (software rendering only).
- Fighter content is JSON (`fighter.json`, `bot.json`, `visuals.json`) so the visual editor can read and write it safely; hand-written `.ts` still loads (not both in one folder) and `npm run fighters:json` converts. The conversion is bit-identical (same simulation hashes).
- JSON content is written with a custom formatter (inline when ≤ 100 chars, numbers rounded to 4 decimals, -0 → 0) — readable diffs and no editor float noise.
- The fighter editor is an in-game dev mode (`src/editor/`, like the sandbox) rather than a separate app — it reuses the real simulation, renderer and validator, so the preview is exactly the game.
- Editor saves go through a dev-server-only Vite plugin (`apply: 'serve'`) that writes only the three JSON files into a valid fighter folder and refuses to sit next to a `.ts` — no file access in production builds or Electron.
- After a save Vite reloads the page; the editor keeps its document, selection and dummy in sessionStorage and reopens (also survives code hot-reloads with unsaved edits).
- Editor preview runs in a small walled pen (no ring-out) next to a passive dummy fighter of your choice; P1 controls drive the edited fighter.
- Undo/redo are whole-document snapshots (fighters are a few KB); typing/dragging updates the preview live and one undo step is recorded when the edit finishes.
- Mirror copies a limb subtree across the fighter's forward axis (anchors, idle angles and limits flipped, polygons reversed to stay CCW, Left/Right and _l/_r swapped); moves are not mirrored.
- The editor preview keeps following edits while the only problems are in moves or text (e.g. deleting a limb leaves a move with nothing to move); body problems (parts, shapes, joints) pause it with a banner saying it shows the last working version — a silently stale preview looked like deletes didn't work. The dummy defaults to a different fighter than the one being edited.
- The ids of existing fighters are read-only in the editor (renaming would create a second folder); new fighters choose their id when created.

## Balance pass 2 — six-move controls (hard bots, 50 matches per pairing, seeds 1..50)

| Matchup | A wins | B wins | Timeouts (6 min) | Draw rounds | Avg round |
| --- | --- | --- | --- | --- | --- |
| crab mirror (P1/P2) | 46% | 54% | 0 | 81 | 14.6 s |
| crab vs humanoid | 58% | 42% | 0 | 47 | 8.1 s |
| crab vs octopus | 30% | 70% | 0 | 44 | 21.5 s |
| humanoid mirror (P1/P2) | 32% | 54% | 7 | 55 | 19.1 s |
| humanoid vs octopus | 62% | 38% | 0 | 27 | 16.2 s |
| octopus mirror (P1/P2) | 38% | 36% | 13 | 32 | 89.4 s |

Known issues left: crab vs octopus is 30/70 (dropping Shell ram from the crab bot fixes it, 54/46, but pushes crab vs humanoid to 72/28); octopus mirrors are long and Maelstrom-heavy (its spin speed is capped by turn torque, so `spin` isn't a lever); crab–humanoid rounds are short (~8 s). Easy bots are lopsided (humanoid vs octopus 95/5 at easy, 20 matches).
