/** Bot difficulty levels. All times are in ticks (60 per second). */
export type DifficultyId = 'easy' | 'medium' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  /** The bot sees the world as it was this many ticks ago. */
  reactionDelay: number;
  /** Ticks between decisions. */
  decisionInterval: number;
  /** Random aim error (radians, +/-). */
  aimNoise: number;
  /** Random extra hold/delay on moves (ticks, 0..n). */
  timingNoise: number;
  /** Whether the bot weighs part-health trades (attack with healthy parts into weak ones). */
  healthTrades: boolean;
  /** Probability per decision of using dash when it would help. */
  dashChance: number;
  /** Probability per decision of guarding when threatened. */
  guardChance: number;
  /** Random score noise added to every option (higher = sloppier choices). */
  choiceNoise: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', reactionDelay: 30, decisionInterval: 24, aimNoise: 0.45, timingNoise: 14, healthTrades: false, dashChance: 0.15, guardChance: 0.2, choiceNoise: 0.6 },
  medium: { id: 'medium', reactionDelay: 15, decisionInterval: 12, aimNoise: 0.2, timingNoise: 6, healthTrades: false, dashChance: 0.4, guardChance: 0.5, choiceNoise: 0.3 },
  hard: { id: 'hard', reactionDelay: 6, decisionInterval: 6, aimNoise: 0.06, timingNoise: 2, healthTrades: true, dashChance: 0.75, guardChance: 0.8, choiceNoise: 0.1 },
};

export const DIFFICULTY_IDS: DifficultyId[] = ['easy', 'medium', 'hard'];
