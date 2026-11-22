/**
 * Steam transport: packets travel as Steam P2P messages (relayed by Steam's network) between
 * the two members of a Steam lobby. The Steam API itself lives in the Electron main process
 * (see electron/steam.cjs); this class only needs the small surface below, which the platform
 * layer provides — and which tests replace with a fake.
 */
import { TransportEvents, type Transport } from './transport';

export interface SteamP2PApi {
  /** SteamID of the other lobby member, or null while alone. */
  opponent(): string | null;
  sendP2P(to: string, data: Uint8Array): void;
  /** Drains received packets. */
  readP2P(): { from: string; data: Uint8Array }[];
}

const POLL_MS = 4;
const CONNECT_TIMEOUT_MS = 120_000;

export class SteamTransport implements Transport {
  private readonly ev = new TransportEvents();
  private timer: ReturnType<typeof setInterval> | null = null;
  private peer: string | null = null;

  constructor(
    private readonly steam: SteamP2PApi,
    readonly isHost: boolean,
    /** Injected scheduler (tests drive polling manually). */
    private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setInterval> = (fn, ms) => setInterval(fn, ms),
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      let resolved = false;
      this.timer = this.schedule(() => {
        if (!this.peer) {
          this.peer = this.steam.opponent();
          if (this.peer) this.steam.sendP2P(this.peer, new Uint8Array([0])); // opens the P2P session
          else if (Date.now() - started > CONNECT_TIMEOUT_MS) {
            this.close();
            reject(new Error('No opponent joined the Steam lobby'));
            return;
          }
        }
        this.pump();
        if (this.peer && !resolved) {
          resolved = true;
          resolve();
        }
        if (resolved && this.peer && this.steam.opponent() === null) this.ev.emitDisconnect('Opponent left the lobby');
      }, POLL_MS);
    });
  }

  /** Delivers queued Steam packets (also called by the poll timer). */
  pump(): void {
    for (const m of this.steam.readP2P()) {
      if (this.peer && m.from !== this.peer) continue;
      if (m.data.length === 1 && m.data[0] === 0) continue; // session-open hello
      this.ev.emitMessage(m.data);
    }
  }

  send(data: Uint8Array): void {
    if (this.peer && !this.ev.closed) this.steam.sendP2P(this.peer, data);
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
    this.ev.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
