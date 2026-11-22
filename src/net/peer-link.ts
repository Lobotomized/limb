/**
 * A peer link on top of any Transport: decodes packets and routes them, measures RTT with
 * pings, and carries reliable control messages (resent until acknowledged).
 */
import { decodePacket, encodePacket, PacketType, type HashPacket, type InputPacket, type Packet } from './protocol';
import type { Transport } from './transport';

export interface Clock {
  now(): number;
}

const PING_INTERVAL_MS = 500;
const RESEND_MS = 150;

export class PeerLink {
  rttMs = 0;
  private rttSamples: number[] = [];
  private pingId = 0;
  private lastPing = -Infinity;
  private controlSeq = 0;
  private readonly unacked = new Map<number, { bytes: Uint8Array; lastSent: number }>();
  private readonly seenControl = new Set<number>();
  private controlHandlers: ((data: unknown) => void)[] = [];
  inputHandler: ((p: InputPacket) => void) | null = null;
  hashHandler: ((p: HashPacket) => void) | null = null;
  disconnected: string | null = null;
  lastReceiveMs: number;
  bytesSent = 0;

  constructor(
    readonly transport: Transport,
    readonly clock: Clock,
  ) {
    this.lastReceiveMs = clock.now();
    transport.onMessage((d) => this.receive(d));
    transport.onDisconnect((r) => (this.disconnected = r));
  }

  send(p: Packet): void {
    const bytes = encodePacket(p);
    this.bytesSent += bytes.length;
    this.transport.send(bytes);
  }

  /** Sends a JSON control message reliably (resent until acked). */
  sendControl(data: unknown): void {
    const seq = ++this.controlSeq;
    const bytes = encodePacket({ type: PacketType.CONTROL, seq, data });
    this.unacked.set(seq, { bytes, lastSent: this.clock.now() });
    this.transport.send(bytes);
  }

  onControl(cb: (data: unknown) => void): void {
    this.controlHandlers.push(cb);
  }

  /** Call regularly: pings and control resends. */
  update(): void {
    const now = this.clock.now();
    if (now - this.lastPing >= PING_INTERVAL_MS) {
      this.lastPing = now;
      this.send({ type: PacketType.PING, id: ++this.pingId, sentMs: now });
    }
    for (const u of this.unacked.values()) {
      if (now - u.lastSent >= RESEND_MS) {
        u.lastSent = now;
        this.transport.send(u.bytes);
      }
    }
  }

  private receive(d: Uint8Array): void {
    const p = decodePacket(d);
    if (!p) return;
    this.lastReceiveMs = this.clock.now();
    switch (p.type) {
      case PacketType.INPUT:
        this.inputHandler?.(p);
        break;
      case PacketType.HASH:
        this.hashHandler?.(p);
        break;
      case PacketType.PING:
        this.send({ type: PacketType.PONG, id: p.id, sentMs: p.sentMs });
        break;
      case PacketType.PONG: {
        const rtt = this.clock.now() - p.sentMs;
        this.rttSamples.push(rtt);
        if (this.rttSamples.length > 8) this.rttSamples.shift();
        this.rttMs = [...this.rttSamples].sort((a, b) => a - b)[Math.floor(this.rttSamples.length / 2)] ?? rtt;
        break;
      }
      case PacketType.CONTROL:
        this.send({ type: PacketType.ACK, seq: p.seq });
        if (this.seenControl.has(p.seq)) break;
        this.seenControl.add(p.seq);
        for (const cb of this.controlHandlers) cb(p.data);
        break;
      case PacketType.ACK:
        this.unacked.delete(p.seq);
        break;
    }
  }

  close(): void {
    this.transport.close();
  }
}

/** Picks an input delay (frames) from the measured round-trip time. */
export function autoInputDelay(rttMs: number): number {
  if (rttMs < 40) return 1;
  if (rttMs < 100) return 2;
  if (rttMs < 170) return 3;
  return 4;
}
