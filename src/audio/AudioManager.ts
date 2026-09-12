/**
 * 音效管理 / Audio Manager
 *
 * 使用 Web Audio API 合成音效，无需外部音频文件
 * Synthesizes sound effects using Web Audio API, no external audio files needed
 *
 * 音效类型:
 * - 击球声 / Cue strike
 * - 球碰撞声 / Ball collision
 * - 进袋声 / Pot (ball into pocket)
 * - 库边碰撞声 / Cushion bounce
 * - 犯规提示音 / Foul alert
 */

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;

  constructor() {
    // 延迟初始化 AudioContext (需要用户交互后才能创建)
    // Lazy init AudioContext (requires user interaction first)
  }

  /** 初始化音频上下文 / Initialize audio context */
  init(): void {
    if (this.audioContext) return;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available:', e);
      this.enabled = false;
    }
  }

  /**
   * 播放击球声 / Play cue strike sound
   * @param power - 力度 (影响音量) / Power (affects volume)
   */
  playStrike(power: number): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // 白噪声短脉冲 + 低通滤波 / White noise burst + lowpass filter
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000 + power * 500;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.6 * (power / 8), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.08);
  }

  /**
   * 播放球碰撞声 / Play ball collision sound
   * @param force - 碰撞力度 / Collision force
   */
  playCollision(force: number): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const vol = Math.min(1, force / 5) * this.volume * 0.4;
    if (vol < 0.01) return;

    // 短促的"咔"声 / Short click sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200 + Math.random() * 400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * 播放进袋声 / Play potting sound
   */
  playPot(): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // 下降音调的"咚"声 / Descending "thunk" sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * 播放库边碰撞声 / Play cushion bounce sound
   */
  playCushionBounce(force: number): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const vol = Math.min(1, force / 5) * this.volume * 0.3;
    if (vol < 0.01) return;

    // 低沉的"嘭"声 / Low "thud"
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * 播放犯规提示音 / Play foul alert sound
   */
  playFoul(): void {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // 两声短促的低音 / Two short low tones
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 200;

      const gain = ctx.createGain();
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(this.volume * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    }
  }

  /** 设置音量 / Set volume */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /** 启用/禁用音效 / Enable/disable audio */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
