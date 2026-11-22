# Limb Clash — task list

Status: [ ] todo · [~] in progress · [x] done

## Phase 1: Setup
- [x] 1. Initialize git, Vite + TypeScript (strict), folder structure
- [x] 2. Install Rapier deterministic, PixiJS, fonts, Vitest, ESLint with boundary rules; forbidden-API lint rules
- [x] 3. Scripts from 11.3 (stubs where needed), `npm run check` working
- [x] 4. CLAUDE.md (first version), DECISIONS.md, MANUAL_STEPS.md

## Phase 2: Deterministic core
- [x] 5. math.ts, rng.ts, fixed-tick loop
- [x] 6. physics.ts
- [x] 7. state.ts save/restore + hashing, events.ts
- [x] 8. simulation.ts step(state, inputs)

## Phase 3: Fighters
- [x] 9. Schema, validator, auto-discovery loader
- [x] 10. fighter.ts build/health/detachment
- [x] 11. moves.ts
- [x] 12. locomotion.ts
- [x] 13. Humanoid fighter

## Phase 4: Combat rules
- [x] 14. damage.ts + tuning.ts
- [x] 15. match.ts
- [x] 16. Default arena

## Phase 5: Extendability
- [x] 17. Abilities interface, registry, dummy-ability test
- [x] 18. Spare input action slots

## Phase 6: Input and local play
- [x] 19. InputFrame, keyboard, gamepad, bindings
- [x] 20. Minimal renderer, local 2P match in browser

## Phase 7: All fighters
- [x] 21. Octopus
- [x] 22. Crab

## Phase 8: Bots
- [x] 23. Bot brain, difficulty, hints
- [x] 24. sim:bots tool
- [x] 25. First balance pass

## Phase 9: Visuals
- [x] 26. theme.ts
- [x] 27. Fighter rendering
- [x] 28. Effects
- [x] 29. Arena rendering + camera
- [x] 30. HUD
- [x] 31. Menus
- [x] 32. Settings
- [x] 33. Audio

## Phase 10: Online
- [ ] 34. Transport interface, local/fake transports, net simulator
- [ ] 35. Rollback session
- [ ] 36. WebRTC transport + signaling server + lobby
- [ ] 37. sim:net tool

## Phase 11: Desktop and Steam
- [ ] 38. Electron app, platform layer, packaging
- [ ] 39. Steam integration + fake
- [ ] 40. STEAM.md

## Phase 12: Harness and docs
- [ ] 41. Final CLAUDE.md
- [ ] 42. Six skills + throwaway-fighter walkthrough
- [ ] 43. README.md

## Phase 13: Final verification
- [ ] 44. npm run check
- [ ] 45. sim:bots all pairings/difficulties
- [ ] 46. sim:determinism + sim:net
- [ ] 47. Browser play-test (headless)
- [ ] 48. Fix and re-run
