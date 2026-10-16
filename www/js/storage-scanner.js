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
    });
  }

  async loadSongsFromDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction('songs', 'readonly');
      const store = tx.objectStore('songs');
      const req = store.getAll();
      req.onsuccess = () => {
        const saved = req.result || [];
        // Combine with default sample songs if empty
        if (saved.length === 0) {
          this.loadSampleSongs();
        } else {
          this.songs = saved;
        }
        resolve(this.songs);
      };
      req.onerror = () => {
        this.loadSampleSongs();
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

      // Save metadata without file Blob
      this.saveSongToDB({
        id: songObj.id,
        title: songObj.title,
        artist: songObj.artist,
        format: songObj.format,
        source: 'local',
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

  /**
   * Pre-packaged royalty-free sample songs with synchronized lyrics
   */
  loadSampleSongs() {
    // Generate clean synthesized acoustic audio tone tracks for demo
    const sample1 = {
      id: 'sample_bintang_kejora',
      title: 'Bintang Kejora (Karaoke)',
      artist: 'Studio Vokal Indonesia',
      format: '.MP3',
      source: 'sample',
      hasLyrics: true,
      audioUrl: this.createSyntheticBackingTrack('c_major'),
      lrcContent: LrcParser.getSampleLrc('Bintang Kejora', 'Studio Vokal Indonesia'),
      dateAdded: new Date().toISOString()
    };

    const sample2 = {
      id: 'sample_pop_beat',
      title: 'Panggung Impian (Acoustic Pop)',
      artist: 'StarMaker Ensemble',
      format: '.M4A',
      source: 'sample',
      hasLyrics: true,
      audioUrl: this.createSyntheticBackingTrack('g_pop'),
      lrcContent: `[ti:Panggung Impian]
[ar:StarMaker Ensemble]
[00:00.00]♪ Intro Melodi Pop Acoustic ♪
[00:04.00]Langkah demi langkah menuju cahaya
[00:08.50]Membawa mimpi di dalam jiwa
[00:13.00]Takkan ragu untuk bernyanyi
[00:17.50]Biarkan dunia mendengar suara ini
[00:23.00]♪ Chorus Pop ♪
[00:27.00]Inilah panggung impian kita
[00:31.50]Harmoni indah merangkai rasa
[00:36.00]Nyanyikan lagu penuh ceria
[00:41.00]Bersama SUSHEE selamanya!
[00:48.00]♪ Outro Pop Melody ♪`,
      dateAdded: new Date().toISOString()
    };

    this.songs = [sample1, sample2];
  }

  /**
   * Synthesize a soothing backing track WAV blob on the fly so karaoke works offline instantly!
   */
  createSyntheticBackingTrack(style = 'c_major') {
    const sampleRate = 44100;
    const duration = 85; // 85 seconds backing music
    const numSamples = sampleRate * duration;
    const buffer = new Float32Array(numSamples);

    // Chord progressions (C - G - Am - F)
    const chords = [
      [261.63, 329.63, 392.00], // C major
      [196.00, 246.94, 293.66], // G major
      [220.00, 261.63, 330.00], // A minor
      [174.61, 220.00, 261.63]  // F major
    ];

    const chordDuration = 4; // seconds per chord
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const chordIndex = Math.floor(t / chordDuration) % chords.length;
      const currentChord = chords[chordIndex];
      
      // Arpeggiated guitar/piano synth note
      const arpSpeed = 0.5; // seconds per note
      const noteIndex = Math.floor((t % chordDuration) / arpSpeed) % currentChord.length;
      const freq = currentChord[noteIndex];
      
      // Note envelope (decay)
      const noteTime = (t % chordDuration) % arpSpeed;
      const envelope = Math.exp(-noteTime * 3);

      // Bass note
      const bassFreq = currentChord[0] / 2;
      const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.25;

      // Melody tone + harmonic
      const tone = (Math.sin(2 * Math.PI * freq * t) * 0.4 +
                    Math.sin(2 * Math.PI * freq * 2 * t) * 0.15) * envelope;

      // Gentle rhythm pulse
      const kickTime = t % 1.0;
      const kick = kickTime < 0.1 ? Math.sin(2 * Math.PI * 65 * (1 - kickTime * 10) * kickTime) * 0.3 : 0;

      buffer[i] = Math.max(-1, Math.min(1, (tone + bass + kick) * 0.5));
    }

    return this.encodeWAV(buffer, sampleRate);
  }

  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // 16 bits per sample
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

window.StorageScanner = StorageScanner;
