/** Two transports wired together in one process (instant, lossless). For tests and tools. */
import { TransportEvents, type Transport } from './transport';

export class LocalTransport implements Transport {
  private peer: LocalTransport | null = null;
  private readonly ev = new TransportEvents();

  static pair(): [LocalTransport, LocalTransport] {
    const a = new LocalTransport();
    const b = new LocalTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  async connect(): Promise<void> {}
  send(data: Uint8Array): void {
    this.peer?.ev.emitMessage(data.slice());
  }
  onMessage(cb: (d: Uint8Array) => void): void {
    this.ev.onMessage(cb);
  }
  onDisconnect(cb: (r: string) => void): void {
    this.ev.onDisconnect(cb);
  }
  ping(): number {
    return 0;
  }
  close(): void {
    this.peer?.ev.emitDisconnect('peer closed');
    this.ev.closed = true;
  }
}
