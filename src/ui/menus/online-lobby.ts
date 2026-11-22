/**
 * Online lobby. Browser: create a room (get a code) or join with a code; the signaling
 * server only introduces the peers. Steam (desktop build): host a lobby and invite a friend.
 */
import { el } from '../dom';
import { fighterSelect } from './fighter-select';
import type { UiHost } from './host';

const CODE_LEN = 4;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function onlineLobby(host: UiHost) {
  const code = ['A', 'A', 'A', 'A'];
  const status = el('div', 't-body ink-muted');
  const codeView = el('div', 't-title');
  const input = el('input', 'input lc-interactive') as HTMLInputElement;
  input.maxLength = CODE_LEN;
  input.placeholder = 'CODE';
  input.addEventListener('input', () => {
    const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
    input.value = v;
    for (let i = 0; i < CODE_LEN; i++) code[i] = v[i] ?? 'A';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
      host.online.joinRoom(code.join(''));
    } else if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      input.blur(); // hand navigation back to the menu
    } else e.stopPropagation(); // typing letters must not drive the menu
  });
  let picking = false;
  const s = host.screen(
    [
      { label: 'Create room', action: () => host.online.createRoom(), disabled: () => (host.online.lobby().roomCode ? 'Room open' : null) },
      ...[0, 1, 2, 3].map((i) => ({
        label: `Code letter ${i + 1}`,
        value: () => code[i]!,
        adjust: (d: -1 | 1) => {
          const k = ALPHABET.indexOf(code[i]!);
          code[i] = ALPHABET[(k + d + ALPHABET.length) % ALPHABET.length]!;
          input.value = code.join('');
        },
      })),
      { label: 'Join room', action: () => host.online.joinRoom(code.join('')), disabled: () => (host.online.lobby().roomCode ? 'Room open' : null) },
      { label: 'Steam: host lobby', action: () => host.online.steamHost(), disabled: () => (host.steamAvailable ? null : 'Steam not available') },
      { label: 'Steam: invite friend', action: () => host.online.steamInvite(), disabled: () => (host.steamAvailable ? null : 'Steam not available') },
      { label: 'Leave', destructive: true, action: () => host.online.leave(), disabled: () => (host.online.lobby().roomCode || host.online.lobby().connected ? null : 'Not connected') },
      {
        label: 'Back',
        action: () => {
          host.online.leave();
          host.pop();
        },
      },
    ],
    {
      onBack: () => {
        host.online.leave();
        host.pop();
      },
      onFrame: () => {
        const l = host.online.lobby();
        status.textContent = l.error ? `${l.status} — ${l.error}` : l.status;
        codeView.textContent = l.roomCode ? `Room ${l.roomCode}` : '';
        if (l.connected && !picking) {
          picking = true;
          host.push(fighterSelect(host, [0], (ids) => host.online.ready(ids[0]!), ['You']));
        }
        if (!l.connected) picking = false;
      },
    },
  );
  s.content.append(el('div', 't-heading', 'Online'), codeView, el('div', 'row', s.menu, el('div', 'col', el('div', 't-caption ink-muted', 'Type a code'), input, status)), el('div', 'grow'), s.prompts);
  return s;
}
