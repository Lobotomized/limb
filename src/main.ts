/** Entry point: loads fonts and physics, then starts the game shell. */
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import { startGame } from './app/game';
import { COLOR, SPACE } from './render/theme';

startGame(document.getElementById('app') as HTMLElement).catch((err: unknown) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.textContent = `Limb Clash failed to start:\n${String(err instanceof Error ? err.stack ?? err.message : err)}`;
  pre.style.cssText = `color:${COLOR.ink};padding:${SPACE[6]}px;white-space:pre-wrap`;
  document.body.appendChild(pre);
});
