/**
 * SUSHEE Karaoke - Library Preferences (Favorites, Recently Sung, Custom Synced LRC)
 */
class LibraryPrefs {
  constructor() {
    this.favKey = 'sushee_favorites_v1';
    this.recentKey = 'sushee_recent_songs_v1';
    this.customLrcKey = 'sushee_custom_lrc_v1';
    this.maxRecent = 30;
    this.favorites = new Set(this._readJson(this.favKey, []));
    this.recentIds = this._readJson(this.recentKey, []);
    this.customLrcMap = this._readJson(this.customLrcKey, {});
  }

  _readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  _writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  isFavorite(songId) {
    return Boolean(songId && this.favorites.has(songId));
  }

  toggleFavorite(songId) {
    if (!songId) return false;
    let added = false;
    if (this.favorites.has(songId)) {
      this.favorites.delete(songId);
    } else {
      this.favorites.add(songId);
      added = true;
    }
    this._writeJson(this.favKey, Array.from(this.favorites));
    return added;
  }

  recordPlayed(songId) {
    if (!songId) return;
    this.recentIds = [songId, ...this.recentIds.filter(id => id !== songId)].slice(0, this.maxRecent);
    this._writeJson(this.recentKey, this.recentIds);
  }

  getRecentRank(songId) {
    const idx = this.recentIds.indexOf(songId);
    return idx === -1 ? 9999 : idx;
  }

  isRecent(songId) {
    return Boolean(songId && this.recentIds.includes(songId));
  }

  getCustomLrc(songId) {
    if (!songId) return null;
    return this.customLrcMap[songId] || null;
  }

  saveCustomLrc(songId, lrcText) {
    if (!songId || !lrcText) return;
    this.customLrcMap[songId] = lrcText;
    this._writeJson(this.customLrcKey, this.customLrcMap);
  }

  hasCustomLrc(songId) {
    return Boolean(songId && this.customLrcMap[songId]);
  }
}

window.LibraryPrefs = LibraryPrefs;
