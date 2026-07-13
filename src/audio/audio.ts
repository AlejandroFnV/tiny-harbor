/**
 * audio.ts — motor de sonido 100% procedural (WebAudio, cero assets).
 * Se desbloquea con el primer gesto del usuario (requisito móvil).
 * Ambiente: olas de ruido filtrado + gaviotas sintetizadas.
 */

type SfxName =
  | "collect"
  | "buy"
  | "upgrade"
  | "mission"
  | "prestige"
  | "ui"
  | "event"
  | "storm"
  | "chest"
  | "error";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private _muted = false;
  private collectPitch = 0; // sube con cobros rápidos seguidos (combo sutil)
  private lastCollect = 0;

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  /** Llamar dentro del primer gesto de usuario. Idempotente. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch {
      return; // sin audio: el juego sigue
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.startAmbient();
  }

  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }
  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  // --- ambiente ------------------------------------------------------------------
  private startAmbient(): void {
    const ctx = this.ctx!;
    // Olas: ruido blanco → lowpass con LFO lento en frecuencia y ganancia.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // ruido rosa aproximado (integración leaky del blanco)
      const white = Math.random() * 2 - 1;
      last = last * 0.97 + white * 0.03;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambient.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 160;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(lp.frequency);
    src.connect(lp);
    lp.connect(this.ambient);
    this.ambient.connect(this.master!);
    src.start();
    lfo.start();
    lfo2.start();

    // Gaviotas de vez en cuando.
    const gullLoop = () => {
      window.setTimeout(() => {
        if (!this._muted && this.ctx?.state === "running" && Math.random() < 0.75) this.gull();
        gullLoop();
      }, 9000 + Math.random() * 14000);
    };
    gullLoop();
  }

  private gull(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = t0 + i * 0.28;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(1250 + Math.random() * 250, t);
      o.frequency.exponentialRampToValueAtTime(820, t + 0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600;
      bp.Q.value = 4;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(bp);
      bp.connect(g);
      g.connect(this.master!);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  // --- SFX ----------------------------------------------------------------------------
  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {},
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? "triangle";
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + opts.slide), t + dur);
    const v = opts.vol ?? 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { freq?: number; vol?: number; at?: number } = {}): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.at ?? 0);
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = opts.freq ?? 1400;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 0.14;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  play(name: SfxName): void {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case "collect": {
        // "cha-ching" suave; el pitch sube un pelín con cobros encadenados.
        const now = performance.now();
        this.collectPitch = now - this.lastCollect < 900 ? Math.min(this.collectPitch + 1, 6) : 0;
        this.lastCollect = now;
        const base = 880 * Math.pow(1.06, this.collectPitch);
        this.tone(base, 0.09, { type: "sine", vol: 0.1 });
        this.tone(base * 1.5, 0.14, { type: "sine", vol: 0.12, at: 0.055 });
        this.noise(0.05, { freq: 5200, vol: 0.05 });
        break;
      }
      case "buy":
        this.tone(160, 0.18, { type: "sine", vol: 0.16, slide: -60 });
        this.noise(0.35, { freq: 900, vol: 0.16, at: 0.05 });
        break;
      case "upgrade":
        this.tone(523, 0.08, { vol: 0.09 });
        this.tone(659, 0.08, { vol: 0.09, at: 0.07 });
        this.tone(784, 0.16, { vol: 0.11, at: 0.14 });
        break;
      case "mission":
        this.tone(988, 0.12, { type: "sine", vol: 0.1 });
        this.tone(1319, 0.3, { type: "sine", vol: 0.1, at: 0.1 });
        break;
      case "prestige":
        this.tone(392, 0.5, { vol: 0.1 });
        this.tone(494, 0.5, { vol: 0.1, at: 0.05 });
        this.tone(587, 0.55, { vol: 0.1, at: 0.1 });
        this.tone(784, 0.7, { type: "sine", vol: 0.12, at: 0.18 });
        this.noise(0.6, { freq: 3200, vol: 0.06, at: 0.2 });
        break;
      case "ui":
        this.tone(300, 0.05, { type: "square", vol: 0.035 });
        break;
      case "event":
        this.tone(440, 0.16, { type: "square", vol: 0.06 });
        this.tone(554, 0.22, { type: "square", vol: 0.06, at: 0.14 });
        break;
      case "storm":
        this.tone(90, 0.9, { type: "sawtooth", vol: 0.09, slide: -35 });
        this.noise(0.9, { freq: 300, vol: 0.1 });
        break;
      case "chest":
        this.tone(392, 0.1, { vol: 0.1 });
        this.tone(523, 0.1, { vol: 0.1, at: 0.09 });
        this.tone(659, 0.1, { vol: 0.1, at: 0.18 });
        this.tone(1046, 0.35, { type: "sine", vol: 0.12, at: 0.27 });
        break;
      case "error":
        this.tone(180, 0.11, { type: "square", vol: 0.05, slide: -40 });
        break;
    }
  }
}
