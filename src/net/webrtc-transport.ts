/**
 * WebRTC transport: an unreliable, unordered data channel between two browsers.
 * Peers find each other through the signaling server (room codes); after that, game packets
 * go peer to peer. Each input packet already carries the last unacknowledged inputs, so
 * loss is harmless.
 */
import { NET_CONFIG } from './config';
import { TransportEvents, type Transport } from './transport';

type SignalMsg = { type: 'created'; code: string } | { type: 'joined'; code: string } | { type: 'peer-joined' } | { type: 'peer-left' } | { type: 'signal'; data: SignalData } | { type: 'error'; message: string };
type SignalData = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

export interface WebRtcCallbacks {
  onRoomCode?: (code: string) => void;
  onStatus?: (status: string) => void;
}

export class WebRtcTransport implements Transport {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private readonly ev = new TransportEvents();
  private connected = false;

  constructor(
    private readonly signalingUrl: string,
    /** null = create a room (host); a code = join it (guest). */
    readonly joinCode: string | null,
    private readonly cb: WebRtcCallbacks = {},
  ) {}

  get isHost(): boolean {
    return this.joinCode === null;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (why: string): void => {
        if (!settled) {
          settled = true;
          reject(new Error(why));
        } else this.ev.emitDisconnect(why);
      };
      const ws = new WebSocket(this.signalingUrl);
      this.ws = ws;
      ws.onerror = () => fail(`Can't reach the signaling server (${this.signalingUrl})`);
      ws.onclose = () => {
        if (!this.connected) fail('Signaling connection closed');
      };
      ws.onopen = () => {
        this.cb.onStatus?.(this.isHost ? 'Creating room…' : 'Joining room…');
        ws.send(JSON.stringify(this.isHost ? { type: 'create' } : { type: 'join', code: this.joinCode }));
      };
      ws.onmessage = async (ev) => {
        const msg = JSON.parse(String(ev.data)) as SignalMsg;
        try {
          switch (msg.type) {
            case 'created':
              this.cb.onRoomCode?.(msg.code);
              this.cb.onStatus?.('Waiting for opponent…');
              break;
            case 'joined':
              this.cb.onRoomCode?.(msg.code);
              this.cb.onStatus?.('Connecting to host…');
              this.setupPeer(resolve);
              break;
            case 'peer-joined': {
              this.cb.onStatus?.('Opponent found, connecting…');
              const pc = this.setupPeer(resolve);
              const ch = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
              this.attachChannel(ch, resolve);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              this.signal({ sdp: offer });
              break;
            }
            case 'signal':
              await this.onSignal(msg.data);
              break;
            case 'peer-left':
              if (this.connected) this.ev.emitDisconnect('Opponent left');
              else fail('Opponent left');
              break;
            case 'error':
              fail(msg.message);
              break;
          }
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      };
      settled = false;
    });
  }

  private signal(data: SignalData): void {
    this.ws?.send(JSON.stringify({ type: 'signal', data }));
  }

  private setupPeer(resolve: () => void): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: NET_CONFIG.iceServers });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ candidate: e.candidate.toJSON() });
    };
    pc.ondatachannel = (e) => this.attachChannel(e.channel, resolve);
    pc.onconnectionstatechange = () => {
      if (this.connected && (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected')) {
        this.ev.emitDisconnect(`Connection ${pc.connectionState}`);
      }
    };
    return pc;
  }

  private attachChannel(ch: RTCDataChannel, resolve: () => void): void {
    this.channel = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      this.connected = true;
      this.cb.onStatus?.('Connected');
      resolve();
    };
    ch.onmessage = (e) => this.ev.emitMessage(new Uint8Array(e.data as ArrayBuffer));
    ch.onclose = () => this.ev.emitDisconnect('Channel closed');
  }

  private async onSignal(data: SignalData): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if ('sdp' in data) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signal({ sdp: answer });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  }

  send(data: Uint8Array): void {
    if (this.channel?.readyState === 'open') this.channel.send(data as Uint8Array<ArrayBuffer>);
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
    try {
      this.channel?.close();
      this.pc?.close();
      this.ws?.close();
    } catch {
      // already closed
    }
  }
}
