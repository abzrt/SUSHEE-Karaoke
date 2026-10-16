/**
 * Minimalist Neon Audio Visualizer
 * Visualizes microphone and music frequencies on an HTML5 canvas with smooth 60fps animations
 */

class AudioVisualizer {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.animationId = null;
    this.isActive = false;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 320) * dpr;
    this.canvas.height = (rect.height || 100) * dpr;
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
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;
    this.ctx.clearRect(0, 0, w, h);
  }

  render() {
    if (!this.isActive) return;

    this.animationId = requestAnimationFrame(() => this.render());

    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;

    this.ctx.clearRect(0, 0, w, h);

    const micAnalyser = this.audioEngine.micAnalyser;
    const musicAnalyser = this.audioEngine.musicAnalyser;

    if (!micAnalyser && !musicAnalyser) {
      // Idle wave
      this.drawIdleWave(w, h);
      return;
    }

    const bufferLength = micAnalyser ? micAnalyser.frequencyBinCount : 64;
    const micData = new Uint8Array(bufferLength);
    const musicData = new Uint8Array(bufferLength);

    if (micAnalyser) micAnalyser.getByteFrequencyData(micData);
    if (musicAnalyser) musicAnalyser.getByteFrequencyData(musicData);

    // Draw Minimalist Neon Bars
    const barCount = 36;
    const barWidth = (w / barCount) * 0.65;
    const barGap = (w / barCount) * 0.35;
    const centerY = h * 0.5;

    for (let i = 0; i < barCount; i++) {
      const dataIdx = Math.floor((i / barCount) * (bufferLength * 0.75));
      const micVal = (micData[dataIdx] || 0) / 255;
      const musVal = (musicData[dataIdx] || 0) / 255;
      const combined = Math.max(micVal * 1.3, musVal * 0.85);

      const barHeight = Math.max(4, combined * (h * 0.85));
      const x = i * (barWidth + barGap) + barGap / 2;
      const y = centerY - barHeight / 2;

      // Gradient color based on intensity: Violet (#7928ca) to Cyan (#00f2fe) to Coral (#ff007a)
      const grad = this.ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, '#00f2fe');
      grad.addColorStop(0.5, '#7928ca');
      grad.addColorStop(1, '#ff007a');

      this.ctx.fillStyle = grad;
      this.ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
      this.ctx.shadowBlur = 8;

      // Rounded bar
      const radius = barWidth / 2;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, radius);
      this.ctx.fill();
    }
  }

  drawIdleWave(w, h) {
    const time = Date.now() * 0.003;
    const centerY = h / 2;
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 2;

    for (let x = 0; x < w; x += 4) {
      const y = centerY + Math.sin(x * 0.03 + time) * 4;
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }
}

window.AudioVisualizer = AudioVisualizer;
