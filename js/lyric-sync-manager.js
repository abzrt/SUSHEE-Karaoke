/**
 * SUSHEE Karaoke - Per-Song Lyric Sync Offset Manager (Stage 4 Modularization)
 * Persists millisecond timing offsets per song ID in localStorage and computes adjusted sync/seek timestamps.
 */
class LyricSyncManager {
  constructor(storageKey = 'sushee_lyric_offsets') {
    this.storageKey = storageKey;
    this.minMs = -5000;
    this.maxMs = 5000;
    this.currentSongId = null;
    this.currentOffsetMs = 0;
  }

  _loadMap() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  _saveMap(map) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
    } catch (e) {}
  }

  clamp(ms) {
    const val = parseInt(ms, 10);
    if (isNaN(val)) return 0;
    return Math.max(this.minMs, Math.min(this.maxMs, val));
  }

  getOffset(songId) {
    if (!songId) return 0;
    const map = this._loadMap();
    return this.clamp(map[songId] || 0);
  }

  setOffset(songId, offsetMs) {
    const clamped = this.clamp(offsetMs);
    if (songId) {
      const map = this._loadMap();
      if (clamped === 0) delete map[songId];
      else map[songId] = clamped;
      this._saveMap(map);
    }
    if (songId === this.currentSongId || !songId) {
      this.currentOffsetMs = clamped;
    }
    return clamped;
  }

  selectSong(songId) {
    this.currentSongId = songId || null;
    this.currentOffsetMs = this.getOffset(this.currentSongId);
    return this.currentOffsetMs;
  }

  step(deltaMs) {
    return this.setOffset(this.currentSongId, this.currentOffsetMs + (parseInt(deltaMs, 10) || 0));
  }

  reset() {
    return this.setOffset(this.currentSongId, 0);
  }

  getAdjustedTime(audioTimeSec) {
    return Math.max(0, (Number(audioTimeSec) || 0) + (this.currentOffsetMs / 1000));
  }

  getSeekTime(lyricTimeSec) {
    return Math.max(0, (Number(lyricTimeSec) || 0) - (this.currentOffsetMs / 1000));
  }

  formatDisplay(ms = this.currentOffsetMs) {
    return (ms > 0 ? '+' : '') + ms + ' ms';
  }
}

window.LyricSyncManager = LyricSyncManager;
