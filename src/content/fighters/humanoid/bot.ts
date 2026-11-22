import type { FighterBotHints } from '../../../core/schema/fighter-schema';

export const botHints: FighterBotHints = {
  attackMoves: ['Jab', 'Hook', 'Double push', 'Spin attack', 'Backhand', 'Sweep kick'],
  guardMoves: ['Guard'],
  idealDistance: 1.25,
  shieldParts: ['forearm_l', 'forearm_r', 'upper_arm_l', 'upper_arm_r'],
  reach: 1.15,
};
