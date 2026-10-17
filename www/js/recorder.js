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
    this.initDB();
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
          // Regenerate object URLs from saved Blobs
          this.recordings.forEach(rec => {
            if (rec.blob && !rec.url) {
              rec.url = URL.createObjectURL(rec.blob);
            }
          });
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

  async convertToMp3(rawBlob, kbps = 320) {
    if (!window.lamejs || typeof window.lamejs.Mp3Encoder !== 'function') {
      console.warn("lamejs Mp3Encoder not available. Returning raw blob.");
      return rawBlob;
    }

    try {
      const arrayBuffer = await rawBlob.arrayBuffer();
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioCtxClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);

      const numChannels = Math.min(2, audioBuffer.numberOfChannels);
      const sampleRate = audioBuffer.sampleRate;
      const targetKbps = kbps || 320;
      const encoder = new window.lamejs.Mp3Encoder(numChannels, sampleRate, targetKbps);

      const leftFloat = audioBuffer.getChannelData(0);
      const rightFloat = numChannels > 1 ? audioBuffer.getChannelData(1) : leftFloat;
      const numSamples = leftFloat.length;

      const left = new Int16Array(numSamples);
      const right = new Int16Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const l = Math.max(-1, Math.min(1, leftFloat[i]));
        left[i] = l < 0 ? l * 0x8000 : l * 0x7FFF;

        const r = Math.max(-1, Math.min(1, rightFloat[i]));
        right[i] = r < 0 ? r * 0x8000 : r * 0x7FFF;
      }

      const mp3Data = [];
      const sampleBlockSize = 1152;

      for (let i = 0; i < numSamples; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize);
        const rightChunk = numChannels > 1 ? right.subarray(i, i + sampleBlockSize) : leftChunk;
        const mp3buf = numChannels > 1
          ? encoder.encodeBuffer(leftChunk, rightChunk)
          : encoder.encodeBuffer(leftChunk);

        if (mp3buf && mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
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
      console.log(`✓ MP3 ${targetKbps} Kbps conversion complete. Size: ${(mp3Blob.size / 1024).toFixed(1)} KB`);
      return mp3Blob;
    } catch (err) {
      console.error("Failed to convert audio to MP3 320kbps:", err);
      return rawBlob;
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.isRecording = false;
        resolve(null);
        return;
      }

      const durationSec = Math.round((Date.now() - this.recordingStartTime) / 1000);

      this.mediaRecorder.addEventListener('stop', async () => {
        // Automatically convert the recorded session to pure MP3 320 Kbps!
        const kbps = parseInt(localStorage.getItem('karaoke_audio_quality') || '320', 10) || 320;
        const mp3Blob = await this.convertToMp3(this.currentRecordingBlob, kbps);
        this.currentRecordingBlob = mp3Blob;
        this.currentRecordingUrl = URL.createObjectURL(mp3Blob);

        resolve({
          blob: this.currentRecordingBlob,
          url: this.currentRecordingUrl,
          duration: durationSec,
          format: 'mp3',
          kbps: kbps
        });
      }, { once: true });

      this.mediaRecorder.stop();
    });
  }

  saveCurrentRecording(songTitle, artist, presetName, durationSec) {
    if (!this.currentRecordingBlob) return null;

    const kbps = parseInt(localStorage.getItem('karaoke_audio_quality') || '320', 10) || 320;
    const recItem = {
      id: 'rec_' + Date.now(),
      songTitle: songTitle || 'Lagu Tanpa Judul',
      artist: artist || 'Karaoke Singer',
      preset: presetName || 'Studio Pro',
      duration: durationSec || 0,
      format: 'MP3 ' + kbps + 'k',
      blob: this.currentRecordingBlob,
      url: this.currentRecordingUrl,
      date: new Date().toISOString()
    };

    this.recordings.unshift(recItem);
    this.saveRecordingToDB(recItem);
    return recItem;
  }

  downloadRecording(recordingItem) {
    if (!recordingItem || !recordingItem.blob) return;

    const cleanTitle = (recordingItem.songTitle || 'Song').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `Karaoke_${cleanTitle}_${Date.now()}.mp3`;
    const mimeType = 'audio/mp3';

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
            window.showToast('✓ Rekaman MP3 (320 Kbps) tersimpan di memori HP (Musik/SUSHEE_Karaoke)', 'success');
          }
        };
        reader.readAsDataURL(recordingItem.blob);
        return;
      } catch (err) {
        console.error('Native AndroidStorage error:', err);
      }
    }

    // 2. Browser / PC Fallback
    const a = document.createElement('a');
    a.href = recordingItem.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof window.showToast === 'function') {
      window.showToast('✓ Mengunduh file rekaman MP3: ' + filename, 'info');
    }
  }
}

window.KaraokeRecorder = KaraokeRecorder;
