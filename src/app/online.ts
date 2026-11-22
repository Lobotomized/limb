/**
 * Online play controller: lobby (WebRTC room codes or Steam lobbies), match setup handshake
 * over reliable control messages, the online match driver, desync reports and disconnects.
 *
 * Handshake: the host is P1. Both peers send {type:'ready', fighter}. When the host has both,
 * it sends {type:'start', seed, fighters, delay} and both start a rollback session at tick 0.
 */
import { createMatch } from '../core/simulation';
import { defaultSignalingUrl, NET_CONFIG } from '../net/config';
import { autoInputDelay, PeerLink } from '../net/peer-link';
import { RollbackSession, type DesyncReport } from '../net/rollback';
import type { Transport } from '../net/transport';
import { WebRtcTransport } from '../net/webrtc-transport';
import { SteamTransport } from '../net/steam-transport';
import { getArena } from '../registry/arenas';
import { getFighter } from '../registry/fighters';
import type { OnlineLobbyState } from '../ui/menus/host';
import type { Game } from './game';
import { OnlineDriver } from './online-driver';

type Control = { type: 'ready'; fighter: string } | { type: 'start'; seed: number; fighters: [string, string]; delay: number } | { type: 'bye' };

const perfClock = { now: () => performance.now() };

export class OnlineController {
  private state: OnlineLobbyState = { status: 'Not connected', roomCode: null, connected: false, error: null };
  private transport: Transport | null = null;
  private link: PeerLink | null = null;
  private isHost = false;
  private localFighter: string | null = null;
  private remoteFighter: string | null = null;
  private session: RollbackSession | null = null;
  private matchCounter = 0;

  constructor(private readonly game: Game) {
    game.platform.steam?.onLobbyJoinRequested((lobbyId) => this.steamJoin(lobbyId));
  }

  lobby(): OnlineLobbyState {
    return this.state;
  }

  connected(): boolean {
    return this.state.connected;
  }

  private set(patch: Partial<OnlineLobbyState>): void {
    this.state = { ...this.state, ...patch };
  }

  private signalingUrl(): string {
    const fromQuery = new URLSearchParams(location.search).get('signal');
    return fromQuery || this.game.settings().signalingUrl || defaultSignalingUrl(location.hostname, location.protocol === 'https:');
  }

  // ------------------------------------------------------------------ lobby actions

  createRoom(): void {
    this.open(new WebRtcTransport(this.signalingUrl(), null, this.callbacks()), true);
  }

  joinRoom(code: string): void {
    if (code.length !== NET_CONFIG.roomCodeLength) return this.set({ error: 'Enter a 4-letter code' });
    this.open(new WebRtcTransport(this.signalingUrl(), code.toUpperCase(), this.callbacks()), false);
  }

  steamHost(): void {
    const steam = this.game.platform.steam;
    if (!steam) return;
    this.set({ status: 'Creating Steam lobby…', error: null });
    steam
      .createLobby()
      .then((id) => {
        this.set({ roomCode: `Steam lobby ${id.slice(-4)}`, status: 'Invite a friend from the Steam overlay' });
        this.open(new SteamTransport(steam, true), true);
      })
      .catch((e: unknown) => this.set({ error: String(e) }));
  }

  steamInvite(): void {
    this.game.platform.steam?.inviteFriends();
  }

  private steamJoin(lobbyId: string): void {
    const steam = this.game.platform.steam;
    if (!steam) return;
    this.set({ status: 'Joining Steam lobby…', error: null });
    steam
      .joinLobby(lobbyId)
      .then(() => this.open(new SteamTransport(steam, false), false))
      .catch((e: unknown) => this.set({ error: String(e) }));
  }

  private callbacks() {
    return {
      onRoomCode: (code: string) => this.set({ roomCode: code }),
      onStatus: (status: string) => this.set({ status }),
    };
  }

  private open(t: Transport, host: boolean): void {
    this.leave();
    this.transport = t;
    this.isHost = host;
    this.set({ error: null, status: 'Connecting…' });
    t.connect()
      .then(() => {
        if (this.transport !== t) return;
        this.link = new PeerLink(t, perfClock);
        this.link.onControl((d) => this.onControl(d as Control));
        t.onDisconnect((r) => this.onDisconnect(r));
        this.set({ connected: true, status: `Connected as ${host ? 'host (P1)' : 'guest (P2)'} — pick a fighter` });
      })
      .catch((e: unknown) => {
        if (this.transport === t) this.set({ error: e instanceof Error ? e.message : String(e), status: 'Not connected', roomCode: null });
      });
  }

  leave(): void {
    if (this.link) this.link.sendControl({ type: 'bye' });
    this.transport?.close();
    this.game.platform.steam?.leaveLobby();
    this.transport = null;
    this.link = null;
    this.session = null;
    this.localFighter = null;
    this.remoteFighter = null;
    this.state = { status: 'Not connected', roomCode: null, connected: false, error: null };
  }

  // ------------------------------------------------------------------ handshake

  ready(fighter: string): void {
    this.localFighter = fighter;
    this.link?.sendControl({ type: 'ready', fighter });
    this.set({ status: 'Waiting for the opponent to pick…' });
    this.maybeStart();
  }

  rematch(): void {
    if (!this.link || !this.localFighter) return this.game.toMainMenu();
    this.remoteFighter = this.isHost ? null : this.remoteFighter;
    this.ready(this.localFighter);
  }

  private onControl(c: Control): void {
    if (c.type === 'ready') {
      this.remoteFighter = c.fighter;
      this.maybeStart();
    } else if (c.type === 'start') {
      this.startMatch(c.seed, c.fighters, c.delay);
    } else if (c.type === 'bye') {
      this.onDisconnect('Opponent left');
    }
  }

  private maybeStart(): void {
    if (!this.isHost || !this.link || !this.localFighter || !this.remoteFighter) return;
    const setting = this.game.settings().inputDelay;
    const delay = setting >= 0 ? setting : autoInputDelay(this.link.rttMs);
    const seed = (Date.now() ^ (++this.matchCounter * 2654435761)) >>> 0;
    const fighters: [string, string] = [this.localFighter, this.remoteFighter];
    this.remoteFighter = null;
    this.link.sendControl({ type: 'start', seed, fighters, delay });
    this.startMatch(seed, fighters, delay);
  }

  private startMatch(seed: number, fighters: [string, string], delay: number): void {
    const link = this.link;
    if (!link) return;
    const localPlayer = this.isHost ? 0 : 1;
    const labels: [string, string] = localPlayer === 0 ? ['You', 'Opponent'] : ['Opponent', 'You'];
    this.game.beginMatch({ kind: 'online', fighters, labels, seed }, () => {
      const sim = createMatch({ fighters: [getFighter(fighters[0]).def, getFighter(fighters[1]).def], arena: getArena(), seed });
      const session = new RollbackSession(sim, link, { localPlayer, inputDelay: delay });
      session.onDesync = (r) => this.onDesync(r);
      this.session = session;
      return new OnlineDriver(session, () => this.game.devices.readSolo(this.game.settings().p1Device), () => (link.disconnected ? 'disconnected' : ''));
    });
  }

  private onDesync(r: DesyncReport): void {
    const text = [
      `Limb Clash desync report`,
      `tick ${r.tick}: local hash ${r.localHash}, remote hash ${r.remoteHash}`,
      `last matching hash at tick ${r.lastMatchingTick}`,
      `inputs since then (tick: p0 | p1):`,
      ...r.inputs.map((i) => `${i.tick}: ${JSON.stringify(i.p0)} | ${JSON.stringify(i.p1)}`),
    ].join('\n');
    console.error(`Desync at tick ${r.tick}: local ${r.localHash} remote ${r.remoteHash}`);
    void this.game.platform.writeReport(`limb-clash-desync-${r.tick}.txt`, text);
    const alert = this.game.match?.hud.netAlert;
    if (alert) {
      alert.textContent = 'Desync detected';
      alert.style.display = '';
    }
  }

  private onDisconnect(reason: string): void {
    if (!this.state.connected) return;
    this.set({ connected: false, status: reason, roomCode: null });
    const alert = this.game.match?.hud.netAlert;
    if (alert) {
      alert.textContent = `${reason} — press Start / Esc for the menu`;
      alert.style.display = '';
    }
  }

  /** Called every frame: keeps the link alive in the lobby and detects timeouts. */
  frame(): void {
    const link = this.link;
    if (!link) return;
    if (!this.session) link.update();
    if (link.disconnected) this.onDisconnect(link.disconnected);
    else if (this.state.connected && performance.now() - link.lastReceiveMs > NET_CONFIG.timeoutSeconds * 1000) this.onDisconnect('Connection lost');
  }
}
