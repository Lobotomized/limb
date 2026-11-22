/**
 * Game shell (Phase 6 version): starts a local two-player match right away.
 * Replaced by the full menu flow in Phase 9.
 */
import { Application } from 'pixi.js';
import { initPhysics } from '../core/physics';
import { createMatch } from '../core/simulation';
import { FixedTickLoop } from '../core/loop';
import { InputDevices } from '../input/devices';
import { ArenaView } from '../render/renderer';
import { interpolate } from '../render/frame';
import { COLOR, hex, uiScale } from '../render/theme';
import { getFighter } from '../registry/fighters';
import { getArena } from '../registry/arenas';
import { LocalDriver } from './drivers';

export async function startGame(host: HTMLElement): Promise<void> {
  document.body.style.background = COLOR.bg900;
  await initPhysics();
  const app = new Application();
  await app.init({ resizeTo: window, background: hex(COLOR.bg900), antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  host.appendChild(app.canvas);
  const devices = new InputDevices();
  devices.attach(window);
  const view = new ArenaView(app, { reducedShake: false, damageNumbers: false });
  app.stage.addChild(view.root);
  const sim = createMatch({ fighters: [getFighter('humanoid').def, getFighter('humanoid').def], arena: getArena(), seed: 1 });
  const driver = new LocalDriver(sim, [() => devices.readLocal(0, 'auto'), () => devices.readLocal(1, 'auto')]);
  view.setMatch(sim.ctx);
  const loop = new FixedTickLoop(60);
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    devices.poll();
    const n = loop.advance(dt);
    for (let i = 0; i < n; i++) view.onEvents(driver.tick());
    devices.keyboard.takePressed();
    devices.endFrame();
    view.render(interpolate(driver.prevFrame, driver.currFrame, loop.alpha), dt, uiScale(app.screen.height));
  });
}
