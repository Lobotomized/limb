/**
 * Steam service used by the Electron main process. Pure logic over a steamworks.js-like
 * client object, so tests can pass a fake (tests/fake-steam.ts) instead of the real SDK.
 *
 * Responsibilities: lobbies (host / join / invite / leave), P2P packets to the other lobby
 * member (accepting session requests only from lobby members), rich presence, and
 * forwarding "join lobby" requests from the Steam overlay.
 */
'use strict';

const LOBBY_FRIENDS_ONLY = 1;
const SEND_UNRELIABLE_NO_DELAY = 1;
const CB_P2P_SESSION_REQUEST = 'P2PSessionRequest';
const CB_GAME_LOBBY_JOIN_REQUESTED = 'GameLobbyJoinRequested';

function createSteamService(client, config, callbackIds) {
  const ids = callbackIds || {};
  let lobby = null;
  const joinRequestHandlers = [];
  const self = client.localplayer.getSteamId().steamId64;

  const members = () => (lobby ? lobby.getMembers().map((m) => m.steamId64) : []);
  const opponent = () => {
    const other = members().find((m) => m !== self);
    return other === undefined ? null : String(other);
  };

  if (client.callback && client.callback.register) {
    const p2pId = ids[CB_P2P_SESSION_REQUEST] ?? CB_P2P_SESSION_REQUEST;
    const joinId = ids[CB_GAME_LOBBY_JOIN_REQUESTED] ?? CB_GAME_LOBBY_JOIN_REQUESTED;
    client.callback.register(p2pId, (ev) => {
      // Only accept P2P sessions from the other member of our lobby.
      if (members().includes(ev.remote)) client.networking.acceptP2PSession(ev.remote);
    });
    client.callback.register(joinId, (ev) => {
      for (const h of joinRequestHandlers) h(String(ev.lobby_steam_id));
    });
  }

  return {
    available: () => true,
    personaName: () => client.localplayer.getName(),
    async createLobby() {
      if (lobby) lobby.leave();
      lobby = await client.matchmaking.createLobby(LOBBY_FRIENDS_ONLY, config.maxLobbyMembers || 2);
      return String(lobby.id);
    },
    async joinLobby(id) {
      if (lobby) lobby.leave();
      lobby = await client.matchmaking.joinLobby(BigInt(id));
    },
    inviteFriends() {
      if (lobby) lobby.openInviteDialog();
    },
    leaveLobby() {
      if (lobby) lobby.leave();
      lobby = null;
    },
    setRichPresence(text) {
      client.localplayer.setRichPresence('status', text);
      client.localplayer.setRichPresence('steam_display', '#Status');
    },
    opponent,
    sendP2P(to, data) {
      client.networking.sendP2PPacket(BigInt(to), SEND_UNRELIABLE_NO_DELAY, Buffer.from(data));
    },
    /** Drains every waiting P2P packet. */
    readP2P() {
      const out = [];
      let size = client.networking.isP2PPacketAvailable();
      while (size > 0) {
        const p = client.networking.readP2PPacket(size);
        out.push({ from: String(p.steamId.steamId64), data: new Uint8Array(p.data) });
        size = client.networking.isP2PPacketAvailable();
      }
      return out;
    },
    onLobbyJoinRequested(cb) {
      joinRequestHandlers.push(cb);
    },
  };
}

/** Initializes the real Steam client if enabled and possible; returns null otherwise. */
function initSteam(config, log) {
  if (!config || !config.enabled) return null;
  try {
    // Loaded lazily: the native module is only needed when Steam is used.
    const steamworks = require('steamworks.js');
    const client = steamworks.init(config.appId);
    const cb = client.callback && client.callback.SteamCallback;
    const ids = cb ? { [CB_P2P_SESSION_REQUEST]: cb.P2PSessionRequest, [CB_GAME_LOBBY_JOIN_REQUESTED]: cb.GameLobbyJoinRequested } : {};
    try {
      steamworks.electronEnableSteamOverlay();
    } catch (e) {
      log(`Steam overlay unavailable: ${e && e.message}`);
    }
    return createSteamService(client, config, ids);
  } catch (e) {
    log(`Steam not available: ${e && e.message}`);
    return null;
  }
}

module.exports = { createSteamService, initSteam };
