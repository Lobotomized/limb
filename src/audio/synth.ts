/**
 * Placeholder sound design, synthesized with Web Audio (no audio files).
 * Audio never affects the simulation; it only reacts to events.
 */
export interface Volumes {
  master: number;
  effects: number;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes: Volumes = { master: 0.8, effects: 0.8 };

  /** Audio contexts may only start after a user gesture; call from input handlers. */
  resume(): void {
    try {
      if (!this.ctx) {
        const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.fx = this.ctx.createGain();
        this.fx.connect(this.master);
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.master) this.master.gain.value = this.volumes.master;
    if (this.fx) this.fx.gain.value = this.volumes.effects;
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** A pitched tone with an exponential decay. */
  tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.fx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst. */
  noiseBurst(dur: number, gain: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.fx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
