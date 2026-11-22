import type { DifficultyId } from '../../bots/difficulty';
import { el } from '../dom';
import type { UiHost } from './host';

const LABELS: [DifficultyId, string, string][] = [
  ['easy', 'Easy', 'Slow reactions, sloppy aim.'],
  ['medium', 'Medium', 'Decent reactions, guards sometimes.'],
  ['hard', 'Hard', 'Fast, and trades healthy parts into weak ones.'],
];

export function difficultySelect(host: UiHost, done: (d: DifficultyId) => void) {
  const hint = el('div', 't-body ink-muted');
  const s = host.screen(
    LABELS.map(([id, label]) => ({ label, action: () => done(id) })),
    {
      onBack: () => host.pop(),
      onFrame: () => (hint.textContent = LABELS[s.focus]?.[2] ?? ''),
    },
  );
  s.focus = 1;
  s.refresh();
  s.content.append(el('div', 't-heading', 'Bot difficulty'), s.menu, hint, el('div', 'grow'), s.prompts);
  return s;
}
