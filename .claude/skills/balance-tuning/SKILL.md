---
name: balance-tuning
description: Use when tuning Limb Clash balance - win rates, damage, round length, fighter stats. Explains where every number lives, how to run bot matches, and what healthy numbers look like.
---

# Balance tuning

## Where the numbers live
- **Global** — `src/core/tuning.ts`: `damageScale`, `impactThreshold`, `maxHitDamage`,
  `pairCooldownTicks`, `wallDamageScale`, hit-stop sizes, round timings, damping (ground friction),
  restitution, motor stiffness, steering/turn gains, dash cooldown.
- **Per fighter** — `src/content/fighters/<id>/fighter.ts`: part `mass`/`maxHealth`/shape, joint
  `strength`/`damping`/limits, move `speed`/`returnSpeed`/targets, `locomotion` speeds and forces.
- **Bot behavior** — `src/content/fighters/<id>/bot.ts` (hints) and `src/bots/bot.ts` /
  `src/bots/difficulty.ts` (generic brain). Bot changes shift win rates too; keep them generic.

## Damage model in one line
`damage = round(damageScale × max(0, closingSpeed × reducedMass − impactThreshold))`, capped,
equal on both parts. Typical limb impacts are 0.5–2, solid hits 3–6, heavy slams up to ~20.
`npm run dev` → Sandbox shows impact → damage live and lets you edit tuning values.

## Workflow
1. Baseline: `npm run sim:bots -- --all --difficulty hard --matches 50` (≈2 min on 4 cores; it
   alternates sides; mirror matches show P1-side vs P2-side wins).
2. Find the cause: `npm run sim:parts -- <a> <b>` (which parts take/deal damage; `dealt == taken`
   for a part means part-on-part trades, `taken > dealt` means walls).
3. **Change one thing at a time**, re-run the affected matchups with 50 matches (24 is ±10 % noise).
4. Healthy at hard: every cross-matchup **40–60 %** (35–65 % acceptable), mirrors ~50 %, no timeouts,
   no stuck matches, average rounds roughly 15–40 s, every fighter uses most of its moves.
5. Also look at easy/medium (`--difficulty easy`) — they shouldn't be wildly lopsided.
6. Record the final table in `DECISIONS.md`; run `npm run check` (bot tests use a tick limit).

## Known levers (from the first pass)
- Core health vs. the opponent's total limb health decides core-on-limb trading.
- A root that isn't the core is a second weak point (humanoid torso).
- Mantle-sized cores trade into small exposed cores; mirror matches of the same core draw a lot.
- `wallDamageScale` strongly affects heavy-vs-light matchups (pinning).
- Drive phases: long root-first lunges make heavy roots/cores collide (huge equal damage, mirror
  draws). Keep travel short and lead with limbs. A phase's `spin` above what `turnTorque` can reach
  changes nothing.
- Bot hints decide a lot now: a move missing from `attackMoves`/`guardMoves` is never used by bots
  (e.g. octopus Jet retreat / Spear dive). The hard bot's health-trade weight is in `src/bots/bot.ts`.
