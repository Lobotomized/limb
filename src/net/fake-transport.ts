/** Transport over a NetSimulator (latency, jitter, loss, reordering). For tests and sim:net. */
import type { NetSimulator } from './net-simulator';
import { TransportEvents, type Transport } from './transport';

export class FakeTransport implements Transport {
  private peer: FakeTransport | null = null;
  private readonly ev = new TransportEvents();

  constructor(private readonly net: NetSimulator) {}

  static pair(net: NetSimulator): [FakeTransport, FakeTransport] {
    const a = new FakeTransport(net);
    const b = new FakeTransport(net);
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  async connect(): Promise<void> {}
  send(data: Uint8Array): void {
    const peer = this.peer;
    if (!peer || this.ev.closed) return;
    this.net.transmit(data, (d) => peer.ev.emitMessage(d));
  }
  onMessage(cb: (d: Uint8Array) => void): void {
    this.ev.onMessage(cb);
  }
  onDisconnect(cb: (r: string) => void): void {
    this.ev.onDisconnect(cb);
  }
  ping(): number {
    return this.net.conditions.latencyMs * 2;
  }
  close(): void {
    this.peer?.ev.emitDisconnect('peer closed');
    this.ev.closed = true;
  }
}
