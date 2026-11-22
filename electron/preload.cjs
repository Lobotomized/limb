/**
 * Preload: exposes a small, explicit bridge (window.limbClash) to the game. The game code
 * talks only to this bridge via src/platform/electron.ts — never to Node or Electron directly.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inbox = [];
const joinHandlers = [];
ipcRenderer.on('steam:packets', (_e, packets) => {
  for (const p of packets) inbox.push({ from: p.from, data: new Uint8Array(p.data) });
});
ipcRenderer.on('steam:joinRequested', (_e, lobbyId) => joinHandlers.forEach((h) => h(lobbyId)));

contextBridge.exposeInMainWorld('limbClash', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  setFullscreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
  isFullscreen: () => ipcRenderer.sendSync('window:isFullscreen'),
  writeReport: (name, text) => ipcRenderer.invoke('report:write', name, text),
  quit: () => ipcRenderer.send('app:quit'),
  steam: {
    available: () => ipcRenderer.sendSync('steam:available'),
    personaName: () => ipcRenderer.sendSync('steam:personaName'),
    createLobby: () => ipcRenderer.invoke('steam:createLobby'),
    joinLobby: (id) => ipcRenderer.invoke('steam:joinLobby', id),
    inviteFriends: () => ipcRenderer.send('steam:invite'),
    leaveLobby: () => ipcRenderer.send('steam:leave'),
    setRichPresence: (text) => ipcRenderer.send('steam:presence', text),
    opponent: () => ipcRenderer.sendSync('steam:opponent'),
    sendP2P: (to, data) => ipcRenderer.send('steam:send', to, data),
    readP2P: () => inbox.splice(0),
    onLobbyJoinRequested: (cb) => joinHandlers.push(cb),
  },
});
