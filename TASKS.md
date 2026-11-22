# Limb Clash — task list

Status: [ ] todo · [~] in progress · [x] done

## Phase 1: Setup
- [~] 1. Initialize git, Vite + TypeScript (strict), folder structure
- [ ] 2. Install Rapier deterministic, PixiJS, fonts, Vitest, ESLint with boundary rules; forbidden-API lint rules
- [ ] 3. Scripts from 11.3 (stubs where needed), `npm run check` working
- [ ] 4. CLAUDE.md (first version), DECISIONS.md, MANUAL_STEPS.md

## Phase 2: Deterministic core
- [ ] 5. math.ts, rng.ts, fixed-tick loop
- [ ] 6. physics.ts
- [ ] 7. state.ts save/restore + hashing, events.ts
- [ ] 8. simulation.ts step(state, inputs)

## Phase 3: Fighters
- [ ] 9. Schema, validator, auto-discovery loader
- [ ] 10. fighter.ts build/health/detachment
- [ ] 11. moves.ts
- [ ] 12. locomotion.ts
- [ ] 13. Humanoid fighter

## Phase 4: Combat rules
- [ ] 14. damage.ts + tuning.ts
- [ ] 15. match.ts
- [ ] 16. Default arena

## Phase 5: Extendability
- [ ] 17. Abilities interface, registry, dummy-ability test
- [ ] 18. Spare input action slots

## Phase 6: Input and local play
- [ ] 19. InputFrame, keyboard, gamepad, bindings
- [ ] 20. Minimal renderer, local 2P match in browser

## Phase 7: All fighters
- [ ] 21. Octopus
- [ ] 22. Crab

## Phase 8: Bots
- [ ] 23. Bot brain, difficulty, hints
- [ ] 24. sim:bots tool
- [ ] 25. First balance pass

## Phase 9: Visuals
- [ ] 26. theme.ts
- [ ] 27. Fighter rendering
- [ ] 28. Effects
- [ ] 29. Arena rendering + camera
- [ ] 30. HUD
- [ ] 31. Menus
- [ ] 32. Settings
- [ ] 33. Audio

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
