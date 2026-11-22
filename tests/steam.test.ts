// Steam integration against a fake Steam layer: lobbies, invites, join requests, P2P with
// session acceptance, rich presence, and full rollback matches over the Steam transport.
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSteamNetwork } from './fake-steam';
import { setup } from './helpers';
import { SteamTransport, type SteamP2PApi } from '../src/net/steam-transport';
import { PeerLink } from '../src/net/peer-link';
import { RollbackSession } from '../src/net/rollback';
import { createMatch, step } from '../src/core/simulation';
import { hashState } from '../src/core/state';
import { EMPTY_INPUT, type InputFrame } from '../src/core/input-frame';
import { getFighter } from '../src/registry/fighters';
import { getArena } from '../src/registry/arenas';
import { RandomInputs } from '../src/bots/random-input';

const require = createRequire(import.meta.url);
const { createSteamService } = require('../electron/steam-core.cjs') as {
  createSteamService: (client: unknown, config: { maxLobbyMembers: number }) => SteamP2PApi & {
    createLobby(): Promise<string>;
    joinLobby(id: string): Promise<void>;
    inviteFriends(): void;
    leaveLobby(): void;
    setRichPresence(t: string): void;
    onLobbyJoinRequested(cb: (id: string) => void): void;
    personaName(): string;
  };
};

beforeAll(setup);

async function twoPlayers() {
  const net = new FakeSteamNetwork();
  const hostClient = net.client(76561198000000001n, 'Host');
  const guestClient = net.client(76561198000000002n, 'Guest');
  const host = createSteamService(hostClient, { maxLobbyMembers: 2 });
  const guest = createSteamService(guestClient, { maxLobbyMembers: 2 });
  return { net, hostClient, guestClient, host, guest };
}

describe('steam (fake layer)', () => {
  it('hosts a lobby, invites, joins via the overlay request, and exchanges P2P packets', async () => {
    const { hostClient, guestClient, host, guest } = await twoPlayers();
    expect(host.personaName()).toBe('Host');
    const lobbyId = await host.createLobby();
    host.inviteFriends();
    expect(hostClient.inviteDialogs).toBe(1);
    expect(host.opponent()).toBeNull();
    let requested: string | null = null;
    guest.onLobbyJoinRequested((id) => (requested = id));
    guestClient.requestJoin(BigInt(lobbyId), hostClient.steamId);
    expect(requested).toBe(lobbyId);
    await guest.joinLobby(requested!);
    expect(host.opponent()).toBe(String(guestClient.steamId));
    expect(guest.opponent()).toBe(String(hostClient.steamId));
    // First packet triggers a session request; the service accepts lobby members.
    guest.sendP2P(guest.opponent()!, new Uint8Array([1, 2, 3]));
    const got = host.readP2P();
    expect(got).toEqual([{ from: String(guestClient.steamId), data: new Uint8Array([1, 2, 3]) }]);
    host.setRichPresence('In match: Humanoid vs Crab');
    expect(hostClient.richPresence.get('status')).toBe('In match: Humanoid vs Crab');
    guest.leaveLobby();
    expect(host.opponent()).toBeNull();
  });

  it('runs a rollback match over the Steam transport identical to the offline run', async () => {
    const { host, guest } = await twoPlayers();
    const id = await host.createLobby();
    await guest.joinLobby(id);
    // Manual scheduler: the test pumps the transports itself.
    const pumps: (() => void)[] = [];
    const sched = (fn: () => void) => {
      pumps.push(fn);
      return 0 as unknown as ReturnType<typeof setInterval>;
    };
    const ta = new SteamTransport(host, true, sched);
    const tb = new SteamTransport(guest, false, sched);
    const ca = ta.connect();
    const cb = tb.connect();
    pumps.forEach((p) => p());
    await Promise.all([ca, cb]);
    let now = 0;
    const clock = { now: () => now };
    const match = { fighters: [getFighter('crab').def, getFighter('octopus').def] as [ReturnType<typeof getFighter>['def'], ReturnType<typeof getFighter>['def']], arena: getArena(), seed: 77 };
    const sessions = [new RollbackSession(createMatch(match), new PeerLink(ta, clock), { localPlayer: 0, inputDelay: 2 }), new RollbackSession(createMatch(match), new PeerLink(tb, clock), { localPlayer: 1, inputDelay: 2 })];
    const gens = [new RandomInputs(1), new RandomInputs(2)];
    const applied: Map<number, InputFrame>[] = [new Map(), new Map()];
    const target = 600;
    for (let frame = 0; frame < 2000 && !(sessions[0]!.confirmedHash(target) && sessions[1]!.confirmedHash(target)); frame++) {
      now += 1000 / 60;
      sessions.forEach((s, p) => {
        pumps.forEach((f) => f());
        s.poll();
        if (s.shouldStall()) return s.sendInputs();
        const input = gens[p]!.next();
        const t = s.tick + s.inputDelay;
        if (!applied[p]!.has(t)) applied[p]!.set(t, input);
        s.addLocalInput(input);
        s.advance();
      });
    }
    const offline = createMatch(match);
    for (let t = 0; t < target; t++) step(offline, [applied[0]!.get(t) ?? EMPTY_INPUT, applied[1]!.get(t) ?? EMPTY_INPUT]);
    expect(sessions[0]!.confirmedHash(target)).toBe(hashState(offline));
    expect(sessions[1]!.confirmedHash(target)).toBe(hashState(offline));
    ta.close();
    tb.close();
  });
});
