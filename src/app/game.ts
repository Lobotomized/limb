/**
 * Game shell: Pixi canvas + DOM UI overlay, screens, match lifecycle, settings, audio,
 * platform. Implements the UiHost the menus talk to.
 */
import { Application } from 'pixi.js';
import { initPhysics } from '../core/physics';
import { createMatch } from '../core/simulation';
import { createBot } from '../bots/bot';
import type { DifficultyId } from '../bots/difficulty';
import { InputDevices } from '../input/devices';
import { ArenaView } from '../render/renderer';
import { COLOR, hex, uiScale } from '../render/theme';
import { allFighters, getFighter } from '../registry/fighters';
import { getArena } from '../registry/arenas';
import { Synth } from '../audio/synth';
import { SoundEvents } from '../audio/sound-events';
import { detectPlatform } from '../platform/detect';
import type { Platform } from '../platform/platform';
import { el } from '../ui/dom';
import { injectStyles, setUiScale } from '../ui/styles';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../ui/settings';
import { MenuScreen, ScreenStack, type MenuItem, type ScreenOptions } from '../ui/menus/menu';
import type { UiHost } from '../ui/menus/host';
import { mainMenu } from '../ui/menus/main-menu';
import { pauseScreen } from '../ui/menus/pause-screen';
import { resultsScreen } from '../ui/menus/results-screen';
import { LocalDriver, type MatchDriver } from './drivers';
import { MatchView, type MatchSetup } from './match';
import { OnlineController } from './online';
import { Sandbox } from './sandbox';

/** Delay between the match-over event and the results screen. */
const RESULTS_DELAY_MS = 1500;

export class Game implements UiHost {
  readonly app = new Application();
  readonly devices = new InputDevices();
  readonly synth = new Synth();
  readonly sounds = new SoundEvents(this.synth);
  readonly fighters = allFighters();
  readonly isDev = import.meta.env.DEV;
  readonly platform: Platform;
  readonly canQuitApp: boolean;
  readonly steamAvailable: boolean;
  private s: Settings = { ...DEFAULT_SETTINGS };
  readonly uiRoot = el('div', 'lc-root');
  private readonly hudLayer = el('div', 'lc-layer');
  private readonly screenLayer = el('div', 'lc-layer');
  readonly stack = new ScreenStack(this.screenLayer);
  view!: ArenaView;
  match: MatchView | null = null;
  sandbox: Sandbox | null = null;
  readonly online: OnlineController;
  private resultsShown = false;
  private seedCounter = 1;

  constructor() {
    this.platform = detectPlatform();
    this.canQuitApp = this.platform.kind === 'electron';
    this.steamAvailable = !!this.platform.steam;
    this.online = new OnlineController(this);
  }

  async start(host: HTMLElement): Promise<void> {
    document.body.style.background = COLOR.bg900;
    injectStyles();
    this.s = sanitizeSettings(await this.platform.loadSettings());
    await initPhysics();
    await document.fonts?.ready;
    await this.app.init({ resizeTo: window, background: hex(COLOR.bg900), antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    host.append(this.app.canvas, this.uiRoot);
    this.uiRoot.append(this.hudLayer, this.screenLayer);
    this.view = new ArenaView(this.app, this.effectSettings());
    this.app.stage.addChild(this.view.root);
    this.view.partLabels.enabled = this.s.partHealthNumbers;
    this.devices.attach(window);
    window.addEventListener('pointerdown', () => this.synth.resume());
    window.addEventListener('keydown', () => this.synth.resume());
    this.applySettings();
    this.toMainMenu();
    // Dev-only attract/demo mode: ?demo=humanoid,crab runs a hard bot-vs-bot match.
    const demo = this.isDev ? new URLSearchParams(location.search).get('demo') : null;
    if (demo) {
      const [a, b] = demo.split(',');
      this.startDemo(a ?? 'humanoid', b ?? 'crab');
    }
    let last = performance.now();
    this.app.ticker.add(() => {
      const now = performance.now();
      const dt = Math.min(250, now - last);
      last = now;
      this.frame(dt);
    });
  }

  private effectSettings() {
    return { reducedShake: this.s.reducedShake, damageNumbers: this.s.damageNumbers };
  }

  private applySettings(): void {
    setUiScale(this.uiRoot, uiScale(window.innerHeight, this.s.uiScale));
    this.synth.setVolumes({ master: this.s.masterVolume, effects: this.s.effectsVolume });
    this.view?.effects.setSettings(this.effectSettings());
    if (this.view) this.view.partLabels.enabled = this.s.partHealthNumbers;
    this.match?.hud.setDetailed(this.s.detailedHud);
    if (this.s.fullscreen !== this.platform.isFullscreen()) void this.platform.setFullscreen(this.s.fullscreen);
  }

  // ------------------------------------------------------------------ frame

  private frame(dt: number): void {
    this.devices.poll();
    const keys = this.devices.keyboard.takePressed();
    if (keys.length || this.devices.padCount()) this.synth.resume();
    const actions = this.devices.menuActions(keys);
    setUiScale(this.uiRoot, uiScale(window.innerHeight, this.s.uiScale));
    this.online.frame();

    if (this.sandbox) {
      this.sandbox.frame(dt, keys);
    } else if (this.match) {
      if (this.stack.size > 0) this.stack.handle(actions);
      else if (actions.includes('start') || keys.includes('Escape')) this.pause();
      // Menu input may have ended the match (quit) — re-check before using it.
      const m = this.match as MatchView | null;
      if (m) {
        m.frame(dt, uiScale(window.innerHeight, this.s.uiScale), this.app.stage);
        if (!this.resultsShown && m.sinceMatchOver() > RESULTS_DELAY_MS) {
          this.resultsShown = true;
          this.stack.clear();
          this.stack.push(resultsScreen(this, m.sim, m.setup.kind !== 'online' || this.online.connected()));
        }
      }
    } else {
      this.stack.handle(actions);
    }
    this.stack.frame(dt);
    this.devices.endFrame();
  }

  // ------------------------------------------------------------------ UiHost

  settings(): Settings {
    return this.s;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.s = { ...this.s, ...patch };
    this.applySettings();
    void this.platform.saveSettings(this.s);
  }

  glyphs(): 'keyboard' | 'gamepad' {
    return this.devices.lastDevice;
  }

  screen(items: MenuItem[], options: ScreenOptions): MenuScreen {
    return new MenuScreen(items, options, this.sounds, () => this.glyphs());
  }

  push(s: MenuScreen): void {
    this.stack.push(s);
  }
  pop(): void {
    this.stack.pop();
  }
  replace(s: MenuScreen): void {
    this.stack.replace(s);
  }

  /** Starts a match from a setup. Used by local, bot, rematch and online. */
  beginMatch(setup: MatchSetup, driverFactory?: (setup: MatchSetup) => MatchDriver): void {
    this.endMatch();
    const driver = driverFactory ? driverFactory(setup) : this.localDriver(setup);
    this.match = new MatchView(setup, driver, this.view, this.sounds, this.hudLayer, this.s.detailedHud);
    this.resultsShown = false;
    this.stack.clear();
    this.app.stage.visible = true;
    const names = setup.fighters.map((id) => getFighter(id).def.name);
    this.platform.steam?.setRichPresence(`In match: ${names[0]} vs ${names[1]}`);
  }

  private localDriver(setup: MatchSetup): LocalDriver {
    const sim = createMatch({ fighters: [getFighter(setup.fighters[0]).def, getFighter(setup.fighters[1]).def], arena: getArena(), seed: setup.seed });
    if (setup.kind === 'bot') {
      const bot = createBot(sim, 1, setup.difficulty ?? 'medium', setup.seed);
      return new LocalDriver(sim, [() => this.devices.readSolo(this.s.p1Device), (st) => bot.input(st)]);
    }
    return new LocalDriver(sim, [() => this.devices.readLocal(0, this.s.p1Device), () => this.devices.readLocal(1, this.s.p2Device)]);
  }

  startLocal(p1: string, p2: string): void {
    this.beginMatch({ kind: 'local', fighters: [p1, p2], labels: ['', ''], seed: this.seedCounter++ });
  }

  startVsBot(p1: string, bot: string, difficulty: DifficultyId): void {
    this.beginMatch({ kind: 'bot', fighters: [p1, bot], labels: ['You', `Bot · ${difficulty}`], difficulty, seed: this.seedCounter++ });
  }

  /** Bot vs bot (dev demo / screenshots). */
  startDemo(a: string, b: string): void {
    this.beginMatch({ kind: 'local', fighters: [a, b], labels: ['Bot', 'Bot'], seed: this.seedCounter++ }, (setup) => {
      const sim = createMatch({ fighters: [getFighter(setup.fighters[0]).def, getFighter(setup.fighters[1]).def], arena: getArena(), seed: setup.seed });
      const bots = [createBot(sim, 0, 'hard', setup.seed), createBot(sim, 1, 'hard', setup.seed + 1)];
      return new LocalDriver(sim, [(st) => bots[0]!.input(st), (st) => bots[1]!.input(st)]);
    });
  }

  openSandbox(): void {
    this.endMatch();
    this.stack.clear();
    this.sandbox = new Sandbox(this, this.hudLayer);
  }

  closeSandbox(): void {
    this.sandbox?.dispose();
    this.sandbox = null;
    this.toMainMenu();
  }

  quitApp(): void {
    this.platform.quit();
  }

  private pause(): void {
    if (!this.match) return;
    this.match.paused = true;
    this.stack.push(pauseScreen(this, () => this.match!.sim, this.match.setup.kind === 'online'));
  }

  resume(): void {
    if (!this.match) return;
    this.match.paused = false;
    this.match.loop.reset();
    this.stack.clear();
  }

  quitMatch(): void {
    if (this.match?.setup.kind === 'online') this.online.leave();
    this.toMainMenu();
  }

  rematch(): void {
    if (!this.match) return this.toMainMenu();
    const setup = { ...this.match.setup, seed: this.seedCounter++ };
    if (setup.kind === 'online') this.online.rematch();
    else this.beginMatch(setup);
  }

  private endMatch(): void {
    this.match?.dispose();
    this.match = null;
    this.hudLayer.replaceChildren();
    this.app.stage.visible = false;
  }

  toMainMenu(): void {
    this.endMatch();
    this.platform.steam?.setRichPresence('In menus');
    this.stack.clear();
    this.stack.push(mainMenu(this));
  }
}

export async function startGame(host: HTMLElement): Promise<Game> {
  const g = new Game();
  await g.start(host);
  (globalThis as { __limbClash?: Game }).__limbClash = g; // handy for debugging and scripted play-tests
  return g;
}
