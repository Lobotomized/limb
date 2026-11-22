import type { FighterDef, JointDef, MoveDef, PartDef } from '../../../core/schema/fighter-schema';

/**
 * Octopus, seen from above, facing +x. A big round mantle (root AND core) with 8 tentacles of
 * 3 segments radiating all around. Light, fast, weak joints, low health per segment.
 * No blind side, but the core is big.
 *
 * Health budget: 814 (mantle 310 + 24 segments x 21). Mass: ~14 kg.
 * Tentacles are numbered 0..7 counter-clockwise starting at +22.5° (front-left).
 */

// Base angle (rad) and anchor on the mantle for each tentacle (precomputed: no trig in content).
const TENTACLES: { angle: number; anchor: [number, number]; label: string }[] = [
  { angle: 0.3927, anchor: [0.2772, 0.1148], label: 'Front left' },
  { angle: 1.1781, anchor: [0.1148, 0.2772], label: 'Side left' },
  { angle: 1.9635, anchor: [-0.1148, 0.2772], label: 'Flank left' },
  { angle: 2.7489, anchor: [-0.2772, 0.1148], label: 'Rear left' },
  { angle: -2.7489, anchor: [-0.2772, -0.1148], label: 'Rear right' },
  { angle: -1.9635, anchor: [-0.1148, -0.2772], label: 'Flank right' },
  { angle: -1.1781, anchor: [0.1148, -0.2772], label: 'Side right' },
  { angle: -0.3927, anchor: [0.2772, -0.1148], label: 'Front right' },
];

const SEG = [
  { len: 0.32, r: 0.07, mass: 0.48, hp: 21, strength: 60, damping: 2.0, name: 'base' },
  { len: 0.28, r: 0.06, mass: 0.38, hp: 21, strength: 35, damping: 1.2, name: 'mid' },
  { len: 0.25, r: 0.05, mass: 0.27, hp: 21, strength: 19, damping: 0.8, name: 'tip' },
];

const seg = (t: number, s: number): string => `t${t}_${SEG[s]!.name}`;
const joint = (t: number, s: number): string => `j${t}_${s}`;
const clampAngle = (a: number): number => Math.max(-3.09, Math.min(3.09, a));

const parts: PartDef[] = [
  { id: 'mantle', name: 'Mantle', shape: { kind: 'circle', radius: 0.34 }, mass: 5, maxHealth: 310 },
  ...TENTACLES.flatMap((t, ti) =>
    SEG.map((s, si) => ({
      id: seg(ti, si),
      name: `${t.label} ${s.name}`,
      shape: { kind: 'capsule' as const, length: s.len, radius: s.r },
      mass: s.mass,
      maxHealth: s.hp,
      tags: ['locomotion'],
    })),
  ),
];

const joints: JointDef[] = TENTACLES.flatMap((t, ti) =>
  SEG.map((s, si) => ({
    id: joint(ti, si),
    parent: si === 0 ? 'mantle' : seg(ti, si - 1),
    child: seg(ti, si),
    anchorParent: si === 0 ? t.anchor : ([SEG[si - 1]!.len / 2 - 0.03, 0] as [number, number]),
    anchorChild: [-(s.len / 2 - 0.03), 0] as [number, number],
    limits: si === 0 ? ([clampAngle(t.angle - 1.3), clampAngle(t.angle + 1.3)] as [number, number]) : ([-1.6, 1.6] as [number, number]),
    strength: s.strength,
    damping: s.damping,
    idleAngle: si === 0 ? t.angle : 0.12 * Math.sign(t.angle),
  })),
);

/** Targets for a set of tentacles: base angle offset (toward +y when positive) and segment bend. */
function pose(tentacles: number[], base: (t: number) => number, bend: (t: number) => number): MoveDef['targets'] {
  return tentacles.flatMap((ti) => [
    { joint: joint(ti, 0), angle: clampAngle(base(ti)) },
    { joint: joint(ti, 1), angle: bend(ti) },
    { joint: joint(ti, 2), angle: bend(ti) },
  ]);
}
const req = (tentacles: number[]): string[] => tentacles.map((t) => seg(t, 0));
const A = (t: number): number => TENTACLES[t]!.angle;
const side = (t: number): number => (A(t) > 0 ? 1 : -1);

const FRONT = [0, 7];
const SIDES = [1, 2, 5, 6];
const REAR = [3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];

const moves: MoveDef[] = [
  // ---- slot 1: front tentacles
  { slot: 1, direction: 'neutral', name: 'Whip', targets: pose(FRONT, (t) => 0.06 * side(t), () => 0), speed: 22, returnSpeed: 12, requires: req(FRONT) },
  { slot: 1, direction: 'up', name: 'Sweep', targets: pose(FRONT, (t) => A(t) + 1.2, () => 0.3), speed: 16, returnSpeed: 10, requires: req(FRONT) },
  { slot: 1, direction: 'down', name: 'Sweep', targets: pose(FRONT, (t) => A(t) - 1.2, () => -0.3), speed: 16, returnSpeed: 10, requires: req(FRONT) },
  { slot: 1, direction: 'back', name: 'Curl guard', targets: pose(FRONT, (t) => 0.15 * side(t), (t) => -1.45 * side(t)), speed: 14, returnSpeed: 9, requires: req(FRONT) },
  // ---- slot 2: side tentacles
  { slot: 2, direction: 'neutral', name: 'Side whip', targets: pose(SIDES, (t) => A(t) - 0.9 * side(t), () => 0), speed: 18, returnSpeed: 10, requires: req(SIDES) },
  { slot: 2, direction: 'up', name: 'Sweep', targets: pose(SIDES, (t) => A(t) + 1.1, () => 0.35), speed: 15, returnSpeed: 10, requires: req(SIDES) },
  { slot: 2, direction: 'down', name: 'Sweep', targets: pose(SIDES, (t) => A(t) - 1.1, () => -0.35), speed: 15, returnSpeed: 10, requires: req(SIDES) },
  { slot: 2, direction: 'back', name: 'Curl guard', targets: pose(SIDES, (t) => A(t) - 0.5 * side(t), (t) => -1.4 * side(t)), speed: 13, returnSpeed: 9, requires: req(SIDES) },
  // ---- slot 3: rear tentacles
  { slot: 3, direction: 'neutral', name: 'Rear whip', targets: pose(REAR, (t) => A(t) - 1.25 * side(t), () => 0), speed: 18, returnSpeed: 10, requires: req(REAR) },
  { slot: 3, direction: 'back', name: 'Curl guard', targets: pose(REAR, (t) => A(t), (t) => 1.4 * side(t)), speed: 13, returnSpeed: 9, requires: req(REAR) },
  // ---- slot 4: all tentacles
  { slot: 4, direction: 'neutral', name: 'Spread', targets: pose(ALL, (t) => A(t), () => 0), speed: 14, returnSpeed: 9, requires: ['mantle'] },
  { slot: 4, direction: 'back', name: 'Curl guard', targets: pose(ALL, (t) => A(t), (t) => -1.3 * side(t)), speed: 12, returnSpeed: 9, requires: ['mantle'] },
  { slot: 4, direction: 'up', name: 'Spin', targets: pose(ALL, (t) => A(t), () => 0), speed: 14, returnSpeed: 9, requires: ['mantle'], spin: 10 },
  { slot: 4, direction: 'down', name: 'Spin', targets: pose(ALL, (t) => A(t), () => 0), speed: 14, returnSpeed: 9, requires: ['mantle'], spin: -10 },
];

const tentacleParts = (ts: number[]): string[] => ts.flatMap((t) => [0, 1, 2].map((s) => seg(t, s)));

export const fighter: FighterDef = {
  id: 'octopus',
  name: 'Octopus',
  description: 'Eight light tentacles all around. Fast and slippery, but the big mantle is the core.',
  parts,
  joints,
  rootPart: 'mantle',
  corePart: 'mantle',
  slots: [
    { id: 1, name: 'Front tentacles', parts: tentacleParts(FRONT) },
    { id: 2, name: 'Side tentacles', parts: tentacleParts(SIDES) },
    { id: 3, name: 'Rear tentacles', parts: tentacleParts(REAR) },
    { id: 4, name: 'All tentacles', parts: tentacleParts(ALL) },
  ],
  moves,
  locomotion: { walkSpeed: 5.6, walkForce: 260, turnSpeed: 9, turnTorque: 36, dashImpulse: 85 },
};
