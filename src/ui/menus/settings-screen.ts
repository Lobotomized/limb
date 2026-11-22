/** Settings screen: accessibility, audio, online input delay, display, controls. */
import { DEVICE_LABELS, type DeviceId } from '../../input/bindings';
import { el } from '../dom';
import type { Settings } from '../settings';
import type { UiHost } from './host';
import type { MenuItem } from './menu';

const DEVICES = Object.keys(DEVICE_LABELS) as DeviceId[];

export function settingsScreen(host: UiHost) {
  const toggle = (label: string, key: 'reducedShake' | 'damageNumbers' | 'detailedHud' | 'partHealthNumbers' | 'fullscreen'): MenuItem => ({
    label,
    value: () => (host.settings()[key] ? 'On' : 'Off'),
    adjust: () => host.updateSettings({ [key]: !host.settings()[key] } as Partial<Settings>),
  });
  const percent = (label: string, key: 'uiScale' | 'masterVolume' | 'effectsVolume', lo: number, hi: number): MenuItem => ({
    label,
    value: () => `${Math.round(host.settings()[key] * 100)}%`,
    adjust: (d) => host.updateSettings({ [key]: Math.min(hi, Math.max(lo, Math.round((host.settings()[key] + d * 0.1) * 10) / 10)) } as Partial<Settings>),
  });
  const device = (label: string, key: 'p1Device' | 'p2Device'): MenuItem => ({
    label,
    value: () => DEVICE_LABELS[host.settings()[key]],
    adjust: (d) => {
      const i = DEVICES.indexOf(host.settings()[key]);
      host.updateSettings({ [key]: DEVICES[(i + d + DEVICES.length) % DEVICES.length] } as Partial<Settings>);
    },
  });
  const s = host.screen(
    [
      toggle('Reduced shake', 'reducedShake'),
      toggle('Damage numbers', 'damageNumbers'),
      toggle('Detailed HUD', 'detailedHud'),
      toggle('Health on parts', 'partHealthNumbers'),
      percent('UI scale', 'uiScale', 0.8, 1.5),
      percent('Master volume', 'masterVolume', 0, 1),
      percent('Effects volume', 'effectsVolume', 0, 1),
      {
        label: 'Online input delay',
        value: () => (host.settings().inputDelay < 0 ? 'Auto' : `${host.settings().inputDelay} frames`),
        adjust: (d) => host.updateSettings({ inputDelay: Math.min(4, Math.max(-1, host.settings().inputDelay + d)) }),
      },
      toggle('Fullscreen', 'fullscreen'),
      device('P1 controls', 'p1Device'),
      device('P2 controls', 'p2Device'),
      { label: 'Back', action: () => host.pop() },
    ],
    { onBack: () => host.pop() },
  );
  s.menu.classList.add('wide');
  s.content.append(el('div', 't-heading', 'Settings'), s.menu, el('div', 'grow'), s.prompts);
  return s;
}
