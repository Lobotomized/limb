import type { FighterDef, JointDef, MoveDef, PartDef } from '../../../core/schema/fighter-schema';

/**
 * Crab, seen from above, facing +x. A small inner body (root AND core) enclosed by four heavy
 * shell plates (armor). Two claws in front: the big "crusher" on the right, a small claw on the
 * left. Six legs (locomotion) on the sides. Slow to move and turn, very tanky from the front;
 * the back plate is the weak spot.
 *
 * Health budget: ~690 (tanky through armor mass, not health). Mass: ~22 kg. Plate polygons are annular sectors around the body
 * (precomputed, relative to the body center).
 */

const plate = (id: string, name: string, points: [number, number][], mass: number, hp: number): PartDef => ({
  id,
  name,
  shape: { kind: 'polygon', points },
  mass,
  maxHealth: hp,
  tags: ['armor'],
});

const leg = (id: string, name: string): PartDef => ({
  id,
  name,
  shape: { kind: 'capsule', length: 0.42, radius: 0.05 },
  mass: 0.35,
  maxHealth: 18,
  tags: ['locomotion'],
});

const parts: PartDef[] = [
  { id: 'body', name: 'Inner body', shape: { kind: 'circle', radius: 0.22 }, mass: 3, maxHealth: 130 },
  plate('shell_front', 'Front shell', [[0.186, -0.167], [0.349, -0.314], [0.439, -0.168], [0.47, 0], [0.439, 0.168], [0.349, 0.314], [0.186, 0.167]], 3.5, 78),
  plate('shell_left', 'Left shell', [[0.186, 0.167], [0.334, 0.301], [0.194, 0.406], [0.024, 0.449], [-0.15, 0.424], [-0.301, 0.334], [-0.167, 0.186]], 3, 55),
  plate('shell_right', 'Right shell', [[-0.167, -0.186], [-0.301, -0.334], [-0.15, -0.424], [0.024, -0.449], [0.194, -0.406], [0.334, -0.301], [0.186, -0.167]], 3, 55),
  plate('shell_back', 'Back shell', [[-0.167, 0.186], [-0.268, 0.297], [-0.365, 0.163], [-0.4, 0], [-0.365, -0.163], [-0.268, -0.297], [-0.167, -0.186]], 2.5, 30),
  // Crusher claw (right, -y side)
  { id: 'crusher_arm', name: 'Crusher arm', shape: { kind: 'capsule', length: 0.38, radius: 0.08 }, mass: 1.2, maxHealth: 55 },
  { id: 'crusher', name: 'Crusher claw', shape: { kind: 'polygon', points: [[0, -0.11], [0.3, -0.15], [0.44, -0.05], [0.4, 0.07], [0.05, 0.12]] }, mass: 1.9, maxHealth: 80 },
  // Small claw (left, +y side)
  { id: 'small_arm', name: 'Small claw arm', shape: { kind: 'capsule', length: 0.32, radius: 0.065 }, mass: 0.9, maxHealth: 45 },
  { id: 'small_claw', name: 'Small claw', shape: { kind: 'polygon', points: [[0, -0.07], [0.26, -0.06], [0.32, 0.02], [0.24, 0.09], [0.02, 0.08]] }, mass: 1.1, maxHealth: 55 },
  leg('leg_l1', 'Left leg 1'),
  leg('leg_l2', 'Left leg 2'),
  leg('leg_l3', 'Left leg 3'),
  leg('leg_r1', 'Right leg 1'),
  leg('leg_r2', 'Right leg 2'),
  leg('leg_r3', 'Right leg 3'),
];

/** Shell plates are welded on with very strong, nearly locked joints at the body center. */
const plateJoint = (child: string): JointDef => ({
  id: `weld_${child}`,
  parent: 'body',
  child,
  anchorParent: [0, 0],
  anchorChild: [0, 0],
  limits: [-0.05, 0.05],
  strength: 900,
  damping: 30,
  idleAngle: 0,
});

const legJoint = (id: string, anchor: [number, number], idle: number): JointDef => ({
  id: `hip_${id}`,
  parent: 'body',
  child: id,
  anchorParent: anchor,
  anchorChild: [-0.18, 0],
  limits: [idle - 0.8, idle + 0.8],
  strength: 30,
  damping: 1.5,
  idleAngle: idle,
});

const joints: JointDef[] = [
  plateJoint('shell_front'),
  plateJoint('shell_left'),
  plateJoint('shell_right'),
  plateJoint('shell_back'),
  { id: 'crusher_shoulder', parent: 'body', child: 'crusher_arm', anchorParent: [0.3, -0.37], anchorChild: [-0.16, 0], limits: [-1.2, 1.5], strength: 115, damping: 9, idleAngle: 0.25 },
  { id: 'crusher_wrist', parent: 'crusher_arm', child: 'crusher', anchorParent: [0.16, 0], anchorChild: [0.02, 0], limits: [-0.6, 1.3], strength: 110, damping: 7, idleAngle: 0.35 },
  { id: 'small_shoulder', parent: 'body', child: 'small_arm', anchorParent: [0.3, 0.37], anchorChild: [-0.13, 0], limits: [-1.5, 1.2], strength: 100, damping: 6, idleAngle: -0.25 },
  { id: 'small_wrist', parent: 'small_arm', child: 'small_claw', anchorParent: [0.13, 0], anchorChild: [0.02, 0], limits: [-1.3, 0.6], strength: 70, damping: 4, idleAngle: -0.35 },
  legJoint('leg_l1', [0.1, 0.3], 1.25),
  legJoint('leg_l2', [-0.05, 0.32], 1.75),
  legJoint('leg_l3', [-0.2, 0.28], 2.25),
  legJoint('leg_r1', [0.1, -0.3], -1.25),
  legJoint('leg_r2', [-0.05, -0.32], -1.75),
  legJoint('leg_r3', [-0.2, -0.28], -2.25),
];

const CRUSHER = ['crusher_arm', 'crusher'];
const SMALL = ['small_arm', 'small_claw'];
const LEGS_L = ['leg_l1', 'leg_l2', 'leg_l3'];
const LEGS_R = ['leg_r1', 'leg_r2', 'leg_r3'];

const moves: MoveDef[] = [
  // ---- slot 1: crusher claw
  { slot: 1, direction: 'neutral', name: 'Claw thrust', targets: [{ joint: 'crusher_shoulder', angle: -0.05 }, { joint: 'crusher_wrist', angle: 0 }], speed: 12, returnSpeed: 7, requires: CRUSHER },
  { slot: 1, direction: 'up', name: 'Pinch swing', targets: [{ joint: 'crusher_shoulder', angle: 1.4 }, { joint: 'crusher_wrist', angle: 1.1 }], speed: 10, returnSpeed: 7, requires: CRUSHER },
  { slot: 1, direction: 'down', name: 'Backswing', targets: [{ joint: 'crusher_shoulder', angle: -1.15 }, { joint: 'crusher_wrist', angle: -0.5 }], speed: 10, returnSpeed: 7, requires: CRUSHER },
  // ---- slot 2: small claw
  { slot: 2, direction: 'neutral', name: 'Claw thrust', targets: [{ joint: 'small_shoulder', angle: 0.05 }, { joint: 'small_wrist', angle: 0 }], speed: 15, returnSpeed: 9, requires: SMALL },
  { slot: 2, direction: 'down', name: 'Pinch swing', targets: [{ joint: 'small_shoulder', angle: -1.4 }, { joint: 'small_wrist', angle: -1.1 }], speed: 13, returnSpeed: 9, requires: SMALL },
  { slot: 2, direction: 'up', name: 'Backswing', targets: [{ joint: 'small_shoulder', angle: 1.1 }, { joint: 'small_wrist', angle: 0.5 }], speed: 13, returnSpeed: 9, requires: SMALL },
  // ---- slot 3: both claws
  {
    slot: 3, direction: 'neutral', name: 'Double thrust',
    targets: [{ joint: 'crusher_shoulder', angle: 0 }, { joint: 'crusher_wrist', angle: 0 }, { joint: 'small_shoulder', angle: 0 }, { joint: 'small_wrist', angle: 0 }],
    speed: 11, returnSpeed: 7, requires: [...CRUSHER, ...SMALL],
  },
  {
    slot: 3, direction: 'back', name: 'Claw guard',
    targets: [{ joint: 'crusher_shoulder', angle: 1.05 }, { joint: 'crusher_wrist', angle: 1.2 }, { joint: 'small_shoulder', angle: -1.05 }, { joint: 'small_wrist', angle: -1.2 }],
    speed: 12, returnSpeed: 8, requires: ['crusher_arm', 'small_arm'],
  },
  // ---- slot 4: legs
  {
    slot: 4, direction: 'neutral', name: 'Leg kick',
    targets: [
      { joint: 'hip_leg_l1', angle: 0.5 }, { joint: 'hip_leg_l2', angle: 1.0 }, { joint: 'hip_leg_l3', angle: 1.5 },
      { joint: 'hip_leg_r1', angle: -0.5 }, { joint: 'hip_leg_r2', angle: -1.0 }, { joint: 'hip_leg_r3', angle: -1.5 },
    ],
    speed: 16, returnSpeed: 9, requires: ['body'],
  },
  { slot: 4, direction: 'up', name: 'Shell turn', targets: [{ joint: 'crusher_shoulder', angle: 1.05 }, { joint: 'small_shoulder', angle: -1.05 }], speed: 12, returnSpeed: 8, requires: [...LEGS_L.slice(0, 1), ...LEGS_R.slice(0, 1)], spin: 7 },
  { slot: 4, direction: 'down', name: 'Shell turn', targets: [{ joint: 'crusher_shoulder', angle: 1.05 }, { joint: 'small_shoulder', angle: -1.05 }], speed: 12, returnSpeed: 8, requires: [...LEGS_L.slice(0, 1), ...LEGS_R.slice(0, 1)], spin: -7 },
];

export const fighter: FighterDef = {
  id: 'crab',
  name: 'Crab',
  description: 'Heavy shell, big crusher claw. Slow, tanky, and weak from behind.',
  parts,
  joints,
  rootPart: 'body',
  corePart: 'body',
  slots: [
    { id: 1, name: 'Crusher claw', parts: CRUSHER },
    { id: 2, name: 'Small claw', parts: SMALL },
    { id: 3, name: 'Both claws', parts: [...CRUSHER, ...SMALL] },
    { id: 4, name: 'Legs', parts: [...LEGS_L, ...LEGS_R] },
  ],
  moves,
  locomotion: { walkSpeed: 2.7, walkForce: 300, turnSpeed: 3.8, turnTorque: 70, dashImpulse: 95 },
};
