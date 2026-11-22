/**
 * SUSHEE Karaoke - Real-Time Vocal Pitch Stability & Timing Scorer (Stage 3)
 * Uses autocorrelation F0 estimation on a dedicated 1024-sample analyser node
 * to score pitch stability (cents from nearest semitone) and lyric timing.
 */
class VocalScorer {
  constructor(audioEngine, getHasActiveLyric) {
    this.audioEngine = audioEngine;
    this.getHasActiveLyric = typeof getHasActiveLyric === 'function' ? getHasActiveLyric : () => true;
    this.analyser = null;
    this.buffer = null;
    this.timer = null;
    this.isRunning = false;
    this.reset();
  }

  reset() {
    this.sungFrames = 0;
    this.lyricFrames = 0;
    this.matchedLyricFrames = 0;
    this.pitchFrameSum = 0;
    this.pitchFrames = 0;
    this.score = 0;
    this.pitchScore = 0;
    this.timingScore = 0;
    this.grade = '-';
    this.lastNote = '';
  }

  _ensureAnalyser() {
    if (!this.audioEngine || !this.audioEngine.audioCtx) return false;
    if (!this.analyser) {
      this.analyser = this.audioEngine.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.2;
      this.buffer = new Float32Array(this.analyser.fftSize);
    }
    // Tap the vocal bus without altering audio routing
    const tapNode = this.audioEngine.vocalSummer || this.audioEngine.micGainNode || this.audioEngine.micAnalyser;
    if (tapNode && !this._connectedTo) {
      try {
        tapNode.connect(this.analyser);
        this._connectedTo = tapNode;
      } catch (e) {}
    }
    return Boolean(this.analyser);
  }

  /**
   * Lightweight autocorrelation pitch detector (85 Hz - 900 Hz vocal range)
   */
  detectPitch(buf, sampleRate) {
    const size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.015) return { rms, freq: 0 };

    const minLag = Math.floor(sampleRate / 900);
    const maxLag = Math.min(Math.floor(sampleRate / 85), Math.floor(size / 2));

    const corrs = new Float32Array(maxLag + 1);
    let globalMax = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < size - lag; i++) {
        const a = buf[i];
        const b = buf[i + lag];
        sum += a * b;
        normA += a * a;
        normB += b * b;
      }
      const denom = Math.sqrt(normA * normB);
      const corr = denom > 0 ? sum / denom : 0;
      corrs[lag] = corr;
      if (corr > globalMax) globalMax = corr;
    }

    if (globalMax < 0.62) return { rms, freq: 0 };

    // Pick the FIRST local peak >= 88% of globalMax to avoid sub-harmonic octave errors (e.g. 110Hz instead of 440Hz)
    const threshold = Math.max(0.62, globalMax * 0.88);
    let bestLag = -1;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (corrs[lag] >= threshold && corrs[lag] >= corrs[lag - 1] && corrs[lag] >= corrs[lag + 1]) {
        bestLag = lag;
        break;
      }
    }

    if (bestLag > 0) {
      return { rms, freq: sampleRate / bestLag };
    }
    return { rms, freq: 0 };
  }

  static computeGrade(score) {
    if (score >= 95) return 'S+';
    if (score >= 88) return 'S';
    if (score >= 78) return 'A';
    if (score >= 65) return 'B';
    return 'C';
  }

  static freqToNoteInfo(freq) {
    if (!freq || freq <= 0) return { note: '', centsOff: 50 };
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = 69 + 12 * Math.log2(freq / 440);
    const nearest = Math.round(midi);
    const centsOff = Math.abs(midi - nearest) * 100;
    const note = noteNames[((nearest % 12) + 12) % 12] + (Math.floor(nearest / 12) - 1);
    return { note, centsOff };
  }

  start(onUpdate) {
    this.stop(true);
    this.reset();
    this._ensureAnalyser();
    this.isRunning = true;

    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      if (!this._ensureAnalyser()) return;

      this.analyser.getFloatTimeDomainData(this.buffer);
      const sampleRate = this.audioEngine.audioCtx.sampleRate || 44100;
      const { rms, freq } = this.detectPitch(this.buffer, sampleRate);
      const isSinging = rms >= 0.015;
      const activeLyric = this.getHasActiveLyric();

      if (activeLyric) {
        this.lyricFrames++;
        if (isSinging) this.matchedLyricFrames++;
      }

      if (isSinging) {
        this.sungFrames++;
        if (freq > 0) {
          const { note, centsOff } = VocalScorer.freqToNoteInfo(freq);
          this.lastNote = note;
          // Closer to an exact semitone = higher vocal stability score
          const framePitchScore = Math.max(40, Math.min(100, 108 - centsOff * 1.1));
          this.pitchFrameSum += framePitchScore;
          this.pitchFrames++;
        }
      }

      if (this.sungFrames >= 3) {
        this.pitchScore = this.pitchFrames > 0
          ? Math.round(this.pitchFrameSum / this.pitchFrames)
          : 72;
        this.timingScore = this.lyricFrames > 0
          ? Math.min(100, Math.round((this.matchedLyricFrames / this.lyricFrames) * 115))
          : 80;
        this.score = Math.max(0, Math.min(100, Math.round(this.pitchScore * 0.65 + this.timingScore * 0.35)));
        this.grade = VocalScorer.computeGrade(this.score);
      }

      if (typeof onUpdate === 'function') {
        onUpdate(this.getSnapshot());
      }
    }, 100);
  }

  getSnapshot() {
    return {
      score: this.score,
      grade: this.grade,
      pitchScore: this.pitchScore,
      timingScore: this.timingScore,
      sungFrames: this.sungFrames,
      lastNote: this.lastNote
    };
  }

  stop(silent = false) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    return silent ? null : this.getSnapshot();
  }
}

window.VocalScorer = VocalScorer;
