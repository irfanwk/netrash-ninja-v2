export class SoundService {
  private ctx: AudioContext | null = null;
  public enabled = true;

  public init(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  public playWhoosh(pitchMod = 1): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260 * pitchMod, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playSlice(pitchMod = 1): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Layer 1: Crisp Sharp Blade Slash (Tactile physical cut)
    const bladeOsc = this.ctx.createOscillator();
    const bladeGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    bladeOsc.type = 'sawtooth';
    bladeOsc.frequency.setValueAtTime(880 * pitchMod, now);
    bladeOsc.frequency.exponentialRampToValueAtTime(120, now + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, now);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.12);

    bladeGain.gain.setValueAtTime(0.32, now);
    bladeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    bladeOsc.connect(filter);
    filter.connect(bladeGain);
    bladeGain.connect(this.ctx.destination);

    bladeOsc.start(now);
    bladeOsc.stop(now + 0.12);

    // Layer 2: Rewarding Point Chime ("Ding / Ka-ching" score sound)
    const dingOsc = this.ctx.createOscillator();
    const dingGain = this.ctx.createGain();

    dingOsc.type = 'sine';
    const baseFreq = 987.77 * pitchMod; // B5
    dingOsc.frequency.setValueAtTime(baseFreq, now + 0.02);
    dingOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.334, now + 0.08); // Ascends to E6

    dingGain.gain.setValueAtTime(0.001, now);
    dingGain.gain.exponentialRampToValueAtTime(0.38, now + 0.035);
    dingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    dingOsc.connect(dingGain);
    dingGain.connect(this.ctx.destination);

    dingOsc.start(now + 0.02);
    dingOsc.stop(now + 0.28);
  }

  public playScore(pitchMod = 1): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = 1046.5 * pitchMod; // C6
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCombo(count = 3, pitchMod = 1): void {
    if (!this.enabled || !this.ctx) return;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + i * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (1 + count * 0.05) * pitchMod, now);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    });
  }

  public playExplosion(): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.45);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  public playRadiationZap(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(580, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.38);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playFanfare(): void {
    if (!this.enabled || !this.ctx) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + idx * 0.11;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    });
  }
}

export const sound = new SoundService();
