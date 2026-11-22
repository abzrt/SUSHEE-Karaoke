/**
 * Minimalist Neon Audio Visualizer
 * Ultra-sleek, compact real-time audio & beat spectrum visualizer
 */

class AudioVisualizer {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.animationId = null;
    this.isActive = false;

    // Compact minimalist equalizer bars configuration
    this.barCount = 18;
    this.barValues = new Float32Array(this.barCount);

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 220) * dpr;
    this.canvas.height = (rect.height || 14) * dpr;
    if (this.ctx && typeof this.ctx.scale === 'function') {
      this.ctx.scale(dpr, dpr);
    }
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.render();
  }

  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }

  clear() {
    if (!this.ctx || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    this.ctx.clearRect(0, 0, w, h);
  }

  render() {
    if (!this.isActive) return;

    this.animationId = requestAnimationFrame(() => this.render());

    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    if (w <= 0 || h <= 0) return;

    this.ctx.clearRect(0, 0, w, h);

    const micAnalyser = this.audioEngine ? this.audioEngine.micAnalyser : null;
    const musicAnalyser = this.audioEngine ? this.audioEngine.musicAnalyser : null;

    const bufferLength = musicAnalyser ? musicAnalyser.frequencyBinCount : (micAnalyser ? micAnalyser.frequencyBinCount : 64);
    const musicData = new Uint8Array(bufferLength);
    const micData = new Uint8Array(bufferLength);

    let hasMusicData = false;
    let hasMicData = false;

    if (musicAnalyser) {
      musicAnalyser.getByteFrequencyData(musicData);
      for (let k = 0; k < bufferLength; k++) {
        if (musicData[k] > 0) {
          hasMusicData = true;
          break;
        }
      }
    }

    if (micAnalyser) {
      micAnalyser.getByteFrequencyData(micData);
      for (let k = 0; k < bufferLength; k++) {
        if (micData[k] > 0) {
          hasMicData = true;
          break;
        }
      }
    }

    // Audio element playback detection (guarantees lively beat response even with crossOrigin audio)
    const audioElem = this.audioEngine ? (this.audioEngine.musicElement || (typeof window !== 'undefined' ? window.audioElement : null)) : null;
    const isMusicPlaying = audioElem && !audioElem.paused && !audioElem.ended;

    // Realtime beat extraction from sub-bass & bass frequencies (bins 1 to 6)
    let beatEnergy = 0;
    if (hasMusicData) {
      let bassSum = 0;
      const beatBins = Math.min(6, bufferLength);
      for (let b = 1; b < beatBins; b++) {
        bassSum += musicData[b];
      }
      beatEnergy = bassSum / (beatBins * 255);
    } else if (isMusicPlaying) {
      const curTime = audioElem.currentTime || (Date.now() * 0.001);
      // Rhythmic musical beat pump pulse (~124 BPM)
      const pulse = Math.pow(Math.abs(Math.sin(curTime * Math.PI * 2.07)), 3);
      beatEnergy = 0.3 + 0.7 * pulse;
    }

    // Calculate bar heights with real-time frequency analysis & beat bounce
    for (let i = 0; i < this.barCount; i++) {
      let targetVal = 0;

      if (hasMusicData || hasMicData) {
        // Symmetrical layout: bass/kick drums hit hardest in the center, stereo mids/highs flutter outward
        const norm = i / (this.barCount - 1); // 0.0 to 1.0
        const distFromCenter = Math.abs(norm - 0.5) * 2; // 0.0 at center, 1.0 at outer edges
        
        // Center bars map to low-frequency beat bins, outer bars map to musical mids
        const binIndex = Math.min(bufferLength - 1, Math.floor(Math.pow(distFromCenter, 1.3) * (bufferLength * 0.75)));
        
        const mVal = (musicData[binIndex] || 0) / 255;
        const vVal = (micData[binIndex] || 0) / 255;
        
        // High frequency compensation boost
        const boost = 1.0 + distFromCenter * 0.75;
        const raw = Math.max(mVal * 1.15, vVal * 1.35) * boost;
        
        // Real-time beat reaction modulation
        targetVal = Math.min(1.0, raw * 0.8 + beatEnergy * 0.4);
      } else if (isMusicPlaying) {
        // Dynamic rhythmic beat synth when audio plays
        const curTime = (audioElem ? audioElem.currentTime : Date.now() * 0.001) * 3.8;
        const dist = Math.abs((i / (this.barCount - 1)) - 0.5) * 2;
        const wave = Math.sin(curTime * 1.6 + i * 0.45);
        const centerEmphasis = 1.0 - dist * 0.4;
        targetVal = Math.max(0.15, Math.min(1.0, (wave * 0.45 + 0.55) * beatEnergy * centerEmphasis));
      } else {
        // Idle ambient breathing line
        const t = Date.now() * 0.0025;
        targetVal = 0.12 + 0.08 * Math.sin(t + i * 0.35);
      }

      // Snappy attack on beat hit, smooth organic spring decay
      if (targetVal > this.barValues[i]) {
        this.barValues[i] = targetVal; // Instant punch on every beat
      } else {
        this.barValues[i] = Math.max(targetVal, this.barValues[i] - 0.07); // Smooth decay
      }
    }

    // Render Compact Minimalist Neon Equalizer
    const barWidth = 3.2;
    const barGap = 3.2;
    const totalBarsWidth = this.barCount * barWidth + (this.barCount - 1) * barGap;
    const startX = Math.max(0, (w - totalBarsWidth) / 2);
    const centerY = h / 2;

    for (let i = 0; i < this.barCount; i++) {
      const val = Math.max(0.15, Math.min(1.0, this.barValues[i]));
      const barHeight = Math.max(2.5, val * (h - 2));
      const x = startX + i * (barWidth + barGap);
      const y = centerY - barHeight / 2;
      const radius = barWidth / 2;

      // Vibrant Gradient: Cyan (#00f2fe) -> Electric Violet (#8b5cf6) -> Vivid Pink (#ec4899)
      const grad = this.ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#00f2fe');
      grad.addColorStop(0.5, '#8b5cf6');
      grad.addColorStop(1, '#ec4899');

      this.ctx.fillStyle = grad;
      this.ctx.shadowColor = 'rgba(0, 242, 254, 0.45)';
      this.ctx.shadowBlur = 4;

      this.ctx.beginPath();
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.roundRect(x, y, barWidth, barHeight, radius);
      } else {
        this.ctx.rect(x, y, barWidth, barHeight);
      }
      this.ctx.fill();
    }
  }

  drawIdleWave(w, h) {
    const centerY = h / 2;
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1.5;
    this.ctx.moveTo(w * 0.2, centerY);
    this.ctx.lineTo(w * 0.8, centerY);
    this.ctx.stroke();
  }
}

window.AudioVisualizer = AudioVisualizer;
