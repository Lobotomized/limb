---
name: debug-desync
description: Use when Limb Clash simulations diverge - a "Desync detected" message online, a failing determinism/rollback test, or sim:net / sim:determinism reporting mismatches.
---

# Debug a desync

1. **Reproduce offline**: `npm run sim:determinism` (random-input matches run twice, hashes compared
   every tick; prints the first diverging match/tick). For netcode: `npm run sim:net` and
   `npx vitest run tests/rollback.test.ts`.
2. **Read the report** (online): written as `limb-clash-desync-<tick>.txt` (browser: console +
   download; Electron: `<userData>/desync-reports/`). It has both hashes, the tick, the last
   matching tick and every confirmed input since. Replay those inputs with `step()` twice (or
   save/restore at the last matching tick) to find the first diverging tick.
3. **Bisect state**: `hashState(sim)` covers `GameState` + every body's pose/velocity bits;
   `hashState(sim, true)` adds the raw Rapier snapshot. Compare `game` objects with a JSON diff at
   the first bad tick to see which field diverged.
4. **Common causes**
   - Forbidden math (`Math.sin/cos/atan2/pow/exp`, `**`) — run `npm run lint`; use `core/math.ts`.
   - Unordered iteration (Map/Set insertion order that depends on timing, `for..in`, object keys from
     external data) — iterate arrays or sorted keys.
   - Presentation code mutating state (render/ui/audio must only read; `structuredClone` before editing).
   - State outside `GameState`/Rapier (module-level variables, closures in abilities, caches that
     aren't rebuilt on restore). Ability state must live in `game.abilities[id]`.
   - Inputs not sanitized (`-0`, floats): `step()` sanitizes; don't bypass it.
   - Physics objects created/removed in a different order on each peer, or Rapier settings changed
     outside `PhysicsWorld.create`.
   - Rollback window: a snapshot missing for the rollback tick (raise `maxRollback` only together
     with the snapshot ring) — the session throws a clear error in that case.
5. Add a regression test (determinism or rollback) that fails before your fix; run `npm run check`.
