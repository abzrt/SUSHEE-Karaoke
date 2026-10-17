/**
 * Storage Scanner & Media Library Manager
 * Scans phone storage for audio (.mp3, .m4a) and lyric (.lrc) files
 * Auto-pairs audio with matching .lrc files and persists in IndexedDB
 */

class StorageScanner {
  constructor() {
    this.songs = [];
    this.lyricsMap = new Map(); // filename / cleanName -> File or text
    this.db = null;
    this.initIndexedDB();
  }

  async initIndexedDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        console.warn("IndexedDB not supported, falling back to in-memory.");
        return resolve([]);
      }
      try {
        const request = indexedDB.open('KaraokeStarDB', 2);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        this.loadSongsFromDB().then(resolve);
      };
      request.onerror = () => {
        console.warn("IndexedDB not available, using in-memory library.");
        resolve([]);
      };
      } catch (err) {
        console.warn("IndexedDB open failed:", err);
        resolve([]);
      }
    });
  }

  async loadSongsFromDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction('songs', 'readonly');
      const store = tx.objectStore('songs');
      const req = store.getAll();
      req.onsuccess = () => {
        // Filter out any legacy sample songs
        const saved = (req.result || []).filter(s => s.source !== 'sample' && !s.id.startsWith('sample_'));
        this.songs = saved.map(s => {
          if (s.audioBlob && !s.audioUrl) {
            s.audioUrl = URL.createObjectURL(s.audioBlob);
          }
          return s;
        });
        // Remove legacy sample songs from IndexedDB
        ['sample_bintang_kejora', 'sample_pop_beat'].forEach(id => this.deleteSongFromDB(id));
        resolve(this.songs);
      };
      req.onerror = () => {
        this.songs = [];
        resolve(this.songs);
      };
    });
  }

  async saveSongToDB(song) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('songs', 'readwrite');
      const store = tx.objectStore('songs');
      store.put(song);
    } catch (e) {
      console.warn("Could not save song to DB:", e);
    }
  }

  async deleteSongFromDB(id) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('songs', 'readwrite');
      tx.objectStore('songs').delete(id);
    } catch (e) {}
  }

  cleanBaseName(filename) {
    return filename.replace(/\.[^/.]+$/, '').trim().toLowerCase();
  }

  /**
   * Tokenize filename for smart fuzzy matching (handles AI stem suffixes, roformer, vocal/karaoke tags)
   */
  cleanTokens(name) {
    // 1. Remove audio or lyrics extension
    let stem = name.replace(/\.(mp3|m4a|wav|flac|ogg|lrc)$/i, '');
    // 2. Remove common vocal/stem suffixes
    stem = stem.replace(/(_vocals.*|_other.*|_instrumental.*|_roformer.*|bs_roformer.*|_karaoke.*)/i, '');
    // 3. Extract alphanumeric tokens
    const rawTokens = stem.toLowerCase().match(/[a-z0-9]+/g) || [];
    // 4. Filter technical metadata/model stopwords
    const stopwords = new Set(['mt', '81', '6', 'remaster', 'vocals', 'instrumental', 'karaoke', 'back', 'other']);
    return new Set(rawTokens.filter(t => !stopwords.has(t)));
  }

  /**
   * Scan using File System Access API (showDirectoryPicker) if supported
   */
  async scanDirectoryPicker() {
    if (!window.showDirectoryPicker) {
      throw new Error("Directory picker not supported, using file input fallback.");
    }

    const dirHandle = await window.showDirectoryPicker({
      mode: 'read'
    });

    const audioFiles = [];
    const lrcFiles = [];

    async function scanFolder(handle) {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const name = file.name.toLowerCase();
          if (/\.(mp3|m4a|wav|flac|ogg)$/i.test(name)) {
            audioFiles.push(file);
          } else if (name.endsWith('.lrc')) {
            lrcFiles.push(file);
          }
        } else if (entry.kind === 'directory') {
          // Recursive scan
          await scanFolder(entry);
        }
      }
    }

    await scanFolder(dirHandle);
    return await this.processFileList(audioFiles, lrcFiles);
  }

  /**
   * Process files obtained from <input type="file" webkitdirectory> or <input type="file" multiple>
   */
  async processInputFiles(fileList) {
    const audioFiles = [];
    const lrcFiles = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const name = file.name.toLowerCase();
      if (/\.(mp3|m4a|wav|flac|ogg)$/i.test(name)) {
        audioFiles.push(file);
      } else if (name.endsWith('.lrc')) {
        lrcFiles.push(file);
      }
    }

    return await this.processFileList(audioFiles, lrcFiles);
  }

  /**
   * Pair audio files (.mp3, .m4a, .wav) with .lrc lyrics by smart token matching and populate library
   */
  async processFileList(audioFiles, lrcFiles) {
    // 1. Index and tokenize all LRC files
    const lrcEntries = [];
    for (const lrcFile of lrcFiles) {
      const text = await lrcFile.text();
      const lrcTokens = this.cleanTokens(lrcFile.name);
      const base = this.cleanBaseName(lrcFile.name);

      // Extract metadata tags if present inside the LRC
      const tiMatch = text.match(/\[ti:\s*([^\]]+)\]/i);
      const arMatch = text.match(/\[ar:\s*([^\]]+)\]/i);

      let inferredTitle = tiMatch ? tiMatch[1].trim() : '';
      let inferredArtist = arMatch ? arMatch[1].trim() : '';

      if (!inferredTitle && lrcFile.name.includes(' - ')) {
        const parts = lrcFile.name.replace(/\.lrc$/i, '').split(' - ');
        inferredTitle = parts[0].trim();
        inferredArtist = parts.slice(1).join(' - ').trim();
      }

      lrcEntries.push({
        name: lrcFile.name,
        base: base,
        tokens: lrcTokens,
        content: text,
        title: inferredTitle,
        artist: inferredArtist
      });
    }

    // 2. Process Audio files with smart token matching
    const newSongs = [];
    for (const audioFile of audioFiles) {
      const base = this.cleanBaseName(audioFile.name);
      const audioTokens = this.cleanTokens(audioFile.name);
      const extension = audioFile.name.substring(audioFile.name.lastIndexOf('.')).toUpperCase();

      // Smart Matching Algorithm
      let matchedLrc = null;
      let highestOverlap = 0;

      for (const lrc of lrcEntries) {
        // Priority 1: Exact basename match
        if (base === lrc.base) {
          matchedLrc = lrc;
          highestOverlap = 999;
          break;
        }

        // Priority 2: Token overlap matching (e.g. Dayseeker + Neon + Grave)
        let overlap = 0;
        audioTokens.forEach(tok => {
          if (lrc.tokens.has(tok)) {
            overlap++;
          }
        });

        // If overlap >= 2 tokens and better than previous best
        if (overlap >= 2 && overlap > highestOverlap) {
          highestOverlap = overlap;
          matchedLrc = lrc;
        }
      }

      // Create object URL for audio playback
      const audioUrl = URL.createObjectURL(audioFile);

      // Determine clean Title & Artist
      let title = audioFile.name.replace(/\.[^/.]+$/, '');
      let artist = "Artis Lokal";

      if (matchedLrc && matchedLrc.title) {
        title = matchedLrc.title;
        artist = matchedLrc.artist || artist;
      } else if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        // Clean stem noise from title if raw stem
        title = title.replace(/(_vocals.*|_other.*|_instrumental.*|_roformer.*|bs_roformer.*)/i, '');
      }

      const songObj = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: title,
        artist: artist,
        format: extension,
        sizeBytes: audioFile.size,
        source: 'local',
        audioFile: audioFile,
        audioUrl: audioUrl,
        lrcContent: matchedLrc ? matchedLrc.content : null,
        hasLyrics: !!matchedLrc,
        dateAdded: new Date().toISOString()
      };

      newSongs.push(songObj);
      this.songs.unshift(songObj);

      // Save metadata and audio Blob for persistent playback
      this.saveSongToDB({
        id: songObj.id,
        title: songObj.title,
        artist: songObj.artist,
        format: songObj.format,
        source: 'local',
        audioBlob: audioFile,
        hasLyrics: songObj.hasLyrics,
        lrcContent: songObj.lrcContent,
        dateAdded: songObj.dateAdded
      });
    }

    return {
      addedCount: newSongs.length,
      lrcCount: lrcFiles.length,
      totalSongs: this.songs.length
    };
  }

  /**
   * Link an LRC file manually to an existing song
   */
  async linkLrcToSong(songId, lrcFile) {
    const song = this.songs.find(s => s.id === songId);
    if (!song) return false;

    const lrcText = await lrcFile.text();
    song.lrcContent = lrcText;
    song.hasLyrics = true;

    this.saveSongToDB({
      ...song,
      audioFile: undefined,
      audioUrl: undefined
    });

    return true;
  }

  loadSampleSongs() {
    this.songs = [];
  }
}

window.StorageScanner = StorageScanner;
