/**
 * One interface for every way two peers can exchange packets. Packets are small byte
 * arrays; delivery is unreliable and unordered (the protocol tolerates loss and reordering).
 */
export interface Transport {
  /** Resolves when the peer link is up. */
  connect(): Promise<void>;
  send(data: Uint8Array): void;
  onMessage(cb: (data: Uint8Array) => void): void;
  onDisconnect(cb: (reason: string) => void): void;
  /** Last measured round-trip time in ms (0 if unknown). */
  ping(): number;
  close(): void;
}

/** Shared helper for transports: listener lists. */
export class TransportEvents {
  private readonly msg: ((d: Uint8Array) => void)[] = [];
  private readonly disc: ((r: string) => void)[] = [];
  closed = false;

  onMessage(cb: (d: Uint8Array) => void): void {
    this.msg.push(cb);
  }
  onDisconnect(cb: (r: string) => void): void {
    this.disc.push(cb);
  }
  emitMessage(d: Uint8Array): void {
    if (this.closed) return;
    for (const cb of this.msg) cb(d);
  }
  emitDisconnect(r: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.disc) cb(r);
  }
}
