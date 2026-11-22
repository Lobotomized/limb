# Limb Clash — guide for future sessions

(First version — expanded in Phase 12.)

Top-down 1v1 physics fighting game. TypeScript + Vite + Rapier 2D (deterministic) + PixiJS 8.
Run `npm run check` (typecheck + lint + tests) before every commit.

Deterministic code lives in `src/core`, `src/content`, `src/bots`: no `Math.random`, `Date`,
`performance.now`, timers, DOM, PixiJS, audio, networking, or `Math.sin/cos/tan/atan2/exp/log/pow`.
Use `src/core/math.ts` and `src/core/rng.ts`. Lint enforces this.

Never add special cases for a specific fighter to the core.
