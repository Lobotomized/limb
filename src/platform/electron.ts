/**
 * Electron platform: talks to the main process through the preload bridge (window.limbClash).
 * Settings live in a JSON file in the user data folder; Steam is available when the main
 * process managed to initialize it.
 */
import type { Platform, SteamLobbyApi } from './platform';

/** Shape of the bridge exposed by electron/preload.cjs. */
export interface ElectronBridge {
  loadSettings(): Promise<unknown>;
  saveSettings(data: unknown): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): boolean;
  writeReport(name: string, text: string): Promise<string>;
  quit(): void;
  steam: {
    available(): boolean;
    personaName(): string;
    createLobby(): Promise<string>;
    joinLobby(id: string): Promise<void>;
    inviteFriends(): void;
    leaveLobby(): void;
    setRichPresence(text: string): void;
    opponent(): string | null;
    sendP2P(to: string, data: Uint8Array): void;
    readP2P(): { from: string; data: Uint8Array }[];
    onLobbyJoinRequested(cb: (lobbyId: string) => void): void;
  };
}

export function electronBridge(): ElectronBridge | null {
  return (globalThis as { limbClash?: ElectronBridge }).limbClash ?? null;
}

export function electronPlatform(bridge: ElectronBridge): Platform {
  const steam: SteamLobbyApi | null = bridge.steam.available() ? bridge.steam : null;
  return {
    kind: 'electron',
    loadSettings: async () => {
      try {
        return await bridge.loadSettings();
      } catch {
        return null;
      }
    },
    saveSettings: async (d) => {
      try {
        await bridge.saveSettings(d);
      } catch {
        // Disk errors must not crash the game.
      }
    },
    setFullscreen: (on) => bridge.setFullscreen(on),
    isFullscreen: () => bridge.isFullscreen(),
    writeReport: (name, text) => bridge.writeReport(name, text),
    steam,
    quit: () => bridge.quit(),
  };
}
