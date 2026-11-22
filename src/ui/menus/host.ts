/** What the menus need from the app. Implemented by app/game.ts. */
import type { DifficultyId } from '../../bots/difficulty';
import type { FighterEntry } from '../../registry/fighters';
import type { Settings } from '../settings';
import type { MenuItem, MenuScreen, ScreenOptions, UiSounds } from './menu';

export interface OnlineLobbyState {
  status: string;
  roomCode: string | null;
  connected: boolean;
  error: string | null;
}

export interface UiHost {
  readonly sounds: UiSounds;
  readonly fighters: FighterEntry[];
  readonly isDev: boolean;
  readonly canQuitApp: boolean;
  readonly steamAvailable: boolean;
  settings(): Settings;
  updateSettings(patch: Partial<Settings>): void;
  glyphs(): 'keyboard' | 'gamepad';
  screen(items: MenuItem[], options: ScreenOptions): MenuScreen;
  push(s: MenuScreen): void;
  pop(): void;
  replace(s: MenuScreen): void;
  startLocal(p1: string, p2: string): void;
  startVsBot(p1: string, bot: string, difficulty: DifficultyId): void;
  openSandbox(): void;
  quitApp(): void;
  // ---- online
  online: {
    lobby(): OnlineLobbyState;
    createRoom(): void;
    joinRoom(code: string): void;
    steamHost(): void;
    steamInvite(): void;
    leave(): void;
    /** Starts the match once connected, with the local player's fighter. */
    ready(fighter: string): void;
  };
  // ---- in match
  resume(): void;
  quitMatch(): void;
  rematch(): void;
  toMainMenu(): void;
}
