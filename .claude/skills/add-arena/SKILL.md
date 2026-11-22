---
name: add-arena
description: Use when adding a new arena to Limb Clash (size, wall vs ring-out sides, obstacles, spawn points, camera margin).
---

# Add an arena

1. Create `src/content/arenas/<id>/arena.ts` exporting `arena: ArenaDef` (type-only import from
   `src/core/schema/arena-schema.ts`). `id` must be unique and lowercase.
2. **Size**: `width` (x) × `height` (y) in meters, centered on the origin (default 14 × 9).
3. **Sides**: each of `left/right/top/bottom` is `'wall'` (solid, damages parts that hit it hard;
   built as a `wallThickness` box just outside the bounds, corners closed) or `'ringout'` (a core
   crossing it loses the round; debris crossing it is removed).
4. **Obstacles** (optional): solid rectangles `{x, y, w, h}` inside the arena (they damage like walls).
5. **Spawns**: two `{x, y, angle}` (angle = initial facing). Keep fighters ~5 m apart and facing
   each other, well away from ring-out edges.
6. **cameraMargin**: meters the camera may show beyond the arena (default 1.2).
7. Validation runs at load (`validateArena`). To use it, pass `getArena('<id>')` where matches are
   created (`src/app/game.ts`, `src/bots/runner.ts` has an `arena` option: `sim:bots` can be pointed at it).
8. Check the look with `npm run dev`, then `npm run sim:bots -- --all --matches 20` on the new arena
   (ring-out counts should be reasonable), and `npm run check`.
