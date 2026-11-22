import { electronBridge, electronPlatform } from './electron';
import type { Platform } from './platform';
import { webPlatform } from './web';

export function detectPlatform(): Platform {
  const bridge = electronBridge();
  return bridge ? electronPlatform(bridge) : webPlatform();
}
