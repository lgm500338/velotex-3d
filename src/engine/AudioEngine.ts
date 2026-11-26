/**
 * Procedural Web Audio API racing sound synthesizer.
 * Zero external audio files — synthesizes multi-harmonic sport engine roar,
 * turbo whine, gear-shift exhaust crackle, NOS afterburner, tire drift screech,
 * impact thuds, near-miss whooshes, countdown beeps, and finish fanfare.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private oscMain: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscHarm: OscillatorNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private nitroGain: GainNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private muted = false;
  private initialized = false;
  private active = false;

  public init(): void {
    if (this.initialized) {
      this.resume();
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.48;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Shared white noise buffer (2 seconds)
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;

      // Soft distortion curve for gritty sports exhaust harmonic warmth
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = Math.tanh(x * 2.2);
      }
      shaper.curve = curve;

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineFilter.Q.value = 3.2;
      this.engineFilter = engineFilter;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0001;
      this.engineGain = engineGain;

      shaper.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      // 3 oscillators for rich V8/V10 sport engine character
      const oscMain = ctx.createOscillator();
      oscMain.type = 'sawtooth';
      oscMain.frequency.value = 65;
      const mainMix = ctx.createGain();
      mainMix.gain.value = 0.42;
      oscMain.connect(mainMix);
      mainMix.connect(shaper);
      oscMain.start();
      this.oscMain = oscMain;

      const oscSub = ctx.createOscillator();
      oscSub.type = 'triangle';
      oscSub.frequency.value = 32.5;
      const subMix = ctx.createGain();
      subMix.gain.value = 0.52;
      oscSub.connect(subMix);
      subMix.connect(shaper);
      oscSub.start();
      this.oscSub = oscSub;

      const oscHarm = ctx.createOscillator();
      oscHarm.type = 'sawtooth';
      oscHarm.frequency.value = 98;
      const harmMix = ctx.createGain();
      harmMix.gain.value = 0.22;
      oscHarm.connect(harmMix);
      harmMix.connect(shaper);
      oscHarm.start();
      this.oscHarm = oscHarm;

      // Turbocharger whine
      const turboOsc = ctx.createOscillator();
      turboOsc.type = 'sine';
      turboOsc.frequency.value = 620;
      const turboGain = ctx.createGain();
      turboGain.gain.value = 0.0001;
      turboOsc.connect(turboGain);
      turboGain.connect(master);
      turboOsc.start();
      this.turboOsc = turboOsc;
      this.turboGain = turboGain;

      // Continuous Nitro Afterburner noise channel
      const nitroSrc = ctx.createBufferSource();
      nitroSrc.buffer = buffer;
      nitroSrc.loop = true;
      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 460;
      nitroFilter.Q.value = 0.85;
      const nitroGain = ctx.createGain();
      nitroGain.gain.value = 0.0001;
      nitroSrc.connect(nitroFilter);
      nitroFilter.connect(nitroGain);
      nitroGain.connect(master);
      nitroSrc.start();
      this.nitroFilter = nitroFilter;
      this.nitroGain = nitroGain;

      // Continuous Tire Screech channel
      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = buffer;
      screechSrc.loop = true;
      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1280;
      screechFilter.Q.value = 9.0;
      const screechGain = ctx.createGain();
      screechGain.gain.value = 0.0001;
      screechSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(master);
      screechSrc.start();
      this.screechFilter = screechFilter;
      this.screechGain = screechGain;

      // High-speed aerodynamic wind rush
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buffer;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 350;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.0001;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      this.windFilter = windFilter;
      this.windGain = windGain;

      this.initialized = true;
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.48, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setEngineActive(active: boolean): void {
    this.active = active;
    if (!this.ctx || !this.engineGain || !this.turboGain || !this.nitroGain || !this.screechGain || !this.windGain) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.turboGain.gain.setTargetAtTime(0.0001, now, 0.06);
      this.nitroGain.gain.setTargetAtTime(0.0001, now, 0.06);
      this.screechGain.gain.setTargetAtTime(0.0001, now, 0.05);
      this.windGain.gain.setTargetAtTime(0.0001, now, 0.08);
    }
  }

  public updateTelemetry(params: {
    speedKmh: number;
    rpm: number; // 0..1
    gear: number; // 1..6
    isNitro: boolean;
    driftAmount: number; // 0..1
    throttleLoad: number; // 0..1
  }): void {
    if (!this.initialized || !this.ctx || !this.active) return;
    const now = this.ctx.currentTime;
    const { speedKmh, rpm, gear, isNitro, driftAmount, throttleLoad } = params;

    // Base frequency rises aggressively with RPM and subtly with gear
    const gearBoost = 1 + (gear - 1) * 0.06;
    const nitroPitch = isNitro ? 1.18 : 1.0;
    const baseFreq = (46 + rpm * 138) * gearBoost * nitroPitch;

    this.oscMain?.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.oscSub?.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03);
    // Fifth harmonic gives aggressive exotic V10 howl
    this.oscHarm?.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.03);

    const maxCutoff = 1850;
    const cutoff = 210 + rpm * maxCutoff * (0.65 + throttleLoad * 0.35) + (isNitro ? 550 : 0);
    this.engineFilter?.frequency.setTargetAtTime(cutoff, now, 0.04);

    const targetEngGain = 0.14 + rpm * 0.16 + throttleLoad * 0.06 + (isNitro ? 0.06 : 0);
    this.engineGain?.gain.setTargetAtTime(targetEngGain, now, 0.04);

    // Turbo whine kicks in above 45% RPM
    const turboFreq = 680 + rpm * 1650 + (isNitro ? 700 : 0);
    const turboLevel = Math.max(0, rpm - 0.38) * (isNitro ? 0.055 : 0.026);
    this.turboOsc?.frequency.setTargetAtTime(turboFreq, now, 0.05);
    this.turboGain?.gain.setTargetAtTime(turboLevel, now, 0.06);

    // Nitro jet roar
    this.nitroFilter?.frequency.setTargetAtTime(isNitro ? 640 + rpm * 380 : 300, now, 0.05);
    this.nitroGain?.gain.setTargetAtTime(isNitro ? 0.28 : 0.0001, now, 0.05);

    // Tire drift squeal
    const speedFactor = Math.min(1, speedKmh / 110);
    const targetScreech = driftAmount > 0.18 ? Math.min(0.16, (driftAmount - 0.15) * 0.22 * speedFactor) : 0.0001;
    this.screechFilter?.frequency.setTargetAtTime(1120 + driftAmount * 420, now, 0.04);
    this.screechGain?.gain.setTargetAtTime(targetScreech, now, 0.04);

    // Aerodynamic wind rush
    const windLevel = Math.pow(Math.min(1, speedKmh / 320), 2) * 0.17;
    this.windFilter?.frequency.setTargetAtTime(220 + speedKmh * 3.8, now, 0.06);
    this.windGain?.gain.setTargetAtTime(windLevel, now, 0.08);
  }

  public playGearShift(upshift: boolean): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Short exhaust crackle / pop
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(upshift ? 320 : 210, now);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(upshift ? 0.22 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.1);
  }

  public playImpact(intensity = 0.8): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0.25, Math.min(1, intensity));

    // Sub thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 * clamped + 45, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.22);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.45 * clamped, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Metallic scrape burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.Q.value = 1.5;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.32 * clamped, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.2);
  }

  public playNearMiss(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.24);
    filter.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.28);
  }

  public playBoostPad(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = isGo ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = isGo ? 2200 : 1200;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.48 : 0.22));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.5 : 0.24));
  }

  public playFinishFanfare(isPodium: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isPodium ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 493.88, 587.33];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.11;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  public dispose(): void {
    try {
      this.oscMain?.stop();
      this.oscSub?.stop();
      this.oscHarm?.stop();
      this.turboOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup error
    }
    this.ctx = null;
    this.initialized = false;
  }
}
