/** Network configuration (override the signaling URL in Settings or with ?signal=wss://host). */
export const NET_CONFIG = {
  signalingPort: 8787,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as { urls: string }[],
  roomCodeLength: 4,
  /** Seconds without packets before the opponent counts as disconnected. */
  timeoutSeconds: 8,
};

/** Default signaling URL: same host as the page, signaling port. */
export function defaultSignalingUrl(pageHost: string, secure: boolean): string {
  return `${secure ? 'wss' : 'ws'}://${pageHost || 'localhost'}:${NET_CONFIG.signalingPort}`;
}
