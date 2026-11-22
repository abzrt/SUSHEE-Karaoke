/**
 * Dual-Track Simultaneous Karaoke Audio Recorder
 * Mixes microphone audio (with StarMaker DSP effects) and backing music track into a single file
 */

class KaraokeRecorder {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.currentRecordingBlob = null;
    this.currentRecordingUrl = null;
    this.recordings = [];
    this.db = null;

    // Configurable Format (mp3, wav, m4a, webm) and Bitrate (128, 192, 256, 320 kbps)
    this.recordingFormat = localStorage.getItem('sushee_record_format') || 'mp3';
    this.recordingBitrate = parseInt(localStorage.getItem('sushee_record_bitrate') || localStorage.getItem('karaoke_audio_quality') || '320', 10) || 320;

    this.ready = this.initDB();
  }

  async initDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        return resolve([]);
      }
      try {
        const request = indexedDB.open('KaraokeStarDB', 2);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('recordings')) {
            db.createObjectStore('recordings', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('songs')) {
            db.createObjectStore('songs', { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          this.loadRecordingsFromDB().then(resolve);
        };
        request.onerror = () => resolve([]);
      } catch (err) {
        console.warn("Recorder indexedDB open failed:", err);
        resolve([]);
      }
    });
  }

  async loadRecordingsFromDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('recordings', 'readonly');
        const store = tx.objectStore('recordings');
        const req = store.getAll();
        req.onsuccess = () => {
          this.recordings = req.result || [];
          // ALWAYS regenerate object URLs from saved Blobs (old blob URLs are revoked on reload)
          this.recordings.forEach(rec => {
            if (rec.blob) {
              try {
                rec.url = URL.createObjectURL(rec.blob);
              } catch (err) {
                console.warn("Could not recreate object URL for recording:", rec.id, err);
              }
            }
          });

          // Notify UI that persisted recordings are ready
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('sushee:recordingsLoaded', { detail: this.recordings }));
          }

          resolve(this.recordings);
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async saveRecordingToDB(recording) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('recordings', 'readwrite');
      const store = tx.objectStore('recordings');
      // Store blob
      store.put({
        id: recording.id,
        songTitle: recording.songTitle,
        artist: recording.artist,
        preset: recording.preset,
        duration: recording.duration,
        blob: recording.blob,
        date: recording.date
      });
    } catch (e) {
      console.warn("Error saving recording to DB:", e);
    }
  }

  async deleteRecordingFromDB(id) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('recordings', 'readwrite');
      tx.objectStore('recordings').delete(id);
      this.recordings = this.recordings.filter(r => r.id !== id);
    } catch (e) {}
  }

  startRecording() {
    const stream = this.audioEngine.getMixedStream();
    if (!stream) {
      throw new Error("Mixed audio stream not available. Please initialize audio engine.");
    }

    this.recordedChunks = [];
    this.currentRecordingBlob = null;
    this.currentRecordingUrl = null;

    // Detect supported MIME types for Android & Browsers
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/aac'
    ];

    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    this.currentRecordingMime = selectedMime || 'audio/webm';

    const options = selectedMime ? { mimeType: selectedMime } : {};
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blobType = selectedMime || 'audio/webm';
      this.currentRecordingBlob = new Blob(this.recordedChunks, { type: blobType });
      this.currentRecordingUrl = URL.createObjectURL(this.currentRecordingBlob);
      this.isRecording = false;
    };

    // Request data in chunks every 500ms
    this.mediaRecorder.start(500);
    this.isRecording = true;
    this.recordingStartTime = Date.now();
  }

  /**
   * Returns current hardware and driver buffer latency in seconds for latency compensation
   */
  getDeviceBufferLatency() {
    if (this.audioEngine && typeof this.audioEngine.getBufferLatency === 'function') {
      return this.audioEngine.getBufferLatency();
    }
    if (this.audioEngine && this.audioEngine.audioCtx) {
      const base = this.audioEngine.audioCtx.baseLatency || 0;
      const output = this.audioEngine.audioCtx.outputLatency || 0;
      const hw = base + output;
      const effectiveHw = hw > 0 ? hw : 0.08;
      const manual = (this.audioEngine.latencyOffsetMs || 0) / 1000;
      return Math.max(0, effectiveHw + manual);
    }
    return 0.08;
  }

  ensureLameLoaded() {
    if (typeof window !== 'undefined' && window.lamejs && typeof window.lamejs.Mp3Encoder === 'function') {
      return Promise.resolve(true);
    }
    if (this._lameLoadPromise) return this._lameLoadPromise;
    if (typeof document === 'undefined') return Promise.resolve(false);

    this._lameLoadPromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-lazy-lame="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(Boolean(window.lamejs && window.lamejs.Mp3Encoder)), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'js/lame.min.js';
      script.async = true;
      script.setAttribute('data-lazy-lame', 'true');
      const timer = setTimeout(() => resolve(false), 10000);
      script.onload = () => {
        clearTimeout(timer);
        resolve(Boolean(window.lamejs && typeof window.lamejs.Mp3Encoder === 'function'));
      };
      script.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(script);
    });
    return this._lameLoadPromise;
  }

  async convertToMp3(rawBlob, kbps = 320) {
    await this.ensureLameLoaded();
    if (!window.lamejs || typeof window.lamejs.Mp3Encoder !== 'function') {
      console.warn("lamejs Mp3Encoder not available. Returning raw blob.");
      return rawBlob;
    }

    try {
      const arrayBuffer = await rawBlob.arrayBuffer();
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);

      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const targetKbps = kbps || 320;
      const numSamples = audioBuffer.length;

      // Latency Compensation: Shift vocal track forward by hardware buffer delay during final mixing
      const bufferLatencySec = this.getDeviceBufferLatency();
      const shiftSamples = Math.round(bufferLatencySec * sampleRate);

      const ch0 = audioBuffer.getChannelData(0);
      const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

      const left = new Int16Array(numSamples);
      const right = new Int16Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        let sampleL = 0;
        let sampleR = 0;

        if (ch1) {
          // Dual-track: ch0 is Vocal, ch1 is Backing Music.
          // Shift vocal forward to cancel out device buffer delay during final mixing
          const vocalSample = (i + shiftSamples < numSamples) ? ch0[i + shiftSamples] : 0;
          const musicSample = ch1[i];
          const mixed = Math.max(-1, Math.min(1, vocalSample + musicSample));
          sampleL = mixed;
          sampleR = mixed;
        } else {
          sampleL = Math.max(-1, Math.min(1, ch0[i]));
          sampleR = sampleL;
        }

        left[i] = sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF;
        right[i] = sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF;

        if (i % 200000 === 0 && i > 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const encoder = new window.lamejs.Mp3Encoder(2, sampleRate, targetKbps);
      const mp3Data = [];
      const sampleBlockSize = 1152;
      let blockCount = 0;

      for (let i = 0; i < numSamples; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = right.subarray(i, i + sampleBlockSize);
        const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);

        if (mp3buf && mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }

        blockCount++;
        // Non-blocking yield: yield every 25 blocks to keep UI thread 100% fluid in background without freeze
        if (blockCount % 25 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const flushBuf = encoder.flush();
      if (flushBuf && flushBuf.length > 0) {
        mp3Data.push(new Int8Array(flushBuf));
      }

      if (typeof tempCtx.close === 'function') {
        tempCtx.close().catch(() => {});
      }

      const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
      console.log(`✓ MP3 ${targetKbps} Kbps conversion complete with Latency Compensation (${(bufferLatencySec * 1000).toFixed(1)}ms shifted). Size: ${(mp3Blob.size / 1024).toFixed(1)} KB`);
      return mp3Blob;
    } catch (err) {
      console.error("Failed to convert audio to MP3 320kbps:", err);
      return rawBlob;
    }
  }

  setRecordingFormat(fmt) {
    const valid = ['mp3', 'wav', 'm4a', 'webm'];
    const chosen = valid.includes(fmt) ? fmt : 'mp3';
    this.recordingFormat = chosen;
    try {
      localStorage.setItem('sushee_record_format', chosen);
    } catch (e) {}
    return chosen;
  }

  setRecordingBitrate(kbps) {
    const val = parseInt(kbps, 10) || 320;
    this.recordingBitrate = val;
    try {
      localStorage.setItem('sushee_record_bitrate', val.toString());
      localStorage.setItem('karaoke_audio_quality', val.toString());
    } catch (e) {}
    return val;
  }

  async convertToWav(rawBlob) {
    try {
      const arrayBuffer = await rawBlob.arrayBuffer();
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      const wavBlob = this.audioBufferToWavBlob(audioBuffer);
      if (typeof tempCtx.close === 'function') {
        tempCtx.close().catch(() => {});
      }
      console.log(`✓ WAV Lossless 16-bit conversion complete. Size: ${(wavBlob.size / 1024).toFixed(1)} KB`);
      return wavBlob;
    } catch (err) {
      console.error("Failed to convert audio to WAV:", err);
      return rawBlob;
    }
  }

  audioBufferToWavBlob(audioBuffer) {
    const numChannels = 2; // Always stereo output
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // 1 = PCM uncompressed
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const numSamples = audioBuffer.length;
    const length = numSamples * blockAlign;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    const bufferLatencySec = this.getDeviceBufferLatency();
    const shiftSamples = Math.round(bufferLatencySec * sampleRate);

    const ch0 = typeof audioBuffer.getChannelData === 'function' ? audioBuffer.getChannelData(0) : [];
    const ch1 = (audioBuffer.numberOfChannels > 1 && typeof audioBuffer.getChannelData === 'function') ? audioBuffer.getChannelData(1) : null;

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      let mixed = 0;
      if (ch1) {
        const vocalSample = (i + shiftSamples < numSamples) ? ch0[i + shiftSamples] : 0;
        const musicSample = ch1[i];
        mixed = Math.max(-1, Math.min(1, vocalSample + musicSample));
      } else {
        mixed = Math.max(-1, Math.min(1, ch0[i] || 0));
      }
      let sample = mixed < 0 ? mixed * 0x8000 : mixed * 0x7FFF;
      view.setInt16(offset, sample, true);
      view.setInt16(offset + 2, sample, true);
      offset += 4;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.isRecording = false;
        resolve(null);
        return;
      }

      const durationSec = Math.round((Date.now() - this.recordingStartTime) / 1000);

      this.mediaRecorder.addEventListener('stop', () => {
        const mime = this.currentRecordingMime || 'audio/webm';
        this.currentRecordingBlob = new Blob(this.recordedChunks, { type: mime });
        this.currentRecordingUrl = URL.createObjectURL(this.currentRecordingBlob);
        this.isRecording = false;

        const isM4a = mime.includes('mp4') || mime.includes('aac');
        const formatName = isM4a ? 'M4A' : 'WEBM';

        resolve({
          blob: this.currentRecordingBlob,
          url: this.currentRecordingUrl,
          duration: durationSec,
          format: formatName,
          mimeType: mime
        });
      }, { once: true });

      this.mediaRecorder.stop();
    });
  }

  async saveCurrentRecording(songTitle, artist, presetName, durationSec) {
    if (!this.currentRecordingBlob) return null;

    const rawBlob = this.currentRecordingBlob;
    let finalBlob = rawBlob;
    let formatName = 'MP3';
    let ext = 'mp3';
    let mime = 'audio/mp3';
    let bitrateLabel = `${this.recordingBitrate} kbps`;

    const targetFormat = (this.recordingFormat || 'mp3').toLowerCase();

    if (targetFormat === 'wav') {
      finalBlob = await this.convertToWav(rawBlob);
      formatName = 'WAV';
      ext = 'wav';
      mime = 'audio/wav';
      bitrateLabel = 'Lossless PCM';
    } else if (targetFormat === 'm4a') {
      finalBlob = await this.convertToMp3(rawBlob, this.recordingBitrate);
      formatName = 'MP3';
      ext = 'mp3';
      mime = 'audio/mp3';
      bitrateLabel = `${this.recordingBitrate} kbps`;
    } else if (targetFormat === 'webm') {
      finalBlob = await this.convertToMp3(rawBlob, this.recordingBitrate);
      formatName = 'MP3';
      ext = 'mp3';
      mime = 'audio/mp3';
      bitrateLabel = `${this.recordingBitrate} kbps`;
    } else {
      // Default: MP3 with user selected bitrate (128, 192, 256, 320 kbps)
      finalBlob = await this.convertToMp3(rawBlob, this.recordingBitrate);
      formatName = 'MP3';
      ext = 'mp3';
      mime = 'audio/mp3';
      bitrateLabel = `${this.recordingBitrate} kbps`;
    }

    const finalUrl = URL.createObjectURL(finalBlob);
    this.currentRecordingBlob = finalBlob;
    this.currentRecordingUrl = finalUrl;

    const recItem = {
      id: 'rec_' + Date.now(),
      songTitle: songTitle || 'Lagu Tanpa Judul',
      artist: artist || 'Karaoke Singer',
      preset: presetName || 'Studio Pro',
      duration: durationSec || 0,
      format: formatName,
      bitrate: bitrateLabel,
      mimeType: mime,
      ext: ext,
      blob: finalBlob,
      url: finalUrl,
      date: new Date().toISOString()
    };

    this.recordings.unshift(recItem);
    this.saveRecordingToDB(recItem);

    // Auto-save to phone storage
    this.autoSaveToPhoneStorage(recItem, ext);

    return recItem;
  }

  autoSaveToPhoneStorage(recItem, ext) {
    if (!recItem || !recItem.blob) return;
    const cleanTitle = (recItem.songTitle || 'Song').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeExt = ext || recItem.ext || 'mp3';
    const filename = `Karaoke_${cleanTitle}_${Date.now()}.${safeExt}`;
    const safeMime = recItem.mimeType || (safeExt === 'wav' ? 'audio/wav' : 'audio/mp3');

    if (window.AndroidStorage && typeof window.AndroidStorage.saveRecording === 'function') {
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!reader.result) return;
          const base64Data = reader.result.toString().split(',')[1];
          const saved = window.AndroidStorage.saveRecording(
            base64Data,
            filename,
            safeMime,
            recItem.songTitle || 'Karaoke Recording',
            recItem.artist || 'Karaoke Singer'
          );
          if (saved && typeof window.showToast === 'function') {
            window.showToast(`✓ Rekaman ${recItem.format || ''} otomatis tersimpan di memori HP (Musik/SUSHEE_Karaoke/${filename})`, 'success');
          }
        };
        reader.readAsDataURL(recItem.blob);
      } catch (err) {
        console.warn('Native autoSave error:', err);
      }
    }
  }

  async downloadRecording(recordingItem) {
    if (!recordingItem || !recordingItem.blob) return;

    const cleanTitle = (recordingItem.songTitle || 'Song').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const ext = recordingItem.ext || (recordingItem.format ? recordingItem.format.toLowerCase() : 'mp3');
    const filename = `Karaoke_${cleanTitle}_${Date.now()}.${ext}`;
    const mimeType = recordingItem.mimeType || (ext === 'wav' ? 'audio/wav' : 'audio/mp3');

    // 1. Android Smartphone Native Storage Bridge
    if (window.AndroidStorage && typeof window.AndroidStorage.saveRecording === 'function') {
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!reader.result) return;
          const base64Data = reader.result.toString().split(',')[1];
          const saved = window.AndroidStorage.saveRecording(
            base64Data,
            filename,
            mimeType,
            recordingItem.songTitle || 'Karaoke Recording',
            recordingItem.artist || 'Karaoke Singer'
          );
          if (saved && typeof window.showToast === 'function') {
            window.showToast(`✓ Rekaman ${recordingItem.format} berhasil diunduh ke Musik/SUSHEE_Karaoke/`, 'success');
          }
        };
        reader.readAsDataURL(recordingItem.blob);
        return;
      } catch (err) {
        console.error('Native AndroidStorage error:', err);
      }
    }

    // 2. Web Browser Fallback
    const a = document.createElement('a');
    a.href = recordingItem.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 150);
  }
}

window.KaraokeRecorder = KaraokeRecorder;
