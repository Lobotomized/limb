import { el } from '../dom';
import type { UiHost } from './host';
import { modeSelect } from './mode-select';
import { settingsScreen } from './settings-screen';

export function mainMenu(host: UiHost) {
  const items = [
    { label: 'Play', action: () => host.push(modeSelect(host)) },
    { label: 'Settings', action: () => host.push(settingsScreen(host)) },
  ];
  if (host.isDev) items.push({ label: 'Sandbox', action: () => host.openSandbox() });
  if (host.canQuitApp) items.push({ label: 'Quit', action: () => host.quitApp() });
  const s = host.screen(items, {});
  s.content.append(
    el('div', 'grow'),
    el('div', 't-title', 'LIMB CLASH'),
    el('div', 't-body ink-muted', 'Every limb has its own health. Hits hurt both sides equally.'),
    s.menu,
    el('div', 'grow'),
    s.prompts,
  );
  return s;
}
