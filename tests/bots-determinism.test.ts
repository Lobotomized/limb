import { describe, expect, it } from 'vitest';
import { runBotMatch } from '../src/bots/runner';
import { initPhysics } from '../src/core/physics';
import { createMatch, step } from '../src/core/simulation';
import { createBot } from '../src/bots/bot';
import { getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';
import { AimMode } from '../src/core/input-frame';

describe('bots', () => {
  it('are deterministic: same seed, same match', async () => {
    const a = await runBotMatch({ a: 'humanoid', b: 'crab', difficultyA: 'hard', difficultyB: 'medium', seed: 7, maxTicks: 4000 });
    const b = await runBotMatch({ a: 'humanoid', b: 'crab', difficultyA: 'hard', difficultyB: 'medium', seed: 7, maxTicks: 4000 });
    expect(a).toEqual(b);
  });

  it('produce valid human-style inputs and actually attack', async () => {
    await initPhysics();
    const s = createMatch({ fighters: [getFighter('octopus').def, getFighter('humanoid').def], arena: getArena(), seed: 3 });
    const bot = createBot(s, 0, 'hard', 3);
    let presses = 0;
    let prev = 0;
    for (let t = 0; t < 1200; t++) {
      const inp = bot.input(s);
      for (const k of ['moveX', 'moveY', 'aimX', 'aimY'] as const) {
        expect(Number.isInteger(inp[k])).toBe(true);
        expect(Math.abs(inp[k])).toBeLessThanOrEqual(127);
      }
      expect([AimMode.AUTO, AimMode.VECTOR, AimMode.TURN_LEFT, AimMode.TURN_RIGHT]).toContain(inp.aimMode);
      if (inp.buttons & 0xf & ~prev) presses++;
      prev = inp.buttons;
      step(s, [inp, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimMode: 0, buttons: 0 }]);
    }
    expect(presses).toBeGreaterThan(5);
    s.physics.free();
  });
});
