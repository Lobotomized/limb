# Decisions

One line each: decision — why.

- Physics package: `@dimforge/rapier2d-deterministic-compat` 0.21 — required deterministic build; compat inlines the WASM so Vite, Vitest and Node tools all load it without bundler config.
- Tool runner: `vite-node` for `tools/` and `server/` — the fighter/ability auto-discovery uses `import.meta.glob`, which plain `tsx`/Node cannot evaluate.
- Lint boundaries: `eslint-plugin-boundaries` v7 `boundaries/dependencies` policies with `dependency.kind: 'type'` for content→schema — enforces "types only" precisely.
- Lint test fixtures are stored as `.txt` and linted through `ESLint.lintText` under a virtual path inside `src/` — keeps the real tree clean while exercising the real rules.
- Added `src/app/` (game wiring: screens, match controller) and `src/registry/` (content discovery + validation) folders not in the spec's tree — `main.ts` must import everything, and content discovery needs both content and the core validator, which neither `core/` nor `content/` may do.
- Forbidden in core/content/bots additionally: `Math.hypot`, `Math.cbrt`, `**`, `for..in`, `Intl`, `crypto`, `process`, `globalThis` — same engine-dependence / non-determinism reasons as the listed ones.
- Playwright is not a project dependency; the environment's preinstalled copy is used for screenshots — avoids downloading a second browser.
