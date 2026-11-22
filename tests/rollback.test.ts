// Two rollback sessions over the fake transport at 0, 100 and 200 ms latency with 5% loss
// end with the same final hash as an offline run of the same inputs.
import { beforeAll, describe, expect, it } from 'vitest';
import { setup } from './helpers';
import { runLoopback } from '../src/net/loopback';
import { RandomInputs } from '../src/bots/random-input';
import { getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';
import { decodePacket, encodePacket } from '../src/net/protocol';
import { LocalTransport } from '../src/net/local-transport';
import { PeerLink } from '../src/net/peer-link';
import { presentationKey } from '../src/net/rollback';

beforeAll(setup);

function inputsFor(seed: number) {
  const gens = [new RandomInputs(seed), new RandomInputs(seed + 1)];
  const cache: Map<number, ReturnType<RandomInputs['next']>>[] = [new Map(), new Map()];
  return (player: number, frame: number) => {
    const c = cache[player]!;
    while (!c.has(frame)) c.set(c.size, gens[player]!.next());
    return c.get(frame)!;
  };
}

const match = (a: string, b: string, seed: number) => ({ fighters: [getFighter(a).def, getFighter(b).def] as [ReturnType<typeof getFighter>['def'], ReturnType<typeof getFighter>['def']], arena: getArena(), seed });

describe('rollback netcode', () => {
  for (const latency of [0, 100, 200]) {
    it(`matches the offline run at ${latency} ms latency, 5% loss`, () => {
      const r = runLoopback({
        match: match('humanoid', 'crab', latency + 3),
        conditions: { latencyMs: latency / 2, jitterMs: latency / 10, loss: 0.05 },
        inputDelay: 2,
        ticks: 1200,
        inputs: inputsFor(latency + 11),
      });
      expect(r.desync).toBe(false);
      expect(r.hashes[0]).toBeDefined();
      expect(r.hashes[0]).toBe(r.hashes[1]);
      expect(r.hashes[0]).toBe(r.offlineHash);
      expect(r.packetsDropped).toBeGreaterThan(0);
      if (latency > 0) expect(r.rollbacks[0] + r.rollbacks[1]).toBeGreaterThan(0);
      expect(Math.max(...r.maxRollback)).toBeLessThanOrEqual(8);
    });
  }

  it('stays in sync with clock drift (time-sync) and heavy jitter/reordering', () => {
    const r = runLoopback({
      match: match('octopus', 'humanoid', 5),
      conditions: { latencyMs: 60, jitterMs: 40, loss: 0.1 },
      inputDelay: 1,
      ticks: 900,
      inputs: inputsFor(99),
      clockSkew: 1.03,
    });
    expect(r.hashes[0]).toBe(r.offlineHash);
    expect(r.hashes[1]).toBe(r.offlineHash);
    expect(r.stalls[0] + r.stalls[1]).toBeGreaterThan(0);
  });

  it('encodes packets compactly and round-trips them', () => {
    const p = { type: 1 as const, ack: 41, first: 40, inputs: [{ moveX: -3, moveY: 127, aimX: 0, aimY: -127, aimMode: 1, buttons: 0x55 }], senderTick: 44 };
    const bytes = encodePacket(p);
    expect(bytes.length).toBe(1 + 4 + 4 + 1 + 6 + 4);
    expect(decodePacket(bytes)).toEqual(p);
    expect(decodePacket(encodePacket({ type: 2, tick: 600, hash: '0123456789abcdef' }))).toEqual({ type: 2, tick: 600, hash: '0123456789abcdef' });
    expect(decodePacket(new Uint8Array([99]))).toBeNull();
  });

  it('delivers control messages reliably and exactly once', () => {
    const [a, b] = LocalTransport.pair();
    let t = 0;
    const la = new PeerLink(a, { now: () => t });
    const lb = new PeerLink(b, { now: () => t });
    const got: unknown[] = [];
    lb.onControl((d) => got.push(d));
    la.sendControl({ hello: 1 });
    t += 500;
    la.update(); // would resend if unacked; it was acked, so nothing duplicates
    expect(got).toEqual([{ hello: 1 }]);
  });

  it('de-duplicates presentation events by parts, not damage values', () => {
    const base = { tick: 5, key: 'x', a: { fighter: 0, part: 1 }, b: { fighter: 1, part: 2 }, impact: 1, point: { x: 0, y: 0 } };
    expect(presentationKey({ ...base, type: 'hit', damage: 10 })).toBe(presentationKey({ ...base, type: 'hit', damage: 12 }));
  });
});
