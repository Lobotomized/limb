import type { FighterDef, JointDef, MoveDef, PartDef } from '../../../core/schema/fighter-schema';

/**
 * Humanoid, seen from above, facing +x. Torso/shoulders are the root; the head (core)
 * sits in the middle, a little forward. Two arms (upper arm, forearm, hand) and two
 * short legs under the body (locomotion) that stick out behind and show when turned.
 *
 * Health budget: 849 (the torso is the root: losing it loses the round, so it carries extra health). Mass: ~16.7 kg.
 * Side convention: "l" parts are on the +y side (the fighter's left when facing +x).
 */

const arm = (s: 'l' | 'r', label: string): PartDef[] => [
  { id: `upper_arm_${s}`, name: `${label} upper arm`, shape: { kind: 'capsule', length: 0.44, radius: 0.075 }, mass: 1.2, maxHealth: 80 },
  { id: `forearm_${s}`, name: `${label} forearm`, shape: { kind: 'capsule', length: 0.4, radius: 0.068 }, mass: 0.9, maxHealth: 80 },
  { id: `hand_${s}`, name: `${label} hand`, shape: { kind: 'circle', radius: 0.085 }, mass: 0.55, maxHealth: 72 },
];

const parts: PartDef[] = [
  {
    id: 'torso',
    name: 'Torso',
    shape: { kind: 'polygon', points: [[-0.13, -0.42], [0.06, -0.4], [0.14, -0.18], [0.14, 0.18], [0.06, 0.4], [-0.13, 0.42], [-0.17, 0]] },
    mass: 6,
    maxHealth: 205,
    tags: ['armor'],
  },
  { id: 'head', name: 'Head', shape: { kind: 'circle', radius: 0.17 }, mass: 2.5, maxHealth: 100 },
  ...arm('l', 'Left'),
  ...arm('r', 'Right'),
  { id: 'leg_l', name: 'Left leg', shape: { kind: 'capsule', length: 0.38, radius: 0.08 }, mass: 1.5, maxHealth: 40, tags: ['locomotion'] },
  { id: 'leg_r', name: 'Right leg', shape: { kind: 'capsule', length: 0.38, radius: 0.08 }, mass: 1.5, maxHealth: 40, tags: ['locomotion'] },
];

// sign: +1 for the left arm (+y side), -1 for the right arm. Positive angles rotate toward +y.
const armJoints = (s: 'l' | 'r', sign: number): JointDef[] => [
  { id: `shoulder_${s}`, parent: 'torso', child: `upper_arm_${s}`, anchorParent: [0, 0.4 * sign], anchorChild: [-0.18, 0], limits: sign > 0 ? [-1.3, 2.2] : [-2.2, 1.3], strength: 110, damping: 6, idleAngle: 0.35 * sign },
  { id: `elbow_${s}`, parent: `upper_arm_${s}`, child: `forearm_${s}`, anchorParent: [0.18, 0], anchorChild: [-0.16, 0], limits: sign > 0 ? [-2.5, 0.15] : [-0.15, 2.5], strength: 75, damping: 4, idleAngle: -1.15 * sign },
  { id: `wrist_${s}`, parent: `forearm_${s}`, child: `hand_${s}`, anchorParent: [0.17, 0], anchorChild: [-0.05, 0], limits: [-0.6, 0.6], strength: 22, damping: 1.2, idleAngle: 0 },
];

const joints: JointDef[] = [
  { id: 'neck', parent: 'torso', child: 'head', anchorParent: [-0.01, 0], anchorChild: [0, 0], limits: [-0.5, 0.5], strength: 40, damping: 3, idleAngle: 0 },
  ...armJoints('l', 1),
  ...armJoints('r', -1),
  // Legs hang from the hips and trail behind the torso (pivot at the leg's front end).
  { id: 'hip_l', parent: 'torso', child: 'leg_l', anchorParent: [-0.04, 0.2], anchorChild: [0.15, 0], limits: [-0.3, 2.7], strength: 80, damping: 5, idleAngle: 0.15 },
  { id: 'hip_r', parent: 'torso', child: 'leg_r', anchorParent: [-0.04, -0.2], anchorChild: [0.15, 0], limits: [-2.7, 0.3], strength: 80, damping: 5, idleAngle: -0.15 },
];

const L = ['upper_arm_l', 'forearm_l'];
const R = ['upper_arm_r', 'forearm_r'];

const moves: MoveDef[] = [
  // ---- slot 1: left arm
  { slot: 1, direction: 'neutral', name: 'Jab', targets: [{ joint: 'shoulder_l', angle: 0.05 }, { joint: 'elbow_l', angle: 0 }, { joint: 'wrist_l', angle: 0 }], speed: 18, returnSpeed: 10, requires: L },
  { slot: 1, direction: 'down', name: 'Hook', targets: [{ joint: 'shoulder_l', angle: -0.9 }, { joint: 'elbow_l', angle: -1.0 }], speed: 13, returnSpeed: 9, requires: L },
  { slot: 1, direction: 'up', name: 'Backhand', targets: [{ joint: 'shoulder_l', angle: 1.9 }, { joint: 'elbow_l', angle: -0.1 }], speed: 14, returnSpeed: 9, requires: L },
  // ---- slot 2: right arm (mirrored)
  { slot: 2, direction: 'neutral', name: 'Jab', targets: [{ joint: 'shoulder_r', angle: -0.05 }, { joint: 'elbow_r', angle: 0 }, { joint: 'wrist_r', angle: 0 }], speed: 18, returnSpeed: 10, requires: R },
  { slot: 2, direction: 'up', name: 'Hook', targets: [{ joint: 'shoulder_r', angle: 0.9 }, { joint: 'elbow_r', angle: 1.0 }], speed: 13, returnSpeed: 9, requires: R },
  { slot: 2, direction: 'down', name: 'Backhand', targets: [{ joint: 'shoulder_r', angle: -1.9 }, { joint: 'elbow_r', angle: 0.1 }], speed: 14, returnSpeed: 9, requires: R },
  // ---- slot 3: both arms
  {
    slot: 3, direction: 'neutral', name: 'Double push',
    targets: [{ joint: 'shoulder_l', angle: 0.12 }, { joint: 'elbow_l', angle: 0 }, { joint: 'shoulder_r', angle: -0.12 }, { joint: 'elbow_r', angle: 0 }],
    speed: 11, returnSpeed: 8, requires: [...L, ...R],
  },
  {
    slot: 3, direction: 'back', name: 'Guard',
    targets: [{ joint: 'shoulder_l', angle: 0.75 }, { joint: 'elbow_l', angle: -2.1 }, { joint: 'shoulder_r', angle: -0.75 }, { joint: 'elbow_r', angle: 2.1 }],
    speed: 16, returnSpeed: 10, requires: [L[1]!, R[1]!],
  },
  {
    slot: 3, direction: 'up', name: 'Spin attack',
    targets: [{ joint: 'shoulder_l', angle: 1.5 }, { joint: 'elbow_l', angle: 0 }, { joint: 'shoulder_r', angle: -1.5 }, { joint: 'elbow_r', angle: 0 }],
    speed: 12, returnSpeed: 8, requires: [...L, ...R, 'leg_l', 'leg_r'], spin: 11,
  },
  {
    slot: 3, direction: 'down', name: 'Spin attack',
    targets: [{ joint: 'shoulder_l', angle: 1.5 }, { joint: 'elbow_l', angle: 0 }, { joint: 'shoulder_r', angle: -1.5 }, { joint: 'elbow_r', angle: 0 }],
    speed: 12, returnSpeed: 8, requires: [...L, ...R, 'leg_l', 'leg_r'], spin: -11,
  },
  // ---- slot 4: legs
  { slot: 4, direction: 'neutral', name: 'Sweep kick', targets: [{ joint: 'hip_l', angle: 2.6 }], speed: 15, returnSpeed: 9, requires: ['leg_l'] },
  { slot: 4, direction: 'up', name: 'Sweep kick', targets: [{ joint: 'hip_l', angle: 2.6 }], speed: 15, returnSpeed: 9, requires: ['leg_l'] },
  { slot: 4, direction: 'down', name: 'Sweep kick', targets: [{ joint: 'hip_r', angle: -2.6 }], speed: 15, returnSpeed: 9, requires: ['leg_r'] },
];

export const fighter: FighterDef = {
  id: 'humanoid',
  name: 'Humanoid',
  description: 'Balanced all-rounder. Fast jabs, a solid guard and a spinning finisher.',
  parts,
  joints,
  rootPart: 'torso',
  corePart: 'head',
  slots: [
    { id: 1, name: 'Left arm', parts: ['upper_arm_l', 'forearm_l', 'hand_l'] },
    { id: 2, name: 'Right arm', parts: ['upper_arm_r', 'forearm_r', 'hand_r'] },
    { id: 3, name: 'Both arms', parts: ['upper_arm_l', 'forearm_l', 'upper_arm_r', 'forearm_r'] },
    { id: 4, name: 'Legs', parts: ['leg_l', 'leg_r'] },
  ],
  moves,
  locomotion: { walkSpeed: 4.5, walkForce: 280, turnSpeed: 7, turnTorque: 45, dashImpulse: 70 },
};
