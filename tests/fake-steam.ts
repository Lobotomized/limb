/**
 * Fake Steam layer: a shared "Steam network" with lobbies and P2P messaging, exposing the
 * subset of the steamworks.js client API used by electron/steam-core.cjs. P2P packets are
 * held until the receiver accepts the session (like real Steam).
 */
interface Lobby {
  id: bigint;
  members: bigint[];
}

export class FakeSteamNetwork {
  readonly lobbies = new Map<bigint, Lobby>();
  readonly clients = new Map<bigint, FakeSteamClient>();
  private nextLobby = 109775240000000001n;

  client(steamId: bigint, name: string): FakeSteamClient {
    const c = new FakeSteamClient(this, steamId, name);
    this.clients.set(steamId, c);
    return c;
  }

  newLobbyId(): bigint {
    return this.nextLobby++;
  }
}

class FakeLobbyHandle {
  constructor(
    private readonly net: FakeSteamNetwork,
    private readonly me: bigint,
    readonly id: bigint,
  ) {}
  getMembers() {
    return (this.net.lobbies.get(this.id)?.members ?? []).map((steamId64) => ({ steamId64, steamId32: '', accountId: 0 }));
  }
  leave(): void {
    const l = this.net.lobbies.get(this.id);
    if (l) l.members = l.members.filter((m) => m !== this.me);
  }
  openInviteDialog(): void {
    this.net.clients.get(this.me)!.inviteDialogs++;
  }
}

export class FakeSteamClient {
  richPresence = new Map<string, string>();
  inviteDialogs = 0;
  private callbacks = new Map<string, ((ev: unknown) => void)[]>();
  private accepted = new Set<bigint>();
  private requested = new Set<bigint>();
  private pending: { from: bigint; data: Buffer }[] = [];
  private inbox: { from: bigint; data: Buffer }[] = [];

  constructor(
    private readonly net: FakeSteamNetwork,
    readonly steamId: bigint,
    private readonly name: string,
  ) {}

  localplayer = {
    getSteamId: () => ({ steamId64: this.steamId, steamId32: '', accountId: 0 }),
    getName: () => this.name,
    setRichPresence: (k: string, v?: string | null) => void this.richPresence.set(k, v ?? ''),
  };

  matchmaking = {
    createLobby: async (_type: number, _max: number) => {
      const id = this.net.newLobbyId();
      this.net.lobbies.set(id, { id, members: [this.steamId] });
      return new FakeLobbyHandle(this.net, this.steamId, id);
    },
    joinLobby: async (id: bigint) => {
      const l = this.net.lobbies.get(id);
      if (!l) throw new Error('no such lobby');
      if (!l.members.includes(this.steamId)) l.members.push(this.steamId);
      return new FakeLobbyHandle(this.net, this.steamId, id);
    },
  };

  networking = {
    sendP2PPacket: (to: bigint, _type: number, data: Buffer) => {
      const peer = this.net.clients.get(to);
      if (!peer) return false;
      peer.receive(this.steamId, Buffer.from(data));
      return true;
    },
    isP2PPacketAvailable: () => this.inbox[0]?.data.length ?? 0,
    readP2PPacket: (_size: number) => {
      const p = this.inbox.shift()!;
      return { data: p.data, size: p.data.length, steamId: { steamId64: p.from, steamId32: '', accountId: 0 } };
    },
    acceptP2PSession: (remote: bigint) => {
      this.accepted.add(remote);
      const ready = this.pending.filter((p) => p.from === remote);
      this.pending = this.pending.filter((p) => p.from !== remote);
      this.inbox.push(...ready);
    },
  };

  callback = {
    register: (id: string, handler: (ev: unknown) => void) => {
      this.callbacks.set(id, [...(this.callbacks.get(id) ?? []), handler]);
      return { disconnect() {} };
    },
  };

  private receive(from: bigint, data: Buffer): void {
    if (this.accepted.has(from)) return void this.inbox.push({ from, data });
    this.pending.push({ from, data });
    if (!this.requested.has(from)) {
      this.requested.add(from);
      for (const h of this.callbacks.get('P2PSessionRequest') ?? []) h({ remote: from });
    }
  }

  /** Simulates the user accepting a lobby invite in the Steam overlay. */
  requestJoin(lobbyId: bigint, friend: bigint): void {
    for (const h of this.callbacks.get('GameLobbyJoinRequested') ?? []) h({ lobby_steam_id: lobbyId, friend_steam_id: friend });
  }
}
