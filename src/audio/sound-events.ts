/** Maps simulation events and menu actions to synthesized sounds. */
import type { SimEvent } from '../core/events';
import { TUNING } from '../core/tuning';
import type { Synth } from './synth';

export class SoundEvents {
  constructor(private readonly synth: Synth) {}

  onEvents(events: readonly SimEvent[]): void {
    let hits = 0;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          if (hits++ > 3) break; // avoid stacking many thuds in one tick
          // Impact thud: lower and louder with damage.
          const k = Math.min(1, e.damage / TUNING.bigHitDamage);
          this.synth.tone(220 - 150 * k, 0.12 + 0.18 * k, 0.15 + 0.45 * k, 'sine', 50);
          this.synth.noiseBurst(0.06 + 0.08 * k, 0.1 + 0.3 * k, 900 - 500 * k, 0.8);
          break;
        }
        case 'partDied':
          this.synth.noiseBurst(0.25, 0.5, 2400, 2);
          this.synth.tone(500, 0.18, 0.2, 'square', 120);
          break;
        case 'coreDied':
          this.synth.tone(90, 1.2, 0.8, 'sine', 30);
          this.synth.noiseBurst(0.9, 0.6, 180, 0.6);
          break;
        case 'ringOut':
          this.synth.tone(700, 0.6, 0.3, 'sawtooth', 120);
          break;
        case 'roundStart':
          this.synth.tone(440, 0.15, 0.25, 'triangle');
          this.synth.tone(660, 0.25, 0.25, 'triangle', undefined, 0.15);
          break;
        case 'fightStart':
          this.synth.tone(880, 0.3, 0.3, 'square', 660);
          break;
        case 'roundOver':
          this.synth.tone(660, 0.2, 0.25, 'triangle');
          this.synth.tone(440, 0.4, 0.25, 'triangle', undefined, 0.2);
          break;
        case 'matchOver':
          [523, 659, 784, 1046].forEach((f, i) => this.synth.tone(f, 0.35, 0.25, 'triangle', undefined, i * 0.14));
          break;
        case 'dash':
          this.synth.noiseBurst(0.15, 0.15, 1500, 0.7);
          break;
        default:
          break;
      }
    }
  }

  menuMove(): void {
    this.synth.tone(1200, 0.04, 0.08, 'square');
  }
  menuSelect(): void {
    this.synth.tone(900, 0.06, 0.12, 'square', 1400);
  }
  menuBack(): void {
    this.synth.tone(700, 0.06, 0.1, 'square', 400);
  }
}
