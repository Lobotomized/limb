/** Browser platform: settings in localStorage, reports to the console + a download. */
import type { Platform } from './platform';

const KEY = 'limb-clash.settings.v1';

export function webPlatform(): Platform {
  return {
    kind: 'web',
    async loadSettings() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
    },
    async saveSettings(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        // Storage may be unavailable (private mode); settings then last for this session only.
      }
    },
    async setFullscreen(on) {
      try {
        if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        if (!on && document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // Fullscreen can be refused (no user gesture); ignore.
      }
    },
    isFullscreen: () => !!document.fullscreenElement,
    async writeReport(name, text) {
      console.warn(`[${name}]\n${text}`);
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        // Downloads may be blocked; the console copy remains.
      }
      return `browser console + download "${name}"`;
    },
    steam: null,
    quit() {
      window.close();
    },
  };
}
