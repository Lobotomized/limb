/**
 * Camera: follows the midpoint of both fighters and zooms to keep both on screen with a
 * margin, smoothed. It never zooms out further than the whole arena (+ its camera margin),
 * and keeps the view inside the arena (+ margin) whenever the view is smaller than it.
 * World is meters with y up; screen is pixels with y down.
 */
import type { ArenaDef } from '../core/schema/arena-schema';
import { CAMERA } from './theme';

export class Camera {
  cx = 0;
  cy = 0;
  zoom = 50; // px per meter
  private initialized = false;
  shakeX = 0;
  shakeY = 0;

  constructor(
    public screenW: number,
    public screenH: number,
  ) {}

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  /** Smallest zoom: the whole arena plus its margin fits on screen. */
  minZoom(a: ArenaDef): number {
    return Math.min(this.screenW / (a.width + 2 * a.cameraMargin), this.screenH / (a.height + 2 * a.cameraMargin));
  }

  update(a: ArenaDef, points: { x: number; y: number }[], dtMs: number, uiScale: number, snap = false): void {
    if (points.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const margin = CAMERA.fighterMarginPx * uiScale;
    const zx = Math.max(1, this.screenW - 2 * margin) / Math.max(0.5, maxX - minX);
    const zy = Math.max(1, this.screenH - 2 * margin) / Math.max(0.5, maxY - minY);
    const zMin = this.minZoom(a);
    const zMax = Math.max(zMin, CAMERA.maxZoomPxPerMeter * (this.screenH / 1080));
    const targetZoom = Math.max(zMin, Math.min(zMax, Math.min(zx, zy)));
    let tx = (minX + maxX) / 2;
    let ty = (minY + maxY) / 2;
    // Keep the view inside arena + margin on each axis (center if the view is larger).
    const clampAxis = (c: number, half: number, view: number): number => {
      const viewHalf = view / 2;
      if (viewHalf >= half) return 0;
      return Math.max(-half + viewHalf, Math.min(half - viewHalf, c));
    };
    const k = snap || !this.initialized ? 1 : 1 - Math.exp(-CAMERA.smoothing * (dtMs / 1000));
    this.zoom += (targetZoom - this.zoom) * k;
    tx = clampAxis(tx, a.width / 2 + a.cameraMargin, this.screenW / this.zoom);
    ty = clampAxis(ty, a.height / 2 + a.cameraMargin, this.screenH / this.zoom);
    this.cx += (tx - this.cx) * k;
    this.cy += (ty - this.cy) * k;
    this.initialized = true;
  }

  sx(x: number): number {
    return (x - this.cx) * this.zoom + this.screenW / 2 + this.shakeX;
  }

  sy(y: number): number {
    return this.screenH / 2 - (y - this.cy) * this.zoom + this.shakeY;
  }

  /** World length to pixels. */
  px(m: number): number {
    return m * this.zoom;
  }
}
