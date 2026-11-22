/** Player settings (saved through the platform layer, wrapped in try/catch there). */
import type { DeviceId } from '../input/bindings';

export interface Settings {
  reducedShake: boolean;
  damageNumbers: boolean;
  detailedHud: boolean;
  /** 0.8 .. 1.5 */
  uiScale: number;
  /** 0 .. 1 */
  masterVolume: number;
  effectsVolume: number;
  /** -1 = auto, else 0..4 frames */
  inputDelay: number;
  fullscreen: boolean;
  p1Device: DeviceId;
  p2Device: DeviceId;
  signalingUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  reducedShake: false,
  damageNumbers: false,
  detailedHud: false,
  uiScale: 1,
  masterVolume: 0.8,
  effectsVolume: 0.8,
  inputDelay: -1,
  fullscreen: false,
  p1Device: 'auto',
  p2Device: 'auto',
  signalingUrl: '',
};

/** Merges stored data over the defaults, ignoring anything malformed. */
export function sanitizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof Settings): void => {
    if (typeof r[k] === 'boolean') (s as unknown as Record<string, unknown>)[k] = r[k];
  };
  const num = (k: keyof Settings, lo: number, hi: number): void => {
    if (typeof r[k] === 'number' && Number.isFinite(r[k])) (s as unknown as Record<string, unknown>)[k] = Math.min(hi, Math.max(lo, r[k] as number));
  };
  bool('reducedShake');
  bool('damageNumbers');
  bool('detailedHud');
  bool('fullscreen');
  num('uiScale', 0.8, 1.5);
  num('masterVolume', 0, 1);
  num('effectsVolume', 0, 1);
  num('inputDelay', -1, 4);
  for (const k of ['p1Device', 'p2Device'] as const) if (typeof r[k] === 'string') s[k] = r[k] as DeviceId;
  if (typeof r.signalingUrl === 'string') s.signalingUrl = r.signalingUrl;
  return s;
}
