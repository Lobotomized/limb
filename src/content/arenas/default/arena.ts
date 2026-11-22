import type { ArenaDef } from '../../../core/schema/arena-schema';

/**
 * Default arena: 14 m x 9 m. Top and bottom are solid damaging walls; left and right are
 * open ring-out edges. Fighters spawn facing each other along the ring-out axis.
 */
export const arena: ArenaDef = {
  id: 'default',
  name: 'The Pit',
  width: 14,
  height: 9,
  sides: { left: 'ringout', right: 'ringout', top: 'wall', bottom: 'wall' },
  wallThickness: 1,
  spawns: [
    { x: -2.6, y: 0, angle: 0 },
    { x: 2.6, y: 0, angle: 3.141592653589793 },
  ],
  cameraMargin: 1.2,
};
