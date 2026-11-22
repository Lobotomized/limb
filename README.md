# Limb Clash

A top-down 1v1 physics fighting game. Every fighter is a body of jointed parts — arms, legs,
tentacles, claws, shell plates — and **every part has its own health**. When two parts collide,
**both lose exactly the same damage**, scaled by how hard they hit. Lose a part and every move that
needs it is gone; lose your **core** (or get pushed over a ring-out edge) and you lose the round.
Best of three.

Three fighters ship: **Humanoid** (all-rounder), **Octopus** (eight light tentacles, big core) and
**Crab** (heavy shell, crusher claw, weak back). Modes: local versus (one keyboard, keyboard +
gamepad, or two gamepads), versus bot (easy / medium / hard), and online with rollback netcode
(browser via WebRTC, desktop via Steam).

## Requirements
Node.js 20.19+ (22 recommended) and npm.

```bash
npm install
```

## Run

```bash
npm run dev
```
Open http://localhost:5173. Dev builds add a **Sandbox** to the main menu (trigger moves, see joint
targets / contact points / impact values, edit tuning live) and `?demo=humanoid,crab` (bot vs bot).

**Fighter editor** (dev builds): main menu → *Fighter editor*, or http://localhost:5173/?editor.
Create a fighter from a copy of an existing one, reshape its body (parts, joints, limits, mirror a
limb to the other side), build its six moves phase by phase and watch them in a live physics
preview (▶ Play, ghost of the selected phase), set its bot hints, and save. Problems are listed as
you edit and must be fixed before saving. Saving writes `src/content/fighters/<id>/*.json` through
the dev server; the game picks the fighter up immediately (Ctrl+S save, Ctrl+Z / Ctrl+Y undo/redo).

## How to play

| | Player 1 keyboard | Player 2 keyboard | Gamepad (twin-stick) |
| --- | --- | --- | --- |
| Move | W A S D | Arrow keys | Left stick |
| Turn | Q / E (otherwise you face the opponent) | Numpad 7 / 9 (or , / .) | Right stick aims (release = face opponent) |
| Attack A / B | F / G | Numpad 1 / 2 (or J / K) | X / Y |
| Dash | Left Shift | Numpad 0 (or Right Shift) | RB or A |
| Pause | Esc | Esc | Start |

Every fighter has **six moves**: **A**, **B**, **Back + A**, **Back + B**, **Forward + A** and
**Forward + B**. *Back*/*forward* is the movement stick at the moment you press, relative to where
you face (sideways or no stick = plain A/B). A move is a little sequence — combos, wind-ups you hold
and release, spins, lunges, hops and sidesteps — and plays out on its own; holding the button keeps
a guard or a cocked swing going. A press during a move is buffered for the next one. The
fighter-select screen lists every move with a one-line description. Device assignment (who uses which
keyboard half or gamepad) is in Settings → P1/P2 controls. All bindings live in
`src/input/bindings.ts`.

Every part shows its current health as a number during the fight (turn it off in Settings → Health on parts).
The fighter-select screen shows each part's toughness (outline: thin = fragile, double = tough) and max health.

Strategy in one line: **hit with parts that have more health than the part you hit** — damage is
always equal, so healthy limbs win trades. Protect your core, and stay away from the red ring-out edges.

## Online play (browser)
1. Start the signaling server (it only introduces peers; game data goes peer to peer):
   ```bash
   npm run server
   ```
   It listens on port 8787 (`PORT=9000 npm run server` to change).
2. Open the game in two tabs (or on two machines that can reach the server):
   Play → Online → **Create room** in the first; type the 4-letter code and press Enter
   (or **Join room**) in the second.
3. Both pick a fighter; the host's match starts on both sides.

By default the game connects to `ws://<page host>:8787`. Point it elsewhere with
`?signal=wss://your.host` or the `signalingUrl` setting. For players on different networks, host the
signaling server publicly behind TLS (`wss://`) and consider adding a TURN server in
`src/net/config.ts` (see MANUAL_STEPS.md). The HUD shows ping, input delay and rollbacks; a state
hash is exchanged every second and a mismatch shows "Desync detected" and writes a report.

## Build

```bash
npm run build
```
Static web build in `dist/` (relative paths; host it on any static HTTPS server).

## Desktop (Electron) and Steam

```bash
npm run electron:dev
npm run dist
```
`electron:dev` builds and opens the desktop app. `dist` packages it for the **current OS**
(`release/`: Linux AppImage + unpacked folder, Windows NSIS installer, macOS DMG). Settings are saved
in the user data folder. Steam features (lobbies, invites, P2P, rich presence) activate when Steam is
running; the app ID is in `steam.config.json` (placeholder 480). See **STEAM.md** for the
remaining Steamworks steps.

## Development

```bash
npm run check
```
Typecheck + lint (import boundaries and determinism rules) + all tests. Must pass before committing.

```bash
npm run sim:bots -- --all --difficulty hard --matches 50
```
Headless bot-vs-bot balancing: win rates, average round length, damage per part type, move usage.
`npm run sim:parts -- humanoid crab` breaks damage down per part.

```bash
npm run sim:determinism
```
Random-input matches run twice and compared tick by tick (plus save/restore continuation).

```bash
npm run sim:net
```
Two rollback sessions over a simulated network (latency, jitter, loss, reordering) compared with an
offline run of the same inputs.

Start with **CLAUDE.md** (architecture, rules, commands) and the skills in `.claude/skills/`
(add-fighter, add-move, add-ability, add-arena, balance-tuning, debug-desync). Decisions are logged in
DECISIONS.md; what still needs a human is in MANUAL_STEPS.md.

## Project layout
```
src/core      deterministic simulation (Rapier deterministic, fixed 60 Hz, save/restore/hash)
src/content   fighters and arenas as data (auto-discovered)
src/bots      utility-AI bots + headless match runner
src/input     keyboard, gamepad, bindings, input wire format
src/net       transports (local, fake, WebRTC, Steam), net simulator, rollback
src/render    PixiJS arena/fighters/effects + theme.ts design tokens
src/ui        DOM HUD and menus
src/audio     Web Audio synth
src/platform  browser / Electron abstraction
src/app       game shell and wiring
server/       signaling server · electron/ desktop shell · tools/ CLIs · tests/ Vitest
```
