/**
 * SUSHEE Karaoke - Offline Song Manager (Stage 2)
 * Stores downloaded audio & LRC files in IndexedDB (works on HTTPS, Capacitor, localhost, AND HTTP LAN)
 * and mirrors to Cache Storage when available for Service Worker interception.
 */
class OfflineSongManager {
  constructor() {
    this.dbName = 'SUSHEE_OfflineSongsDB';
    this.storeName = 'offline_songs';
    this.cacheName = 'sushee-offline-songs-v1';
    this.metaKey = 'sushee_offline_songs_meta';
    this.db = null;
    this.meta = this._loadMeta();
    this._activeBlobUrl = null;
    this._inFlight = new Set();
    this.ready = this._initDB();
  }

  _loadMeta() {
    try {
      const raw = localStorage.getItem(this.metaKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  _saveMeta() {
    try {
      localStorage.setItem(this.metaKey, JSON.stringify(this.meta));
    } catch (e) {}
  }

  _initDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  isOffline(songId) {
    return Boolean(songId && this.meta[songId]);
  }

  isDownloading(songId) {
    return this._inFlight.has(songId);
  }

  getSummary() {
    const entries = Object.values(this.meta);
    const totalBytes = entries.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    return { count: entries.length, totalBytes };
  }

  async _putRecord(record) {
    await this.ready;
    if (!this.db) throw new Error('IndexedDB tidak tersedia di perangkat ini.');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan ke penyimpanan offline.'));
    });
  }

  async _getRecord(songId) {
    await this.ready;
    if (!this.db || !songId) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const req = tx.objectStore(this.storeName).get(songId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async _deleteRecord(songId) {
    await this.ready;
    if (!this.db || !songId) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).delete(songId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async downloadSong(song) {
    if (!song || !song.id || !song.audioUrl) {
      throw new Error('Data lagu tidak valid untuk diunduh.');
    }
    if (this._inFlight.has(song.id)) return { alreadyInFlight: true };
    this._inFlight.add(song.id);

    try {
      const audioResp = await fetch(song.audioUrl, { mode: 'cors' });
      if (!audioResp.ok) {
        throw new Error(`Gagal mengunduh audio (HTTP ${audioResp.status})`);
      }
      const audioBlob = await audioResp.blob();

      let lrcText = song.lrcContent || null;
      if (!lrcText && song.lrcUrl) {
        try {
          const lrcResp = await fetch(song.lrcUrl, { mode: 'cors' });
          if (lrcResp.ok) lrcText = await lrcResp.text();
        } catch (e) {}
      }

      await this._putRecord({
        id: song.id,
        title: song.title || '',
        artist: song.artist || '',
        audioUrl: song.audioUrl,
        lrcUrl: song.lrcUrl || null,
        audioBlob,
        lrcText,
        sizeBytes: audioBlob.size,
        savedAt: Date.now()
      });

      // Best-effort mirror to Cache Storage (for SW when on HTTPS)
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(this.cacheName);
          await cache.put(song.audioUrl, new Response(audioBlob, {
            headers: { 'Content-Type': audioBlob.type || 'audio/mpeg' }
          }));
          if (song.lrcUrl && lrcText) {
            await cache.put(song.lrcUrl, new Response(lrcText, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            }));
          }
        } catch (e) {}
      }

      this.meta[song.id] = {
        id: song.id,
        title: song.title || '',
        sizeBytes: audioBlob.size,
        hasLyrics: Boolean(lrcText),
        savedAt: Date.now()
      };
      this._saveMeta();

      return { ok: true, sizeBytes: audioBlob.size };
    } finally {
      this._inFlight.delete(song.id);
    }
  }

  async removeSong(song) {
    const songId = typeof song === 'string' ? song : (song && song.id);
    if (!songId) return;

    await this._deleteRecord(songId);

    if (typeof caches !== 'undefined' && song && typeof song === 'object') {
      try {
        const cache = await caches.open(this.cacheName);
        if (song.audioUrl) await cache.delete(song.audioUrl);
        if (song.lrcUrl) await cache.delete(song.lrcUrl);
      } catch (e) {}
    }

    delete this.meta[songId];
    this._saveMeta();
  }

  async clearAll() {
    await this.ready;
    if (this.db) {
      await new Promise((resolve) => {
        try {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    if (typeof caches !== 'undefined') {
      try { await caches.delete(this.cacheName); } catch (e) {}
    }
    this.meta = {};
    this._saveMeta();
  }

  async getOfflinePlaybackData(song) {
    if (!song || !song.id || !this.isOffline(song.id)) return null;
    const rec = await this._getRecord(song.id);
    if (!rec || !rec.audioBlob) {
      // Stale metadata cleanup
      delete this.meta[song.id];
      this._saveMeta();
      return null;
    }

    if (this._activeBlobUrl) {
      try { URL.revokeObjectURL(this._activeBlobUrl); } catch (e) {}
      this._activeBlobUrl = null;
    }
    this._activeBlobUrl = URL.createObjectURL(rec.audioBlob);

    return {
      audioUrl: this._activeBlobUrl,
      lrcText: rec.lrcText || null
    };
  }
}

window.OfflineSongManager = OfflineSongManager;
