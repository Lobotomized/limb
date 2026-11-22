/**
 * Online play controller (lobby state + online match driver). Phase 9 placeholder:
 * replaced by the full implementation in Phase 10.
 */
import type { OnlineLobbyState } from '../ui/menus/host';
import type { Game } from './game';

export class OnlineController {
  private state: OnlineLobbyState = { status: 'Not connected', roomCode: null, connected: false, error: null };
  constructor(private readonly game: Game) {}
  lobby(): OnlineLobbyState {
    return this.state;
  }
  connected(): boolean {
    return this.state.connected;
  }
  frame(): void {}
  createRoom(): void {
    this.state = { ...this.state, error: 'Online play is not built yet' };
  }
  joinRoom(_code: string): void {
    this.createRoom();
  }
  steamHost(): void {}
  steamInvite(): void {}
  leave(): void {
    this.state = { status: 'Not connected', roomCode: null, connected: false, error: null };
  }
  ready(_fighter: string): void {}
  rematch(): void {
    this.game.toMainMenu();
  }
}
