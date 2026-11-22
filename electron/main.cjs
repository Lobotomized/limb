/**
 * Electron main process: window, fullscreen, settings file, desync reports, Steam.
 *   npm run electron:dev   (builds the game, then opens it)
 *   ELECTRON_DEV_URL=http://localhost:5173 npx electron .   (against the Vite dev server)
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { initSteam } = require('./steam-core.cjs');

const ROOT = path.join(__dirname, '..');
const log = (msg) => console.log(`[limb-clash] ${msg}`);

function readSteamConfig() {
  const candidates = [path.join(process.resourcesPath || '', 'steam.config.json'), path.join(ROOT, 'steam.config.json')];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      // try the next location
    }
  }
  return { enabled: false };
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let win = null;
let steam = null;
let p2pTimer = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#111318',
    title: 'Limb Clash',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  win.on('closed', () => {
    win = null;
  });
}

function setupIpc() {
  ipcMain.handle('settings:load', () => {
    try {
      return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    } catch {
      return null;
    }
  });
  ipcMain.handle('settings:save', (_e, data) => {
    try {
      fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
      fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2));
    } catch (e) {
      log(`could not save settings: ${e.message}`);
    }
  });
  ipcMain.handle('window:fullscreen', (_e, on) => win && win.setFullScreen(!!on));
  ipcMain.on('window:isFullscreen', (e) => (e.returnValue = !!(win && win.isFullScreen())));
  ipcMain.handle('report:write', (_e, name, text) => {
    const dir = path.join(app.getPath('userData'), 'desync-reports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, String(name).replace(/[^\w.-]/g, '_'));
    fs.writeFileSync(file, text);
    log(`report written: ${file}`);
    return file;
  });
  ipcMain.on('app:quit', () => app.quit());

  // ---- Steam
  ipcMain.on('steam:available', (e) => (e.returnValue = !!steam));
  ipcMain.on('steam:personaName', (e) => (e.returnValue = steam ? steam.personaName() : ''));
  ipcMain.on('steam:opponent', (e) => (e.returnValue = steam ? steam.opponent() : null));
  ipcMain.handle('steam:createLobby', () => steam.createLobby());
  ipcMain.handle('steam:joinLobby', (_e, id) => steam.joinLobby(id));
  ipcMain.on('steam:invite', () => steam && steam.inviteFriends());
  ipcMain.on('steam:leave', () => steam && steam.leaveLobby());
  ipcMain.on('steam:presence', (_e, text) => steam && steam.setRichPresence(text));
  ipcMain.on('steam:send', (_e, to, data) => steam && steam.sendP2P(to, data));
}

function startSteamPump() {
  if (!steam) return;
  steam.onLobbyJoinRequested((lobbyId) => win && win.webContents.send('steam:joinRequested', lobbyId));
  // Forward P2P packets to the renderer as they arrive.
  p2pTimer = setInterval(() => {
    if (!win) return;
    const packets = steam.readP2P();
    if (packets.length) win.webContents.send('steam:packets', packets);
  }, 2);
}

app.whenReady().then(() => {
  steam = initSteam(readSteamConfig(), log);
  setupIpc();
  createWindow();
  startSteamPump();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (p2pTimer) clearInterval(p2pTimer);
  if (process.platform !== 'darwin') app.quit();
});
