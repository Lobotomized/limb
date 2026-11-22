---
name: add-ability
description: Use when adding a new game mechanic that fighters can opt into (grappling, flying, shields, etc.) to Limb Clash, via the ability plugin system instead of special-casing the core.
---

# Add an ability

Abilities are the ONLY way to add mechanics beyond the base rules. Never special-case a fighter.

1. **Create** `src/core/abilities/<id>.ts` exporting `ability: Ability<YourState>` (interface in
   `src/core/abilities/ability.ts`). It is discovered automatically (sorted by id) — no registration.
   Core lint rules apply: deterministic math only (`core/math.ts`, `core/rng.ts`), integer ticks.
2. **Schema fields**: implement `partFields.validate(value)` and/or `fighterFields.validate(value)`
   returning readable problems. Fighters opt in with `part.abilities.<id> = {...}` or
   `fighter.abilities.<id> = {...}`; the validator rejects unknown ability ids and bad values.
3. **State**: `initialState(ctx)` returns JSON-compatible data; read/write it with `api.state` /
   `api.setState()`. It lives in `game.abilities[id]`, so it is saved, restored and hashed
   automatically. Never keep state in module variables or closures.
4. **Hooks** (fixed order each tick): `beforeStep` → `onInput(fighter, actions)` (fighter 0 then 1)
   → physics step → `onContact(sortedPairs)` → damage → `onPartDied(ref)` → `afterStep`;
   `onFighterCreated` each round. Use `api.sim.physics` for bodies (handles in `game.fighters[i].parts`).
   Emit presentation events with `api.emit(data)` (type `ability`).
5. **Input**: use the spare buttons `Button.ACTION1/ACTION2` (bit 0/1 of `actions` in `onInput`).
   They are already bound (keyboard R/V and O/U; gamepad LB/RT) and in the network format.
6. **Tests** (copy the pattern in `tests/abilities.test.ts`): hook order, state save/restore,
   two identical runs give identical hashes, a rollback test (`runLoopback` from `src/net/loopback.ts`
   with a fighter that uses the ability), and validator messages for bad fields.
7. Presentation: render/audio react to `ability` events; add tokens to `theme.ts` if you need colors.
8. Update `CLAUDE.md` (list the ability), run `npm run check`, `npm run sim:determinism`, `npm run sim:net`.
