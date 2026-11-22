/**
 * Arena definition types (src/content/arenas/<id>/arena.ts).
 * A rectangular play space centered on the origin. Each side is either a solid
 * damaging wall or an open ring-out edge.
 */
export type ArenaSide = 'wall' | 'ringout';

export interface ArenaDef {
  id: string;
  name: string;
  /** Play-space width (x) and height (y), meters. */
  width: number;
  height: number;
  sides: { left: ArenaSide; right: ArenaSide; top: ArenaSide; bottom: ArenaSide };
  /** Wall thickness (m). */
  wallThickness: number;
  /** Optional extra solid rectangles inside the arena (center x/y, width/height). */
  obstacles?: { x: number; y: number; w: number; h: number }[];
  /** Spawn pose per player (angle = facing). */
  spawns: [{ x: number; y: number; angle: number }, { x: number; y: number; angle: number }];
  /** Extra margin (m) the camera may show beyond the arena. */
  cameraMargin: number;
}

export interface ArenaModule {
  arena: ArenaDef;
}
