import { el } from '../dom';
import type { UiHost } from './host';
import { fighterSelect } from './fighter-select';
import { difficultySelect } from './difficulty-select';
import { onlineLobby } from './online-lobby';

export function modeSelect(host: UiHost) {
  const s = host.screen(
    [
      {
        label: 'Local versus',
        action: () =>
          host.push(
            fighterSelect(host, [0, 1], (ids) => host.startLocal(ids[0]!, ids[1]!)),
          ),
      },
      {
        label: 'Versus bot',
        action: () =>
          host.push(
            fighterSelect(host, [0, 1], (ids) => host.push(difficultySelect(host, (d) => host.startVsBot(ids[0]!, ids[1]!, d))), ['You', 'Bot']),
          ),
      },
      { label: 'Online', action: () => host.push(onlineLobby(host)) },
      { label: 'Back', action: () => host.pop() },
    ],
    { onBack: () => host.pop() },
  );
  s.content.append(el('div', 't-heading', 'Choose a mode'), s.menu, el('div', 'grow'), s.prompts);
  return s;
}
