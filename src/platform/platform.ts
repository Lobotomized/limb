/**
 * Platform abstraction: the game never checks whether it runs in a browser or Electron.
 * `detectPlatform()` returns the right implementation.
 */
export interface SteamLobbyApi {
  available(): boolean;
  personaName(): string;
  createLobby(): Promise<string>;
  joinLobby(id: string): Promise<void>;
  inviteFriends(): void;
  leaveLobby(): void;
  setRichPresence(text: string): void;
  /** Lobby member that is not us (the opponent), or null. */
  opponent(): string | null;
  sendP2P(to: string, data: Uint8Array): void;
  readP2P(): { from: string; data: Uint8Array }[];
  onLobbyJoinRequested(cb: (lobbyId: string) => void): void;
}

export interface Platform {
  kind: 'web' | 'electron';
  loadSettings(): Promise<unknown>;
  saveSettings(data: unknown): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): boolean;
  /** Writes a desync report somewhere a human can find it; returns where. */
  writeReport(name: string, text: string): Promise<string>;
  steam: SteamLobbyApi | null;
  quit(): void;
}
