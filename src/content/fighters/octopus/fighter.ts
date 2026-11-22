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
type Targets = MoveDef['phases'][number]['targets'];
function pose(tentacles: number[], base: (t: number) => number, bend: (t: number) => number): Targets {
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
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const idleBend = (t: number): number => 0.12 * side(t);
const whip = (ts: number[]): Targets => pose(ts, (t) => 0.06 * side(t), () => 0);
const rest = (ts: number[]): Targets => pose(ts, A, idleBend);

const moves: MoveDef[] = [
  {
    button: 'A', direction: 'neutral', name: 'Lash flurry',
    description: 'The two front tentacles whip forward in turn.',
    phases: [
      { targets: whip([0]), speed: 22, ticks: 7 },
      { targets: [...rest([0]), ...whip([7])], speed: 22, ticks: 7 },
      { targets: [...rest([7]), ...whip([0])], speed: 22, ticks: 7 },
      { targets: rest([0]), speed: 18, ticks: 4 },
    ],
    returnSpeed: 12, requires: req(FRONT),
  },
  {
    button: 'B', direction: 'neutral', name: 'Coil crack',
    description: 'Hold to coil the front tentacles back; release to crack them forward.',
    phases: [
      { targets: pose(FRONT, (t) => A(t) + 0.9 * side(t), (t) => 1.3 * side(t)), speed: 12, ticks: 14, hold: true, maxHoldTicks: 90 },
      { targets: whip(FRONT), speed: 30, ticks: 12 },
    ],
    returnSpeed: 10, requires: req(FRONT),
  },
  {
    button: 'A', direction: 'back', name: 'Jet retreat',
    description: 'Jet backwards with the front tentacles curled over the mantle.',
    phases: [{ targets: pose(FRONT, (t) => 0.15 * side(t), (t) => -1.45 * side(t)), speed: 14, ticks: 16, drive: [-7, 0] }],
    returnSpeed: 9, requires: ['mantle'],
  },
  {
    button: 'B', direction: 'back', name: 'Maelstrom',
    description: 'Spread all eight tentacles and spin. Hold to keep spinning.',
    phases: [
      { targets: pose(ALL, A, () => 0), speed: 14, ticks: 6 },
      { targets: [], speed: 14, ticks: 30, spin: 11, hold: true, maxHoldTicks: 90 },
    ],
    returnSpeed: 9, requires: ['mantle'],
  },
  {
    button: 'A', direction: 'forward', name: 'Spear dive',
    description: 'Sweep the side tentacles back and dive in, front tentacles first.',
    phases: [
      { targets: [...whip(FRONT), ...pose(SIDES, (t) => A(t) + 0.7 * side(t), () => 0)], speed: 16, ticks: 6 },
      { targets: [], speed: 16, ticks: 10, drive: [6, 0] },
    ],
    returnSpeed: 10, requires: req(FRONT),
  },
  {
    button: 'B', direction: 'forward', name: 'Embrace',
    description: 'Reach around with six tentacles while stepping in, then squeeze them shut.',
    phases: [
      { targets: [...pose(FRONT, (t) => 0.5 * side(t), () => 0), ...pose([1, 6], (t) => 0.9 * side(t), () => 0), ...pose([2, 5], (t) => 1.2 * side(t), () => 0)], speed: 14, ticks: 12, drive: [3, 0] },
      { targets: [...pose(FRONT, (t) => 0.1 * side(t), (t) => -1.4 * side(t)), ...pose([1, 6], (t) => 0.4 * side(t), (t) => -1.4 * side(t)), ...pose([2, 5], (t) => 0.8 * side(t), (t) => -1.4 * side(t))], speed: 18, ticks: 14 },
    ],
    returnSpeed: 9, requires: req([...FRONT, 1, 6]),
  },
];

export const fighter: FighterDef = {
  id: 'octopus',
  name: 'Octopus',
  description: 'Eight light tentacles all around. Fast and slippery, but the big mantle is the core.',
  parts,
  joints,
  rootPart: 'mantle',
  corePart: 'mantle',
  moves,
  locomotion: { walkSpeed: 5.6, walkForce: 260, turnSpeed: 9, turnTorque: 36, dashImpulse: 85 },
};
