/**
 * StarMaker Audio Effects Engine & DSP Studio
 * Uses Web Audio API for real-time vocal processing, convolution reverb, echo, EQ, and mixing
 */

class AudioEffectsEngine {
  constructor() {
    this.audioCtx = null;
    this.micStream = null;
    this.micSourceNode = null;
    this.musicSourceNode = null;
    this.musicElement = null;

    // Nodes
    this.micPreAmp = null;
    this.highPassFilter = null; // Filter out rumble < 80Hz
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;
    this.compressor = null;

    // Reverb system
    this.convolver = null;
    this.reverbGain = null;
    this.dryVocalGain = null;

    // Echo / Delay system
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayFilter = null;
    this.echoGain = null;

    // Autotune / Robot Vibrato LFO system
    this.lfoOsc = null;
    this.lfoGain = null;
    this.isAutotuneActive = false;

    // Master Output & Master Recording Limiter Protection (Anti-Clipping / Anti-Pecah)
    this.masterSpeakerGain = null;
    this.masterSpeakerLimiter = null;
    this.masterRecordGain = null;
    this.masterRecordLimiter = null;

    // Monitor (earphone output) & Mixer Destination (for recorder)
    this.monitorGain = null;
    this.vocalMixGain = null;
    this.musicMixGain = null;
    this.destinationNode = null; // MediaStream destination for recording

    // State
    this.currentPreset = 'studio';
    this.isMonitoring = false;
    this.vocalVolume = 1.0;

    // Music Pitch Transpose (-6 to +6 semitones) and Speed/Tempo (0.75x to 1.5x)
    this.musicPitch = parseInt(localStorage.getItem('sushee_music_pitch') || '0', 10) || 0;
    this.musicSpeed = parseFloat(localStorage.getItem('sushee_music_speed') || '1.0') || 1.0;
    this.pitchShifter = null;

    // Default balanced backing track level (0.85 = 85%) for clear, loud playback
    const savedMusicVol = localStorage.getItem('sushee_music_volume');
    this.musicVolume = (savedMusicVol !== null && !isNaN(parseFloat(savedMusicVol))) ? parseFloat(savedMusicVol) : 0.85;
    // Real-Time Direct Vocal Sync (0ms delay for true zero-latency simultaneous recording)
    let defaultLatency = 0;
    const savedLatency = localStorage.getItem('sushee_latency_offset');
    // If previously saved with old 110ms or invalid default, reset to pure 0ms realtime
    if (savedLatency === '110' || savedLatency === null) {
      this.latencyOffsetMs = 0;
      try { localStorage.setItem('sushee_latency_offset', '0'); } catch (e) {}
    } else {
      this.latencyOffsetMs = parseFloat(savedLatency) || 0;
    }

    // Audio Analysis for Visualizer
    this.micAnalyser = null;
    this.musicAnalyser = null;
  }

  async resumeContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn("Could not resume AudioContext:", e);
      }
    }
  }

  async init(musicAudioElement) {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    }

    await this.resumeContext();

    this.musicElement = musicAudioElement;
    if (this.musicElement) {
      this.musicElement.volume = 1.0;
    }

    // Create Master Recording Destination
    if (!this.destinationNode) {
      this.destinationNode = this.audioCtx.createMediaStreamDestination();
    }

    // Setup Master Anti-Clipping Limiters (Brickwall Peak Protection)
    if (!this.masterSpeakerLimiter) {
      this.setupMasterLimiters();
    }

    // Create Analysers for UI Visualizer
    if (!this.micAnalyser) {
      this.micAnalyser = this.audioCtx.createAnalyser();
      this.micAnalyser.fftSize = 128;
    }
    if (!this.musicAnalyser) {
      this.musicAnalyser = this.audioCtx.createAnalyser();
      this.musicAnalyser.fftSize = 128;
    }

    // Setup Music Audio Chain
    this.setupMusicChain();

    // Setup Vocal Effect Chain
    if (!this.micPreAmp) {
      this.setupVocalChain();
    }

    // Apply default preset (Studio Pro)
    if (!this.currentPreset) {
      this.applyPreset('studio');
    }

    return true;
  }

  setupMasterLimiters() {
    // 1. Master Output (Speakers / Earphones) with Brickwall Anti-Clipping Limiter
    this.masterSpeakerGain = this.audioCtx.createGain();
    this.masterSpeakerGain.gain.value = 1.0;

    this.masterSpeakerLimiter = this.audioCtx.createDynamicsCompressor();
    this.masterSpeakerLimiter.threshold.value = -1.5; // -1.5 dBFS ceiling to prevent DAC distortion
    this.masterSpeakerLimiter.knee.value = 3.0;      // Soft knee for transparent saturation
    this.masterSpeakerLimiter.ratio.value = 20.0;    // Brickwall peak limiting
    this.masterSpeakerLimiter.attack.value = 0.001;  // 1ms ultrafast attack catches all transients
    this.masterSpeakerLimiter.release.value = 0.05;  // 50ms fast transparent recovery

    this.masterSpeakerGain.connect(this.masterSpeakerLimiter);
    this.masterSpeakerLimiter.connect(this.audioCtx.destination);

    // 2. Master Recording Destination with Brickwall Anti-Clipping Limiter
    this.masterRecordGain = this.audioCtx.createGain();
    this.masterRecordGain.gain.value = 1.0;

    this.masterRecordLimiter = this.audioCtx.createDynamicsCompressor();
    this.masterRecordLimiter.threshold.value = -1.5;
    this.masterRecordLimiter.knee.value = 3.0;
    this.masterRecordLimiter.ratio.value = 20.0;
    this.masterRecordLimiter.attack.value = 0.001;
    this.masterRecordLimiter.release.value = 0.05;

    this.masterRecordGain.connect(this.masterRecordLimiter);
    this.masterRecordLimiter.connect(this.destinationNode);
  }

  setupMusicChain() {
    if (!this.musicSourceNode && this.musicElement) {
      try {
        this.musicSourceNode = this.audioCtx.createMediaElementSource(this.musicElement);
      } catch (e) {
        console.warn("MediaElementSource might already be attached or cross-origin:", e);
      }
    }

    if (this.musicSourceNode && !this.musicMixGain) {
      // Create Real-Time Pitch Shifter for Backing Track
      if (!this.pitchShifter) {
        this.pitchShifter = new WebAudioPitchShifter(this.audioCtx);
        if (this.musicPitch) {
          this.pitchShifter.setPitch(this.musicPitch);
        }
      }

      this.musicMixGain = this.audioCtx.createGain();
      this.musicMixGain.gain.value = this.musicVolume;

      // Connect: Music -> Pitch Shifter -> Music Mix Gain -> Analyser
      this.musicSourceNode.connect(this.pitchShifter.input);
      this.pitchShifter.output.connect(this.musicMixGain);
      this.musicMixGain.connect(this.musicAnalyser);

      // Route directly to Master Audio Destination for full clarity & zero distortion
      this.musicMixGain.connect(this.audioCtx.destination);
      
      // Delay Node for Latency Alignment
      this.musicDelayNode = this.audioCtx.createDelay(1.0);
      this.musicMixGain.connect(this.musicDelayNode);

      // Route to Master Record Destination (Protected by limiter)
      if (this.masterRecordGain) {
        this.musicDelayNode.connect(this.masterRecordGain);
      } else {
        this.musicDelayNode.connect(this.destinationNode);
      }

      // Apply initial latency offset to music delay node
      this.setLatencyOffset(this.latencyOffsetMs);

      // Apply initial speed
      if (this.musicElement && this.musicSpeed !== 1.0) {
        this.setMusicSpeed(this.musicSpeed);
      }
    }
  }

  setupVocalChain() {
    // 1. Preamp
    this.micPreAmp = this.audioCtx.createGain();
    this.micPreAmp.gain.value = this.vocalVolume;

    // 2. High Pass Rumble Filter (80Hz)
    this.highPassFilter = this.audioCtx.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.value = 80;

    // 3. 3-Band Parametric EQ
    this.eqLow = this.audioCtx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.value = 0;

    this.eqMid = this.audioCtx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 2500;
    this.eqMid.Q.value = 1.0;
    this.eqMid.gain.value = 2; // slight presence

    this.eqHigh = this.audioCtx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 6500;
    this.eqHigh.gain.value = 3; // airy treble

    // 4. Studio Dynamic Compressor
    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.15;

    // 5. Reverb Path (Convolver + Gain)
    this.convolver = this.audioCtx.createConvolver();
    this.generateImpulseResponse(1.8, 2.0); // Default Studio Impulse
    this.reverbGain = this.audioCtx.createGain();
    this.reverbGain.gain.value = 0.25;

    // 6. Echo / Delay Path (Delay + Lowpass in feedback loop)
    this.delayNode = this.audioCtx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.15; // 150ms
    this.delayFeedback = this.audioCtx.createGain();
    this.delayFeedback.gain.value = 0.25;
    this.delayFilter = this.audioCtx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2800; // Warm analog tape echo
    this.echoGain = this.audioCtx.createGain();
    this.echoGain.gain.value = 0.15;

    // Feedback loop: delay -> filter -> feedback -> delay
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayFilter.connect(this.echoGain);

    // 7. Dry vocal gain
    this.dryVocalGain = this.audioCtx.createGain();
    this.dryVocalGain.gain.value = 0.9;

    // 8. Master Vocal Summer Node
    this.vocalSummer = this.audioCtx.createGain();
    this.vocalSummer.gain.value = 1.0;

    // 9. Earphone Monitor & Mix Destination
    this.monitorGain = this.audioCtx.createGain();
    this.monitorGain.gain.value = 0.0; // Muted by default to avoid speaker feedback

    this.vocalMixGain = this.audioCtx.createGain();
    this.vocalMixGain.gain.value = 1.0;

    // Connect Effect Architecture:
    // micPreAmp -> highPassFilter -> eqLow -> eqMid -> eqHigh -> compressor
    this.micPreAmp.connect(this.highPassFilter);
    this.highPassFilter.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.compressor);

    // Split from compressor:
    // - Dry branch
    this.compressor.connect(this.dryVocalGain);
    this.dryVocalGain.connect(this.vocalSummer);

    // - Reverb branch
    this.compressor.connect(this.convolver);
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.vocalSummer);

    // - Echo branch
    this.compressor.connect(this.delayNode);
    this.echoGain.connect(this.vocalSummer);

    // From Vocal Summer to Analyser, Monitor (Earphones) and Destination (Record)
    this.vocalSummer.connect(this.micAnalyser);

    this.vocalSummer.connect(this.monitorGain);
    if (this.masterSpeakerGain) {
      this.monitorGain.connect(this.masterSpeakerGain);
    } else {
      this.monitorGain.connect(this.audioCtx.destination);
    }

    // Latency Alignment Delay Node for Vocals
    this.vocalDelayNode = this.audioCtx.createDelay(1.0);
    this.vocalDelayNode.delayTime.value = 0;

    this.vocalSummer.connect(this.vocalMixGain);
    this.vocalMixGain.connect(this.vocalDelayNode);

    if (this.masterRecordGain) {
      this.vocalDelayNode.connect(this.masterRecordGain);
    } else {
      this.vocalDelayNode.connect(this.destinationNode);
    }

    // Apply current latency offset
    this.setLatencyOffset(this.latencyOffsetMs);
  }

  /**
   * Connect microphone stream to the effect chain
   */
  async startMicrophone() {
    try {
      if (this.micStream) {
        this.stopMicrophone();
      }

      // Enable Acoustic Echo Cancellation & Noise Suppression to prevent speaker music bleed
      // from leaking into the microphone and creating double music in recordings
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: false,
          channelCount: 1,
          latency: { ideal: 0 }
        }
      });

      if (!this.audioCtx) {
        await this.init(this.musicElement);
      }

      this.micSourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.micSourceNode.connect(this.micPreAmp);
      return true;
    } catch (err) {
      console.warn("Microphone access with advanced constraints failed, attempting fallback:", err);
      // Fallback with standard constraints
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        this.micSourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
        this.micSourceNode.connect(this.micPreAmp);
        return true;
      } catch (e) {
        throw new Error("Izin mikrofon ditolak atau mikrofon tidak ditemukan.");
      }
    }
  }

  stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
    }
  }

  /**
   * Generates a realistic synthetic reverb impulse response (Algorithmic Room/Hall/Studio)
   */
  generateImpulseResponse(duration = 2.0, decay = 2.0) {
    if (!this.audioCtx) return;
    const rate = this.audioCtx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.audioCtx.createBuffer(2, length, rate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      // Exponential decay envelope with random Gaussian noise
      const envelope = Math.pow(n / length, decay);
      leftChannel[i] = (Math.random() * 2 - 1) * envelope;
      rightChannel[i] = (Math.random() * 2 - 1) * envelope;
    }

    this.convolver.buffer = impulse;
  }

  /**
   * StarMaker Signature Vocal Presets
   */
  applyPreset(presetKey) {
    this.currentPreset = presetKey;
    if (!this.audioCtx) return;

    // Reset autotune/LFO if switching away
    this.disableAutotuneLfo();

    switch (presetKey) {
      case 'original':
        // Pure mic sound, no effects
        this.reverbGain.gain.value = 0.0;
        this.echoGain.gain.value = 0.0;
        this.dryVocalGain.gain.value = 1.0;
        this.eqLow.gain.value = 0;
        this.eqMid.gain.value = 0;
        this.eqHigh.gain.value = 0;
        this.compressor.threshold.value = -12;
        break;

      case 'studio':
        // Pure Realtime Studio Vocal: Crisp, immediate, zero-delay upfront sound with subtle room polish
        this.generateImpulseResponse(1.0, 2.5);
        this.reverbGain.gain.value = 0.10;
        this.echoGain.gain.value = 0.0; // 0.0 echo gain - ZERO delay on vocals!
        this.delayNode.delayTime.value = 0.0; // 0.0 delay time
        this.delayFeedback.gain.value = 0.0;
        this.dryVocalGain.gain.value = 1.0; // 100% direct upfront dry vocal
        this.eqLow.gain.value = -1; // Clean lows
        this.eqMid.gain.value = 2.0; // Presence boost
        this.eqHigh.gain.value = 3.5; // Air / Sparkle
        this.compressor.threshold.value = -20;
        this.compressor.ratio.value = 3.5;
        break;

      case 'ktv':
        // Lush karaoke room reverb with classic stereo echo
        this.generateImpulseResponse(2.2, 1.8);
        this.reverbGain.gain.value = 0.38;
        this.echoGain.gain.value = 0.28;
        this.delayNode.delayTime.value = 0.16;
        this.delayFeedback.gain.value = 0.35;
        this.dryVocalGain.gain.value = 0.85;
        this.eqLow.gain.value = 1.5;
        this.eqMid.gain.value = 1.0;
        this.eqHigh.gain.value = 2.5;
        this.compressor.threshold.value = -18;
        this.compressor.ratio.value = 3;
        break;

      case 'hall':
        // Large arena/cathedral spacious reverb
        this.generateImpulseResponse(3.5, 1.4);
        this.reverbGain.gain.value = 0.50;
        this.echoGain.gain.value = 0.20;
        this.delayNode.delayTime.value = 0.24;
        this.delayFeedback.gain.value = 0.30;
        this.dryVocalGain.gain.value = 0.80;
        this.eqLow.gain.value = 2.0;
        this.eqMid.gain.value = 0;
        this.eqHigh.gain.value = 3.0;
        this.compressor.threshold.value = -20;
        this.compressor.ratio.value = 3.5;
        break;

      case 'pop':
        // Modern pop stage vocal with snappy delay and forward mids
        this.generateImpulseResponse(1.5, 2.2);
        this.reverbGain.gain.value = 0.22;
        this.echoGain.gain.value = 0.32;
        this.delayNode.delayTime.value = 0.13;
        this.delayFeedback.gain.value = 0.40;
        this.dryVocalGain.gain.value = 0.90;
        this.eqLow.gain.value = -2.0;
        this.eqMid.gain.value = 3.5;
        this.eqHigh.gain.value = 5.0;
        this.compressor.threshold.value = -26;
        this.compressor.ratio.value = 5;
        break;

      case 'autotune':
        // StarMaker electronic vocal pitch effect with robot resonance
        this.generateImpulseResponse(1.0, 3.0);
        this.reverbGain.gain.value = 0.20;
        this.echoGain.gain.value = 0.18;
        this.delayNode.delayTime.value = 0.08;
        this.delayFeedback.gain.value = 0.25;
        this.dryVocalGain.gain.value = 0.90;
        this.eqLow.gain.value = -3.0;
        this.eqMid.gain.value = 4.0;
        this.eqHigh.gain.value = 6.0;
        this.compressor.threshold.value = -28;
        this.compressor.ratio.value = 8;
        this.enableAutotuneLfo();
        break;

      case 'warm':
        // Vintage acoustic warmth
        this.generateImpulseResponse(1.8, 2.0);
        this.reverbGain.gain.value = 0.25;
        this.echoGain.gain.value = 0.10;
        this.delayNode.delayTime.value = 0.12;
        this.delayFeedback.gain.value = 0.15;
        this.dryVocalGain.gain.value = 0.90;
        this.eqLow.gain.value = 3.0;
        this.eqMid.gain.value = 1.5;
        this.eqHigh.gain.value = -1.0;
        this.compressor.threshold.value = -16;
        this.compressor.ratio.value = 2.5;
        break;

      case 'custom':
        // Retains user custom sliders
        break;
    }
  }

  enableAutotuneLfo() {
    if (!this.audioCtx || this.isAutotuneActive) return;
    try {
      this.lfoOsc = this.audioCtx.createOscillator();
      this.lfoGain = this.audioCtx.createGain();
      this.lfoOsc.type = 'sawtooth';
      this.lfoOsc.frequency.value = 5.8; // vibrato pitch flutter
      this.lfoGain.gain.value = 0.0025; // subtle pitch mod on delay
      this.lfoOsc.connect(this.lfoGain);
      this.lfoGain.connect(this.delayNode.delayTime);
      this.lfoOsc.start();
      this.isAutotuneActive = true;
    } catch (e) {
      console.warn("Autotune LFO error:", e);
    }
  }

  disableAutotuneLfo() {
    if (this.lfoOsc && this.isAutotuneActive) {
      try {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
      } catch (e) {}
      this.lfoOsc = null;
      this.isAutotuneActive = false;
    }
  }

  // Parameter Adjustment Methods
  setReverbAmount(val) {
    if (this.reverbGain) {
      this.reverbGain.gain.value = parseFloat(val);
    }
  }

  setEchoAmount(val) {
    if (this.echoGain) {
      this.echoGain.gain.value = parseFloat(val);
    }
  }

  setEchoDelay(valMs) {
    if (this.delayNode) {
      this.delayNode.delayTime.value = parseFloat(valMs) / 1000;
    }
  }

  setEchoFeedback(val) {
    if (this.delayFeedback) {
      this.delayFeedback.gain.value = parseFloat(val);
    }
  }

  setVocalTone(valDb) {
    if (this.eqHigh) {
      this.eqHigh.gain.value = parseFloat(valDb);
    }
  }

  setVocalVolume(val) {
    this.vocalVolume = Math.max(0, Math.min(2.0, parseFloat(val) || 0));
    if (this.micPreAmp && this.audioCtx) {
      this.micPreAmp.gain.setTargetAtTime(this.vocalVolume, this.audioCtx.currentTime, 0.015);
    } else if (this.micPreAmp) {
      this.micPreAmp.gain.value = this.vocalVolume;
    }
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1.0, parseFloat(val) || 0));
    try {
      localStorage.setItem('sushee_music_volume', this.musicVolume);
    } catch (e) {}

    if (this.musicMixGain && this.audioCtx) {
      this.musicMixGain.gain.setTargetAtTime(this.musicVolume, this.audioCtx.currentTime, 0.015);
    } else if (this.musicMixGain) {
      this.musicMixGain.gain.value = this.musicVolume;
    }

    if (this.musicElement) {
      // If Web Audio node is active, keep HTML5 volume at 1.0 to prevent double attenuation
      this.musicElement.volume = this.musicSourceNode ? 1.0 : this.musicVolume;
    }
  }

  setMusicPitch(semitones) {
    const val = Math.max(-6, Math.min(6, parseInt(semitones, 10) || 0));
    this.musicPitch = val;
    if (this.pitchShifter) {
      this.pitchShifter.setPitch(val);
    }
    try {
      localStorage.setItem('sushee_music_pitch', val.toString());
    } catch (e) {}
    return val;
  }

  setMusicSpeed(speed) {
    const s = Math.max(0.75, Math.min(1.35, parseFloat(speed) || 1.0));
    // Round to nearest 0.05
    const rounded = Math.round(s * 20) / 20;
    this.musicSpeed = rounded;
    if (this.musicElement) {
      try {
        this.musicElement.preservesPitch = true;
        this.musicElement.mozPreservesPitch = true;
        this.musicElement.webkitPreservesPitch = true;
        this.musicElement.playbackRate = rounded;
      } catch (e) {
        console.warn("Could not set playbackRate:", e);
      }
    }
    try {
      localStorage.setItem('sushee_music_speed', rounded.toString());
    } catch (e) {}
    return rounded;
  }

  resetMusicPitch() {
    return this.setMusicPitch(0);
  }

  resetMusicSpeed() {
    return this.setMusicSpeed(1.0);
  }

  setMonitoring(enabled) {
    this.isMonitoring = enabled;
    if (this.monitorGain && this.audioCtx) {
      // 0.7 when on, 0.0 when off (with gentle ramp to avoid pops)
      const targetVal = enabled ? 0.7 : 0.0;
      this.monitorGain.gain.setTargetAtTime(targetVal, this.audioCtx.currentTime, 0.02);
    } else if (this.monitorGain) {
      this.monitorGain.gain.value = enabled ? 0.7 : 0.0;
    }
  }

  /**
   * Sets latency compensation offset in milliseconds between vocal and backing music
   * Positive (+ms): vocal is delayed (e.g. bluetooth/hardware latency) -> delay music to sync
   * Negative (-ms): vocal is early -> delay vocal to sync
   */
  setLatencyOffset(offsetMs) {
    this.latencyOffsetMs = parseFloat(offsetMs) || 0;
    try {
      localStorage.setItem('sushee_latency_offset', this.latencyOffsetMs);
    } catch (e) {}

    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const sec = Math.abs(this.latencyOffsetMs) / 1000;

    if (this.musicDelayNode) {
      const musicSec = this.latencyOffsetMs > 0 ? sec : 0;
      try {
        this.musicDelayNode.delayTime.cancelScheduledValues(now);
        this.musicDelayNode.delayTime.setValueAtTime(musicSec, now);
        this.musicDelayNode.delayTime.value = musicSec;
      } catch (e) {
        this.musicDelayNode.delayTime.value = musicSec;
      }
    }

    if (this.vocalDelayNode) {
      const vocalSec = this.latencyOffsetMs < 0 ? sec : 0;
      try {
        this.vocalDelayNode.delayTime.cancelScheduledValues(now);
        this.vocalDelayNode.delayTime.setValueAtTime(vocalSec, now);
        this.vocalDelayNode.delayTime.value = vocalSec;
      } catch (e) {
        this.vocalDelayNode.delayTime.value = vocalSec;
      }
    }

    console.log(`[AudioEffectsEngine] Real-time Latency Offset applied: ${this.latencyOffsetMs}ms (Music delay: ${this.musicDelayNode ? this.musicDelayNode.delayTime.value : 'N/A'}s, Vocal delay: ${this.vocalDelayNode ? this.vocalDelayNode.delayTime.value : 'N/A'}s)`);
  }

  /**
   * Automatically detects the roundtrip delay between audio output and microphone.
   * Utilizes an acoustic pulse chirp for direct loopback detection along with
   * Web Audio API hardware buffer metrics (baseLatency and outputLatency).
   * @param {Function} onProgress - Callback with status update text
   * @returns {Promise<{ latencyMs: number, mode: string }>}
   */
  async autoDetectLatency(onProgress = () => {}) {
    await this.init();

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (!this.micStream) {
      onProgress('Menghubungkan mikrofon...');
      await this.startMicrophone();
    }

    const baseLatency = (this.audioCtx.baseLatency || 0) * 1000;
    const outputLatency = (this.audioCtx.outputLatency || 0) * 1000;

    onProgress('Memancarkan sinyal tes chirp audio...');

    // Short audio pulse chirp (1000Hz -> 1800Hz in 35ms)
    const chirpDuration = 0.035;
    const osc = this.audioCtx.createOscillator();
    const chirpGain = this.audioCtx.createGain();

    osc.type = 'sine';
    const now = this.audioCtx.currentTime;
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + chirpDuration);

    chirpGain.gain.setValueAtTime(0, now);
    chirpGain.gain.linearRampToValueAtTime(0.75, now + 0.005);
    chirpGain.gain.linearRampToValueAtTime(0, now + chirpDuration);

    osc.connect(chirpGain);
    chirpGain.connect(this.audioCtx.destination);

    const fftSize = 1024;
    const timeBuffer = new Float32Array(fftSize);
    let peakDetectedTime = null;
    const startTime = performance.now();

    osc.start(now);
    osc.stop(now + chirpDuration);

    // Monitor mic input for loopback response
    const maxListenMs = 550;
    let detectedPeakOffset = null;
    let maxMicAmp = 0;

    await new Promise(resolve => {
      const checkInterval = 8;
      const pollTimer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        if (elapsed > maxListenMs) {
          clearInterval(pollTimer);
          resolve();
          return;
        }

        if (this.micAnalyser) {
          this.micAnalyser.getFloatTimeDomainData(timeBuffer);
          let localPeak = 0;
          for (let i = 0; i < timeBuffer.length; i++) {
            const abs = Math.abs(timeBuffer[i]);
            if (abs > localPeak) localPeak = abs;
          }

          if (localPeak > maxMicAmp) {
            maxMicAmp = localPeak;
          }

          // If a distinctive sound burst is captured on mic after pulse start
          if (elapsed > 25 && localPeak > 0.18 && !peakDetectedTime) {
            peakDetectedTime = performance.now();
            detectedPeakOffset = Math.round(peakDetectedTime - startTime);
          }
        }
      }, checkInterval);
    });

    let finalLatencyMs = 0;
    let detectionMode = 'hardware';

    if (detectedPeakOffset !== null && maxMicAmp > 0.18) {
      // Loopback was captured via acoustic response
      finalLatencyMs = Math.round(detectedPeakOffset / 5) * 5;
      detectionMode = 'acoustic';
      onProgress(`Akustik loopback terdeteksi: ${finalLatencyMs} ms`);
    } else {
      // User is using headphones/TWS or mic is far
      // Compute from device hardware pipeline + standard Android audio driver latency
      const hwLatency = baseLatency + outputLatency;
      if (hwLatency > 0) {
        finalLatencyMs = Math.round((hwLatency + 40) / 5) * 5;
      } else {
        // Standard Android Bluetooth / system driver estimate
        finalLatencyMs = 80;
      }
      detectionMode = 'hardware';
      onProgress(`Latensi hardware driver terdeteksi: ${finalLatencyMs} ms`);
    }

    // Clamp between -300 and 300
    finalLatencyMs = Math.max(-300, Math.min(300, finalLatencyMs));
    this.setLatencyOffset(finalLatencyMs);

    return { latencyMs: finalLatencyMs, mode: detectionMode };
  }

  getMixedStream() {
    return this.destinationNode ? this.destinationNode.stream : null;
  }
}

/**
 * Web Audio Real-Time Pitch Shifter for Backing Music Track
 * Uses dual modulated delay lines with smooth cosine crossfade window
 * Provides click-free realtime semitone transposition (-6 to +6) with instant dry bypass when semitones === 0
 */
class WebAudioPitchShifter {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.input = audioCtx.createGain();
    this.output = audioCtx.createGain();
    this.pitchSemitones = 0;

    // Dry bypass gain (1.0 when 0 semitones)
    this.dryGain = audioCtx.createGain();
    this.dryGain.gain.value = 1.0;

    // Wet shifted gain (0.0 when 0 semitones)
    this.wetGain = audioCtx.createGain();
    this.wetGain.gain.value = 0.0;

    // 60ms grain window provides crystal clear audio without phase smearing or distortion
    this.bufferTime = 0.06;

    this.delay1 = audioCtx.createDelay(1.0);
    this.delay2 = audioCtx.createDelay(1.0);
    this.fadeGain1 = audioCtx.createGain();
    this.fadeGain2 = audioCtx.createGain();

    this.delay1.delayTime.value = 0;
    this.delay2.delayTime.value = 0;
    this.fadeGain1.gain.value = 0.5;
    this.fadeGain2.gain.value = 0.5;

    // Audio Graph Connections
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.wetGain);
    this.wetGain.connect(this.delay1);
    this.wetGain.connect(this.delay2);

    this.delay1.connect(this.fadeGain1);
    this.delay2.connect(this.fadeGain2);

    this.fadeGain1.connect(this.output);
    this.fadeGain2.connect(this.output);

    this.modSources = [];
    this.initModulation();
  }

  initModulation() {
    this.stopModulation();
    if (!this.audioCtx || this.pitchSemitones === 0) {
      if (this.dryGain && this.wetGain) {
        this.dryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
        this.wetGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      }
      return;
    }

    this.dryGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    this.wetGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

    const pitchRatio = Math.pow(2, this.pitchSemitones / 12);
    const delta = pitchRatio - 1;
    if (Math.abs(delta) < 0.001) {
      this.dryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.wetGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      return;
    }

    // Exact DSP rotating delay-line pitch shifting formula:
    // f_out / f_in = 1 - (dDelay/dt) = pitchRatio
    // Therefore |dDelay/dt| = |pitchRatio - 1| = |delta|
    // With grain period T = bufferTime (60ms), maxDelay MUST equal T * |delta|
    // so that slope = maxDelay / T = |delta| exactly, matching the requested semitones.
    const period = this.bufferTime;
    const maxDelay = period * Math.abs(delta);
    const sampleRate = this.audioCtx.sampleRate || 44100;
    const length = Math.floor(period * sampleRate);
    if (length < 2) return;

    const delayBuffer = this.audioCtx.createBuffer(1, length, sampleRate);
    const delayData = delayBuffer.getChannelData(0);
    const fadeBuffer = this.audioCtx.createBuffer(1, length, sampleRate);
    const fadeData = fadeBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const norm = i / length;
      if (delta > 0) {
        // Pitch UP
        delayData[i] = (1 - norm) * maxDelay;
      } else {
        // Pitch DOWN
        delayData[i] = norm * maxDelay;
      }
      // Raised cosine window for click-free crossfade
      const x = norm * 2 * Math.PI;
      fadeData[i] = 0.5 * (1 - Math.cos(x));
    }

    // Reset base gains to 0 so the modulated buffer source controls 0.0 to 1.0 crossfade cleanly
    const now = this.audioCtx.currentTime;
    this.fadeGain1.gain.setValueAtTime(0.0, now);
    this.fadeGain2.gain.setValueAtTime(0.0, now);
    this.delay1.delayTime.setValueAtTime(0.0, now);
    this.delay2.delayTime.setValueAtTime(0.0, now);

    const delayMod1 = this.audioCtx.createBufferSource();
    delayMod1.buffer = delayBuffer;
    delayMod1.loop = true;
    delayMod1.connect(this.delay1.delayTime);

    const fadeMod1 = this.audioCtx.createBufferSource();
    fadeMod1.buffer = fadeBuffer;
    fadeMod1.loop = true;
    fadeMod1.connect(this.fadeGain1.gain);

    const halfLen = Math.floor(length / 2);
    const delayBuffer2 = this.audioCtx.createBuffer(1, length, sampleRate);
    const delayData2 = delayBuffer2.getChannelData(0);
    const fadeBuffer2 = this.audioCtx.createBuffer(1, length, sampleRate);
    const fadeData2 = fadeBuffer2.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const srcIdx = (i + halfLen) % length;
      delayData2[i] = delayData[srcIdx];
      fadeData2[i] = fadeData[srcIdx];
    }

    const delayMod2 = this.audioCtx.createBufferSource();
    delayMod2.buffer = delayBuffer2;
    delayMod2.loop = true;
    delayMod2.connect(this.delay2.delayTime);

    const fadeMod2 = this.audioCtx.createBufferSource();
    fadeMod2.buffer = fadeBuffer2;
    fadeMod2.loop = true;
    fadeMod2.connect(this.fadeGain2.gain);

    delayMod1.start(now);
    fadeMod1.start(now);
    delayMod2.start(now);
    fadeMod2.start(now);

    this.modSources = [delayMod1, fadeMod1, delayMod2, fadeMod2];
  }

  stopModulation() {
    this.modSources.forEach(src => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    this.modSources = [];
  }

  setPitch(semitones) {
    const val = Math.max(-6, Math.min(6, parseInt(semitones, 10) || 0));
    if (this.pitchSemitones === val) return val;
    this.pitchSemitones = val;
    this.initModulation();
    return val;
  }
}

window.AudioEffectsEngine = AudioEffectsEngine;
window.WebAudioPitchShifter = WebAudioPitchShifter;
