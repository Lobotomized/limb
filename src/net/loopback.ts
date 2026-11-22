/**
 * Runs two rollback sessions against each other over a NetSimulator on a virtual clock,
 * frame by frame like two real clients. Used by the tests and `npm run sim:net`.
 */
import type { InputFrame } from '../input/input-frame';
import { EMPTY_INPUT } from '../input/input-frame';
import { createMatch, step, type MatchOptions } from '../core/simulation';
import { hashState } from '../core/state';
import { FakeTransport } from './fake-transport';
import { NetSimulator, type NetConditions } from './net-simulator';
import { PeerLink } from './peer-link';
import { RollbackSession } from './rollback';

export interface LoopbackOptions {
  match: MatchOptions;
  conditions: NetConditions;
  inputDelay: number;
  /** Compare at this tick (multiple of the hash interval). */
  ticks: number;
  /** Local input of `player` on its local frame `frame`. */
  inputs: (player: number, frame: number) => InputFrame;
  netSeed?: number;
  /** Frame-time skew of peer 1 (e.g. 1.01 = 1% faster clock) to exercise time-sync. */
  clockSkew?: number;
}

export interface LoopbackResult {
  hashes: [string | undefined, string | undefined];
  offlineHash: string;
  desync: boolean;
  rollbacks: [number, number];
  maxRollback: [number, number];
  stalls: [number, number];
  packetsSent: number;
  packetsDropped: number;
  bytesSent: number;
  virtualMs: number;
}

export function runLoopback(o: LoopbackOptions): LoopbackResult {
  const net = new NetSimulator(o.conditions, o.netSeed ?? 7);
  const [ta, tb] = FakeTransport.pair(net);
  const clock = { now: () => net.now };
  const links = [new PeerLink(ta, clock), new PeerLink(tb, clock)];
  const sims = [createMatch(o.match), createMatch(o.match)];
  const sessions = [0, 1].map((p) => new RollbackSession(sims[p]!, links[p]!, { localPlayer: p, inputDelay: o.inputDelay }));
  // What each player actually pressed, by the tick it applies to (for the offline replay).
  const applied: [Map<number, InputFrame>, Map<number, InputFrame>] = [new Map(), new Map()];
  const frames = [0, 0];
  const frameMs = 1000 / 60;
  const acc = [0, 0];
  const skew = [1, o.clockSkew ?? 1];
  const target = o.ticks;
  let guard = 0;
  // Run until both peers have a final (confirmed) hash at the target tick.
  while ((sessions[0]!.confirmedHash(target) === undefined || sessions[1]!.confirmedHash(target) === undefined) && guard++ < target * 20) {
    net.advance(frameMs / 2);
    for (let p = 0; p < 2; p++) {
      acc[p]! += skew[p]! * 0.5;
      while (acc[p]! >= 1) {
        acc[p]! -= 1;
        const s = sessions[p]!;
        s.poll();
        if (s.shouldStall()) {
          s.stalls++;
          s.sendInputs();
          continue;
        }
        const input = o.inputs(p, frames[p]!++);
        const t = s.tick + s.inputDelay;
        if (!applied[p]!.has(t)) applied[p]!.set(t, input);
        s.addLocalInput(input);
        s.advance();
      }
    }
  }
  // Offline replay with exactly the inputs that were applied.
  const offline = createMatch(o.match);
  for (let t = 0; t < target; t++) step(offline, [applied[0].get(t) ?? EMPTY_INPUT, applied[1].get(t) ?? EMPTY_INPUT]);
  const result: LoopbackResult = {
    hashes: [sessions[0]!.confirmedHash(target), sessions[1]!.confirmedHash(target)],
    offlineHash: hashState(offline),
    desync: !!(sessions[0]!.desync || sessions[1]!.desync),
    rollbacks: [sessions[0]!.rollbacks, sessions[1]!.rollbacks],
    maxRollback: [sessions[0]!.maxRollbackSeen, sessions[1]!.maxRollbackSeen],
    stalls: [sessions[0]!.stalls, sessions[1]!.stalls],
    packetsSent: net.sent,
    packetsDropped: net.dropped,
    bytesSent: links[0]!.bytesSent + links[1]!.bytesSent,
    virtualMs: net.now,
  };
  for (const s of [...sims, offline]) s.physics.free();
  return result;
}
