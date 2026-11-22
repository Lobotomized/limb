# Limb Clash — guide for future sessions

A complete 1v1 **top-down physics fighting game** (no gravity) where every fighter is a body of
jointed parts and **every part has its own health**. TypeScript + Vite + Rapier 2D (deterministic
build) + PixiJS 8. Runs in the browser and in Electron (Steam). Local PvP, vs bot (easy/medium/hard),
online PvP with rollback netcode (WebRTC in browsers, Steam networking in the desktop build).

## Core rules (these define the game; never change them)

1. **Every part has its own health.** There is no overall health bar.
2. **Equal damage on contact.** When a part of one fighter collides with a part of the other fighter, **both parts lose exactly the same amount of health.**
3. **Damage comes from impact force.** Damage depends on how hard the two parts hit each other (closing speed and mass). Gentle touches do nothing.
4. **Dead parts are lost.** When a part's health reaches 0 it detaches from the body, and every move that needs that part can no longer be used. Parts attached only through the dead part also detach (for example, losing an upper arm also loses the forearm and hand).
5. **Core part.** Each fighter has exactly one core part. When the core dies, that fighter loses the round.
6. **Moves are movements.** A move only changes the positions of the fighter's own parts, driven at a set speed by physics. There are no hitboxes, no hit priority and no special attack logic. Whatever touches, collides.
7. **Physical bodies.** Parts bounce off each other and have inertia. Each part has a mass, so heavy parts are hard to push and light parts get knocked around. Each part also has a strength: how hard its joint pushes toward its target position. A strong limb powers through a light obstacle; a weak one gets pushed aside.

Other decided rules: walls damage parts (same impact formula, the wall takes nothing); two arena
sides are open **ring-out** edges (core crosses → round lost); no healing; own parts never collide;
best of 3, no timer; both cores dying the same tick = draw, round replayed.

**Never add special cases for a specific fighter to the core.** If a fighter needs something new,
add a general building block once (a schema field like `MoveDef.spin`, or an ability plugin).

## Architecture

```
nextState = step(state, inputs)      // src/core/simulation.ts, fixed 60 ticks/s, mutates in place
```
- `src/core/` — deterministic simulation: `simulation.ts` (step), `state.ts` (types, save/restore,
  hash), `physics.ts` (Rapier wrapper; meters, **y up**, CCW radians), `damage.ts`, `fighter.ts`
  (build/detach), `fighter-compile.ts` (id→index maps), `moves.ts`, `locomotion.ts`, `match.ts`
  (rounds, hit-stop), `arena.ts`, `events.ts`, `math.ts`, `rng.ts`, `hash.ts`, `tuning.ts`
  (ALL global constants), `input-frame.ts`, `loop.ts` (fixed-tick accumulator),
  `abilities/` (plugin interface + auto-discovery; **no abilities ship**), `schema/` (fighter &
  arena types + validator).
- `src/content/` — pure data. `fighters/<id>/fighter.ts` (+ optional `visuals.ts`, `bot.ts`),
  `arenas/<id>/arena.ts`. Discovered automatically, sorted by id. No central list.
- `src/registry/` — discovery (`import.meta.glob`) + validation of content.
- `src/bots/` — deterministic utility-AI bot (`bot.ts`), `difficulty.ts`, `runner.ts` (headless
  bot matches), `random-input.ts`.
- `src/input/` — `input-frame.ts` (wire format), `keyboard.ts`, `gamepad.ts`, `devices.ts`,
  `bindings.ts` (ALL bindings).
- `src/net/` — `transport.ts` interface; `local-`, `fake-`, `webrtc-`, `steam-transport.ts`;
  `net-simulator.ts`; `protocol.ts`; `peer-link.ts` (RTT, reliable control); `rollback.ts`;
  `loopback.ts` (two sessions over the simulator).
- `src/render/` — `theme.ts` (ALL design tokens), `renderer.ts` (ArenaView), `fighter-renderer.ts`,
  `arena-renderer.ts`, `effects.ts`, `camera.ts`, `frame.ts` (interpolation), `shapes.ts`.
- `src/ui/` — DOM HUD (`hud/`) and menus (`menus/`), `styles.ts` (CSS generated from theme), settings.
- `src/audio/` — Web Audio synth + event → sound mapping.
- `src/platform/` — web / electron implementations behind one interface.
- `src/app/` — wiring: `game.ts` (shell, UiHost), `match.ts`, `drivers.ts`, `online.ts`,
  `online-driver.ts`, `sandbox.ts`.
- `server/` signaling server · `electron/` main, preload, Steam service, builder config ·
  `tools/` CLIs · `tests/` Vitest · `.claude/skills/` project skills.

### Determinism rules (lint-enforced in core/, content/, bots/)
- Never use `Math.random`, `Date`, `performance`, timers, DOM/browser APIs, PixiJS, audio,
  networking, `Math.sin/cos/tan/atan2/exp/log/pow/hypot/cbrt…`, `**`, or `for..in`.
  Use `core/math.ts` (deterministic trig) and `core/rng.ts` (seeded). Time is integer ticks.
- Iterate in deterministic order (arrays, sorted keys). Contact pairs are sorted by (fighter, part).
- All mutable simulation data lives in `GameState` (JSON-compatible) or the Rapier world; both are
  saved/restored/hashed (`core/state.ts`). Ability state goes in `game.abilities[id]`.
- Inputs are sanitized to integers in `step()` (no `-0`), so local and network inputs are identical.
- Presentation (render/ui/audio) reads state and events only; it never mutates the simulation.

### Import boundaries (lint-enforced, `eslint.config.js`)
- `core/` imports nothing outside `core/`.
- `content/` imports **only types** from `core/schema/`.
- `bots/` → core, registry (hints), input. `net/` → core, input, registry.
- `render/`, `ui/`, `audio/` never import `net/`; `ui/` may import bot *types* only.
- `app/` wires everything; `registry/` may import content + core.

## Commands
- `npm run dev` — game in the browser (http://localhost:5173). Dev extras: Sandbox in the main menu,
  `?demo=humanoid,crab` (bot vs bot), `?signal=ws://host:8787`, `window.__limbClash`.
- `npm run build` · `npm run server` (signaling, port 8787) · `npm run electron:dev` · `npm run dist`
- `npm run check` — typecheck + lint + all tests. **Must pass before every commit.**
- `npm run sim:bots -- --all --difficulty hard --matches 50` — balancing (win rates, round length,
  damage per part type, move usage). `npm run sim:parts -- humanoid crab` — per-part damage.
- `npm run sim:determinism` — random-input matches run twice, hashes compared every tick.
- `npm run sim:net` — rollback sessions over the net simulator vs offline runs.

## Definition of done
1. `npm run check` passes.
2. The relevant skill in `.claude/skills/` was followed (add-fighter, add-move, add-ability,
   add-arena, balance-tuning, debug-desync).
3. Any new pattern you introduced is written back into that skill (and here if architectural).
4. Decisions that could reasonably have gone another way are one line in `DECISIONS.md`.
