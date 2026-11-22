/**
 * Rollback netcode session for one peer.
 *
 *  - Local inputs apply `inputDelay` ticks in the future and are sent immediately; each
 *    packet repeats every unacknowledged input (redundancy against loss).
 *  - The opponent's missing inputs are PREDICTED (repeat their last known input).
 *  - When a real input arrives that differs from the prediction used, the session RESTORES
 *    the saved state of that tick and RESIMULATES to the present.
 *  - States are saved every tick in a ring buffer; rollback never goes further than
 *    `maxRollback` ticks: if the opponent falls that far behind, the session stalls
 *    (time-sync) instead. A softer time-sync also stalls occasionally when we run ahead.
 *  - Presentation events are de-duplicated across resimulation.
 *  - Every `hashInterval` ticks, the hash of a fully confirmed tick is exchanged; a
 *    mismatch produces a desync report.
 */
import type { SimEvent } from '../core/events';
import { EMPTY_INPUT, inputsEqual, type InputFrame } from '../input/input-frame';
import { step } from '../core/simulation';
import { hashState, restoreState, saveState, type SimState, type Snapshot } from '../core/state';
import type { PeerLink } from './peer-link';
import { PacketType, type HashPacket, type InputPacket } from './protocol';

export interface RollbackOptions {
  localPlayer: number;
  inputDelay: number;
  maxRollback?: number;
  hashInterval?: number;
  /** Max inputs repeated per packet. */
  maxInputsPerPacket?: number;
}

export interface DesyncReport {
  tick: number;
  localHash: string;
  remoteHash: string;
  lastMatchingTick: number;
  /** Confirmed inputs [p0, p1] from lastMatchingTick (exclusive) to tick (inclusive). */
  inputs: { tick: number; p0: InputFrame; p1: InputFrame }[];
}

export class RollbackSession {
  readonly localPlayer: number;
  readonly remotePlayer: number;
  inputDelay: number;
  readonly maxRollback: number;
  readonly hashInterval: number;
  private readonly maxPerPacket: number;
  /** inputs[player].get(tick) for confirmed inputs. */
  private readonly confirmed: [Map<number, InputFrame>, Map<number, InputFrame>] = [new Map(), new Map()];
  /** Inputs actually used when each tick was (last) simulated. */
  private readonly used = new Map<number, [InputFrame, InputFrame]>();
  private readonly snapshots = new Map<number, Snapshot>();
  /** Highest remote tick received contiguously from 0. */
  private remoteContig = -1;
  /** Highest local tick the remote has acknowledged. */
  private remoteAck = -1;
  /** Latest local input tick produced. */
  private localLatest = -1;
  private remoteTickSeen = 0;
  private rollbackFrom: number | null = null;
  private readonly emitted = new Map<number, Set<string>>();
  private readonly localHashes = new Map<number, string>();
  private readonly remoteHashes = new Map<number, string>();
  private hashSentUpTo = 0;
  private lastMatchingHashTick = 0;
  desync: DesyncReport | null = null;
  onDesync: ((r: DesyncReport) => void) | null = null;
  // stats
  rollbacks = 0;
  rolledBackTicks = 0;
  stalls = 0;
  maxRollbackSeen = 0;

  constructor(
    readonly sim: SimState,
    readonly link: PeerLink,
    o: RollbackOptions,
  ) {
    this.localPlayer = o.localPlayer;
    this.remotePlayer = 1 - o.localPlayer;
    this.inputDelay = o.inputDelay;
    this.maxRollback = o.maxRollback ?? 8;
    this.hashInterval = o.hashInterval ?? 60;
    this.maxPerPacket = o.maxInputsPerPacket ?? 32;
    // Ticks before the input delay have no input from either player.
    for (let t = 0; t < this.inputDelay; t++) {
      this.confirmed[0].set(t + sim.game.tick, EMPTY_INPUT);
      this.confirmed[1].set(t + sim.game.tick, EMPTY_INPUT);
    }
    this.localLatest = sim.game.tick + this.inputDelay - 1;
    this.remoteContig = sim.game.tick + this.inputDelay - 1;
    link.inputHandler = (p) => this.onInputPacket(p);
    link.hashHandler = (p) => this.onHashPacket(p);
  }

  get tick(): number {
    return this.sim.game.tick;
  }

  /** Highest tick for which both players' inputs are confirmed. */
  get confirmedTick(): number {
    return Math.min(this.localLatest, this.remoteContig);
  }

  // ------------------------------------------------------------------ receiving

  private onInputPacket(p: InputPacket): void {
    this.remoteAck = Math.max(this.remoteAck, p.ack);
    this.remoteTickSeen = Math.max(this.remoteTickSeen, p.senderTick);
    const remote = this.confirmed[this.remotePlayer]!;
    p.inputs.forEach((input, i) => {
      const t = p.first + i;
      if (remote.has(t)) return;
      remote.set(t, input);
      // A tick already simulated with a different (predicted) input must be resimulated.
      const used = this.used.get(t);
      if (used && t < this.tick && !inputsEqual(used[this.remotePlayer]!, input)) {
        this.rollbackFrom = this.rollbackFrom === null ? t : Math.min(this.rollbackFrom, t);
      }
    });
    while (remote.has(this.remoteContig + 1)) this.remoteContig++;
  }

  private onHashPacket(p: HashPacket): void {
    this.remoteHashes.set(p.tick, p.hash);
    this.checkHashes();
  }

  // ------------------------------------------------------------------ input prediction

  private inputFor(player: number, t: number): InputFrame {
    const c = this.confirmed[player]!.get(t);
    if (c) return c;
    // Predict: repeat the latest known input before t.
    for (let k = t - 1; k >= t - 120; k--) {
      const prev = this.confirmed[player]!.get(k);
      if (prev) return prev;
    }
    return EMPTY_INPUT;
  }

  // ------------------------------------------------------------------ public API

  /** Processes received packets: performs any pending rollback. Returns resimulation events. */
  poll(): SimEvent[] {
    this.link.update();
    if (this.rollbackFrom === null) return [];
    const from = this.rollbackFrom;
    this.rollbackFrom = null;
    const snap = this.snapshots.get(from);
    if (!snap) throw new Error(`rollback to ${from} impossible: snapshot missing (tick ${this.tick})`);
    const target = this.tick;
    this.rollbacks++;
    this.rolledBackTicks += target - from;
    this.maxRollbackSeen = Math.max(this.maxRollbackSeen, target - from);
    restoreState(this.sim, snap);
    const events: SimEvent[] = [];
    while (this.tick < target) events.push(...this.simulateTick());
    return events;
  }

  /** True when we must wait for the opponent (rollback window exhausted, or far ahead). */
  shouldStall(): boolean {
    // Hard limit: never predict further than maxRollback ticks past confirmed remote input.
    if (this.tick - this.remoteContig > this.maxRollback) return true;
    // Soft time-sync: if we are ahead of the remote's reported tick (adjusted for latency), wait a tick now and then.
    const rttTicks = this.link.rttMs / (1000 / 60);
    const advantage = this.tick - (this.remoteTickSeen + rttTicks / 2);
    return advantage > 2 && this.tick % 4 === 0;
  }

  /** Records the local input (applies inputDelay ticks from now) and sends inputs. */
  addLocalInput(input: InputFrame): void {
    const t = this.tick + this.inputDelay;
    if (t > this.localLatest) {
      this.confirmed[this.localPlayer]!.set(t, { ...input });
      this.localLatest = t;
    }
    this.sendInputs();
  }

  /** Sends all unacknowledged local inputs (redundancy) plus our tick. */
  sendInputs(): void {
    const first = Math.max(this.remoteAck + 1, this.localLatest - this.maxPerPacket + 1, 0);
    const inputs: InputFrame[] = [];
    for (let t = first; t <= this.localLatest; t++) inputs.push(this.confirmed[this.localPlayer]!.get(t) ?? EMPTY_INPUT);
    this.link.send({ type: PacketType.INPUT, ack: this.remoteContig, first, inputs, senderTick: this.tick });
  }

  /** Simulates one tick (call when !shouldStall()). Returns new presentation events. */
  advance(): SimEvent[] {
    const events = this.simulateTick();
    this.prune();
    this.sendHashes();
    return events;
  }

  private simulateTick(): SimEvent[] {
    const t = this.tick;
    this.snapshots.set(t, saveState(this.sim));
    const inputs: [InputFrame, InputFrame] = [this.inputFor(0, t), this.inputFor(1, t)];
    this.used.set(t, inputs);
    const raw = step(this.sim, inputs);
    if (this.tick % this.hashInterval === 0) this.localHashes.set(this.tick, hashState(this.sim));
    return this.dedupe(t, raw);
  }

  /** Only events not already shown for this tick (resimulation repeats most of them). */
  private dedupe(t: number, events: SimEvent[]): SimEvent[] {
    let seen = this.emitted.get(t);
    if (!seen) this.emitted.set(t, (seen = new Set()));
    const out: SimEvent[] = [];
    for (const e of events) {
      const k = presentationKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  private prune(): void {
    const keepFrom = Math.min(this.confirmedTick, this.tick) - 2;
    for (const k of this.snapshots.keys()) if (k < keepFrom && k < this.tick - this.maxRollback - 2) this.snapshots.delete(k);
    for (const k of this.emitted.keys()) if (k < this.tick - this.maxRollback - 30) this.emitted.delete(k);
    for (const k of this.used.keys()) if (k < keepFrom - 1) this.used.delete(k);
    // Keep confirmed inputs since the last matching hash (for desync reports), bounded.
    // Never drop local inputs the peer hasn't acknowledged (they are resent) or unconfirmed ticks.
    const keepInputs = Math.min(Math.max(this.lastMatchingHashTick, this.tick - 600), this.remoteAck + 1, this.remoteContig + 1) - 1;
    for (const m of this.confirmed) for (const k of m.keys()) if (k < keepInputs) m.delete(k);
  }

  // ------------------------------------------------------------------ hashes

  private sendHashes(): void {
    // A checkpoint hash is final once every input up to that tick is confirmed AND we have
    // simulated past it with those inputs (no pending rollback can change it).
    const final = Math.min(this.confirmedTick + 1, this.tick);
    for (let t = this.hashSentUpTo + this.hashInterval; t <= final; t += this.hashInterval) {
      const h = this.localHashes.get(t);
      if (h === undefined || this.rollbackFrom !== null) break;
      this.link.send({ type: PacketType.HASH, tick: t, hash: h });
      this.hashSentUpTo = t;
    }
    this.checkHashes();
  }

  private checkHashes(): void {
    for (const [t, remote] of this.remoteHashes) {
      if (t > this.hashSentUpTo) continue;
      const local = this.localHashes.get(t);
      if (local === undefined) continue;
      this.remoteHashes.delete(t);
      if (local === remote) {
        this.lastMatchingHashTick = Math.max(this.lastMatchingHashTick, t);
        continue;
      }
      if (this.desync) continue;
      const inputs: DesyncReport['inputs'] = [];
      for (let k = this.lastMatchingHashTick; k < t; k++) inputs.push({ tick: k, p0: this.confirmed[0].get(k) ?? EMPTY_INPUT, p1: this.confirmed[1].get(k) ?? EMPTY_INPUT });
      this.desync = { tick: t, localHash: local, remoteHash: remote, lastMatchingTick: this.lastMatchingHashTick, inputs };
      this.onDesync?.(this.desync);
    }
  }

  /** Confirmed checkpoint hash at a tick (multiple of hashInterval), if final. */
  confirmedHash(t: number): string | undefined {
    return t <= this.hashSentUpTo ? this.localHashes.get(t) : undefined;
  }

  status(): string {
    return `ping ${Math.round(this.link.rttMs)} ms · delay ${this.inputDelay} · rollbacks ${this.rollbacks} (max ${this.maxRollbackSeen})`;
  }
}

/** De-duplication key: tick + type + the parts involved (not float/damage values). */
export function presentationKey(e: SimEvent): string {
  switch (e.type) {
    case 'hit':
      return `${e.tick}:hit:${e.a.fighter}.${e.a.part}:${e.b ? `${e.b.fighter}.${e.b.part}` : 'wall'}`;
    case 'partDied':
    case 'partDetached':
    case 'debrisRemoved':
      return `${e.tick}:${e.type}:${e.ref.fighter}.${e.ref.part}`;
    default:
      return e.key;
  }
}
