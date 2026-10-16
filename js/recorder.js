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

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.isRecording = false;
        resolve(null);
        return;
      }

      const durationSec = Math.round((Date.now() - this.recordingStartTime) / 1000);

      this.mediaRecorder.addEventListener('stop', () => {
        resolve({
          blob: this.currentRecordingBlob,
          url: this.currentRecordingUrl,
          duration: durationSec
        });
      }, { once: true });

      this.mediaRecorder.stop();
    });
  }

  saveCurrentRecording(songTitle, artist, presetName, durationSec) {
    if (!this.currentRecordingBlob) return null;

    const recItem = {
      id: 'rec_' + Date.now(),
      songTitle: songTitle || 'Lagu Tanpa Judul',
      artist: artist || 'Karaoke Singer',
      preset: presetName || 'Studio Pro',
      duration: durationSec || 0,
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

    const ext = recordingItem.blob.type.includes('mp4') ? 'm4a' :
                recordingItem.blob.type.includes('ogg') ? 'ogg' : 'webm';
    const filename = `Karaoke_${recordingItem.songTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;

    const a = document.createElement('a');
    a.href = recordingItem.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

window.KaraokeRecorder = KaraokeRecorder;
