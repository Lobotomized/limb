/** Pause overlay: resume, settings, quit (with a destructive confirm). Shows detailed bars. */
import type { SimState } from '../../core/state';
import { PLAYER } from '../../render/theme';
import { el } from '../dom';
import { HealthBars } from '../hud/health-bars';
import { matchMaxPartHealth } from '../hud/hud';
import type { UiHost } from './host';
import { settingsScreen } from './settings-screen';

export function confirmScreen(host: UiHost, question: string, yes: string, onYes: () => void) {
  const s = host.screen(
    [
      { label: 'Cancel', action: () => host.pop() },
      { label: yes, destructive: true, action: onYes },
    ],
    { onBack: () => host.pop(), overlay: true },
  );
  s.content.append(el('div', 'grow'), el('div', 't-heading', question), s.menu, el('div', 'grow'), s.prompts);
  return s;
}

export function pauseScreen(host: UiHost, sim: () => SimState, online: boolean) {
  const bars = [0, 1].map((i) => new HealthBars(sim().ctx.compiled[i]!, matchMaxPartHealth(sim().ctx)));
  const s = host.screen(
    [
      { label: 'Resume', action: () => host.resume() },
      { label: 'Settings', action: () => host.push(settingsScreen(host)) },
      { label: online ? 'Leave match' : 'Quit match', destructive: true, action: () => host.push(confirmScreen(host, online ? 'Leave the online match?' : 'Quit the match?', 'Quit', () => host.quitMatch())) },
    ],
    {
      overlay: true,
      onBack: () => host.resume(),
      onFrame: () => bars.forEach((b, i) => b.update(sim().game.fighters[i]!)),
    },
  );
  const col = (i: number): HTMLElement => {
    const pl = PLAYER[i]!;
    const c = el('div', 'panel col grow', el('div', `t-hud-value c-p${i + 1}`, `${pl.marker} ${pl.tag} · ${sim().ctx.defs[i]!.name}`), bars[i]!.el);
    return c;
  };
  s.content.append(el('div', 't-heading', online ? 'Paused (match keeps running)' : 'Paused'), el('div', 'row', s.menu, col(0), col(1)), el('div', 'grow'), s.prompts);
  return s;
}
