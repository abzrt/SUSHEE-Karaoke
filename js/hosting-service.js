/**
 * SUSHEE Karaoke - PHP Web Hosting Server Service
 * Streaming and syncing songs & lyrics directly from personal PHP web hosting (e.g. my.php.id / cPanel)
 */

class HostingServerService {
  constructor() {
    // Clean up any deprecated Google Drive configurations from previous versions
    const legacyGdriveKeys = [
      'gdrive_folder_id',
      'gdrive_folder_url',
      'gdrive_api_key',
      'gdrive_webapp_url',
      'sushee_custom_gdrive_songs'
    ];
    legacyGdriveKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });

    const defaultUrl = 'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/SONGS/api.php';
    let savedUrl = '';
    try {
      savedUrl = localStorage.getItem('sushee_hosting_url') || '';
    } catch (e) {}

    // If saved URL is invalid or dummy example, revert to the verified default URL
    if (!savedUrl || savedUrl.includes('domainanda') || savedUrl.includes('example.com') || savedUrl.trim() === '') {
      savedUrl = defaultUrl;
    }

    this.serverUrl = this.cleanUrl(savedUrl);
    this.cachedSongs = [];
    this.isConnected = false;
    this._rtMetaCache = {};
    this._rtInFlight = new Set();

    try {
      const rtCached = localStorage.getItem('sushee_rt_meta_cache_v1');
      if (rtCached) {
        const parsedRt = JSON.parse(rtCached);
        if (parsedRt && typeof parsedRt === 'object') this._rtMetaCache = parsedRt;
      }
      if (localStorage.getItem('sushee_meta_cache_v') !== '2') {
        localStorage.removeItem('sushee_cached_hosting_songs');
        localStorage.setItem('sushee_meta_cache_v', '2');
      }
    } catch (e) {}

    // Load instantly from persistent cache if available
    try {
      const cached = localStorage.getItem('sushee_cached_hosting_songs');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.cachedSongs = parsed;
          this.isConnected = true;
        }
      }
    } catch (e) {}

    // Instant offline/first-load fallback: load pre-bundled verified server catalog (59 songs)
    const gObj = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    const bundled = (gObj && Array.isArray(gObj.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? gObj.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
    if (this.cachedSongs.length === 0 && bundled.length > 0) {
      this.cachedSongs = [...bundled];
      this.isConnected = true;
    }

    if (this.cachedSongs.length > 0) {
      this.cachedSongs = this.cachedSongs.map(s => this.cleanSongMetadata(s));
    }

    this._activeSearchPromise = null;
    this._activeSearchQuery = null;
  }

  /**
   * Intelligently clean AI stem artifacts (roformer, bs_roformer, mt_81, other) and extract artist/title
   */
  cleanSongMetadata(song) {
    if (!song) return song;
    const rtKey = song.id || song.filename;
    const rtHit = rtKey && this._rtMetaCache && this._rtMetaCache[rtKey];
    if (rtHit && rtHit.title && rtHit.artist) {
      return { ...song, title: rtHit.title, artist: rtHit.artist };
    }

    let title = (song.title || '').trim();
    let artist = (song.artist || '').trim();
    const rawFile = (song.filename || '').trim();

    const stemPattern = /(_+(bs_roformer|roformer|mel_band|mdx|demucs|mt_\d+|mt\s*\d+|demon[-_]voices|other|vocals[-_]back|vocals|instrumental|karaoke|drums|bass|lead|backing|stem)[^.]*)/gi;
    const titleStemPattern = /\b(bs\s+roformer(\s+mt\s*\d+)?|roformer|other|vocals\s+back|instrumental|karaoke\s+track)\b/gi;

    const hasBadArtist = !artist || artist === 'Karaoke Track' || /^p\s+o\s+m\s+e$/i.test(artist);
    const hasBadTitle = !title || titleStemPattern.test(title) || stemPattern.test(title);
    const needsCleaning = hasBadArtist || hasBadTitle;

    if (needsCleaning) {
      let resolvedFromLrc = false;
      if (song.lrcUrl) {
        try {
          const lrcBase = decodeURIComponent(song.lrcUrl.split('/').pop() || '').replace(/\.lrc$/i, '').replace(/\s*\(\d+\)$/, '').trim();
          if (lrcBase.includes(' - ')) {
            const lrcParts = lrcBase.split(' - ');
            const lrcTitle = lrcParts[0].trim();
            const lrcArtist = lrcParts.slice(1).join(' - ').trim();
            if (lrcTitle && lrcArtist && !/^p\s+o\s+m\s+e$/i.test(lrcArtist)) {
              title = lrcTitle;
              artist = lrcArtist;
              resolvedFromLrc = true;
            }
          }
        } catch (e) {}
      }

      if (!resolvedFromLrc) {
      let base = rawFile ? rawFile.replace(/\.[^/.]+$/, '') : title;
      base = base.replace(stemPattern, '');
      base = base.replace(/(_+other|_vocals-back|_vocals|_instrumental|_karaoke|-karaoke|\(karaoke\)|\(instrumental\)|\(\d+\))$/gi, '');

      if (base.includes(' - ')) {
        const parts = base.split(' - ');
        title = parts[0].trim();
        artist = parts[1].trim();
      } else {
        const words = base.replace(/[-_]+/g, ' ').trim();
        const lower = words.toLowerCase();
        const knownArtists = [
          'muse', 'paramore', 'seventeen', 'sideline', 'wind walkers', 'evanescence',
          'charlie puth', 'bad omens', 'dark sarah', 'harra', 'ira green', 'karmin',
          'ophidian rite', 'rain division', 'scary pockets', 'shadow of intent',
          'the pretty wild', 'within temptation', 'xandria', 'zhiend', 'last goal! party', 'last goal party',
          'dayseeker', 'lifehouse', 'overgrown', 'the offspring', 'keenan te', 'gwen stefani',
          'hoobastank', 'incubus', 'i prevail', 'hindia', 'maroon 5', 'daughtry', 'benson boone',
          'pierce the veil', 'bruno mars', '311', 'kilms', 'putri ariani', 'spoon',
          'thousand below', 'padi', 'hailee steinfeld', 'alien ant farm', 'red hot chilli peppers', 'red hot chili peppers',
          'michelle branch', 'garbage', 'dua lipa', 'bernadya', 'naff', 'bring me the horizon',
          'st loco', 'battle beast'
        ];

        let foundArtist = null;
        let remainingTitle = words;

        for (const art of knownArtists) {
          if (lower.startsWith(art + ' ')) {
            foundArtist = words.slice(0, art.length);
            remainingTitle = words.slice(art.length).trim();
            break;
          } else if (lower.endsWith(' ' + art)) {
            foundArtist = words.slice(words.length - art.length);
            remainingTitle = words.slice(0, words.length - art.length).trim();
            break;
          } else if (lower.includes(' ' + art + ' ')) {
            const idx = lower.indexOf(art);
            foundArtist = words.slice(idx, idx + art.length);
            const before = words.slice(0, idx).trim();
            const after = words.slice(idx + art.length).replace(/\b(epic|orchestral|cover|band|version)\b/gi, '').trim();
            remainingTitle = (before + ' ' + after).trim();
            break;
          }
        }

        if (!foundArtist && base.includes('-')) {
          const p = base.split('-');
          foundArtist = p[0].trim();
          remainingTitle = p.slice(1).join(' ').trim();
        }

        const uc = s => (s || '').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        if (foundArtist) {
          artist = uc(foundArtist);
          title = uc(remainingTitle.replace(titleStemPattern, '').trim());
        } else {
          title = uc(words.replace(titleStemPattern, '').trim());
          if (!artist || artist === 'Karaoke Track') artist = 'Karaoke Track';
        }
      }
      }
    }

    return {
      ...song,
      title: title || song.title,
      artist: (artist && artist !== 'Karaoke Track') ? artist : (song.artist || 'Karaoke Track')
    };
  }

  /**
   * Client-side instantaneous 0ms filtering from memory cache
   */
  getFilteredCache(query = '') {
    const q = (query || '').toLowerCase().trim();

    // Self-healing: if cachedSongs is empty, attempt immediate recharge from bundled catalog
    if (this.cachedSongs.length === 0) {
      const gObj = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
      const bundled = (gObj && Array.isArray(gObj.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? gObj.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
      if (bundled.length > 0) {
        this.cachedSongs = [...bundled];
        this.isConnected = true;
      }
    }

    if (!q) return [...this.cachedSongs];
    return this.cachedSongs.filter(s =>
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.artist && s.artist.toLowerCase().includes(q))
    );
  }

  /**
   * Helper to safely format, validate, and encode URLs with spaces and auto-resolve api.php
   */
  cleanUrl(url) {
    let clean = (url || '').trim();
    if (!clean) return '';

    // Auto-prepend https:// if no protocol provided
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }

    // Auto-upgrade http:// to https:// on secure contexts (PWA, HTTPS, Capacitor) to prevent Mixed Content blocking
    const isPageSecure = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
    const isLocalHost = clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('192.168.') || clean.includes('10.');
    if (isPageSecure && !isLocalHost && clean.startsWith('http://')) {
      clean = clean.replace(/^http:\/\//i, 'https://');
    }

    // Auto-append api.php if user entered only the folder path (e.g. https://domain.com/songs or https://domain.com/songs/)
    try {
      const parts = clean.split('?');
      let pathPart = parts[0].replace(/\/+$/, '');
      const queryPart = parts.length > 1 ? '?' + parts.slice(1).join('?') : '';

      if (!pathPart.toLowerCase().endsWith('.php') && !pathPart.toLowerCase().match(/\.(mp3|m4a|wav|lrc|ogg|flac)$/i)) {
        clean = pathPart + '/api.php' + queryPart;
      }
    } catch (e) {}

    try {
      // Decode then encode to guarantee proper %20 encoding for spaces
      clean = encodeURI(decodeURI(clean));
    } catch (e) {}
    return clean;
  }

  /**
   * Resilient HTTP fetch with automatic retry and exponential backoff
   */
  async fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 18000) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timer);
        return resp;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        // Don't retry if manually aborted by user
        if (err.name === 'AbortError' && attempt >= retries) {
          break;
        }
        if (attempt < retries) {
          // Exponential backoff delay (400ms, 800ms)
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }

  /**
   * Check if server endpoint is configured
   */
  isConfigured() {
    return Boolean(this.serverUrl && this.serverUrl.trim().length > 0);
  }

  /**
   * Save and validate user's custom PHP Hosting API URL
   */
  saveServerUrl(url) {
    const cleanUrl = this.cleanUrl(url);
    this.serverUrl = cleanUrl;
    try {
      if (cleanUrl) {
        localStorage.setItem('sushee_hosting_url', cleanUrl);
      } else {
        localStorage.removeItem('sushee_hosting_url');
      }
    } catch (e) {}
  }

  /**
   * Test connection to personal hosting endpoint with resilient retry
   */
  async testConnection(url) {
    let target = this.cleanUrl(url || this.serverUrl);
    if (!target) throw new Error("URL Server belum diisi.");

    try {
      const resp = await this.fetchWithRetry(target, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }, 1, 18000);

      if (!resp.ok) {
        throw new Error(`Server merespons status HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (data && (data.status === 'success' || Array.isArray(data.songs))) {
        const rawList = Array.isArray(data.songs) ? data.songs : [];
        const songsList = rawList.map(s => this.cleanSongMetadata(s));
        this.isConnected = true;
        this.cachedSongs = songsList;
        this.saveServerUrl(target);

        // Persist songs in local cache for 0ms subsequent loads
        try {
          localStorage.setItem('sushee_cached_hosting_songs', JSON.stringify(songsList));
        } catch (e) {}

        return {
          success: true,
          total: data.total || songsList.length,
          songs: songsList
        };
      } else {
        throw new Error(data.message || "Format data JSON dari server tidak sesuai.");
      }
    } catch (err) {
      this.isConnected = false;
      if (err.name === 'AbortError') {
        throw new Error("Koneksi timeout. Pastikan server hosting aktif dan internet stabil.");
      }
      throw err;
    }
  }

  /**
   * Fetch songs from PHP Hosting server with search query support & resilient cache fallback
   */
  async searchSongs(query = '') {
    const q = (query || '').toLowerCase().trim();

    // 1. If an identical search is already in flight, reuse the active promise
    if (this._activeSearchPromise && this._activeSearchQuery === q) {
      return this._activeSearchPromise;
    }

    if (!this.serverUrl) {
      return this.getFilteredCache(q);
    }

    this._activeSearchQuery = q;
    this._activeSearchPromise = (async () => {
      try {
        const cleanBase = this.cleanUrl(this.serverUrl);
        if (!cleanBase) {
          return this.getFilteredCache(q);
        }

        let fetchUrl = cleanBase;
        if (q) {
          const sep = cleanBase.includes('?') ? '&' : '?';
          fetchUrl = `${cleanBase}${sep}q=${encodeURIComponent(q)}`;
        }

        const resp = await this.fetchWithRetry(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }, 1, 15000);

        if (resp && resp.ok) {
          const data = await resp.json();
          if (data && (data.status === 'success' || Array.isArray(data.songs))) {
            const rawList = Array.isArray(data.songs) ? data.songs : [];
            const list = rawList.map(s => this.cleanSongMetadata(s));
            this.isConnected = true;
            if (!q && list.length > 0) {
              this.cachedSongs = list;
              try {
                localStorage.setItem('sushee_cached_hosting_songs', JSON.stringify(list));
              } catch (e) {}
            }
            return list;
          }
        }
      } catch (err) {
        console.warn("Notice: Menghubungi remote hosting gagal atau lambat, beralih ke cache offline:", err);
      } finally {
        this._activeSearchPromise = null;
      }

      // Always return filtered local/cached songs without crashing or rendering empty
      return this.getFilteredCache(q);
    })();

    return this._activeSearchPromise;
  }

  /**
   * Fetch synced LRC lyrics file directly via HTTP with safety timeout
   */
  async fetchLrcContent(lrcUrl) {
    if (!lrcUrl) return null;
    try {
      const cleanUrl = this.cleanUrl(lrcUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(cleanUrl, { 
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        return await resp.text();
      }
    } catch (err) {
      console.warn("Gagal mengunduh file LRC dari hosting:", err);
    }
    return null;
  }

  /**
   * Determine if a song's title/artist should be verified in real-time via iTunes Search API
   */
  needsRealtimeMetadataLookup(song) {
    if (!song) return false;
    const key = song.id || song.filename;
    if (!key) return false;
    if (this._rtMetaCache && this._rtMetaCache[key]) return false;
    if (this._rtInFlight && this._rtInFlight.has(key)) return false;
    const artist = (song.artist || '').trim();
    const title = (song.title || '').trim();
    if (!artist || artist === 'Karaoke Track' || /^p\s+o\s+m\s+e$/i.test(artist)) return true;
    if (!song.lrcUrl) return true;
    if (artist.split(/\s+/).length === 1 && title.split(/\s+/).length >= 3 && (song.filename || '').includes('-')) return true;
    return false;
  }

  /**
   * Real-time online lookup (iTunes Search API) to verify & fix wrong song titles/artists.
   * Uses strict >=75% token overlap validation to prevent false positives and caches results locally.
   */
  async resolveSongMetadataRealtime(songs, onUpdate) {
    if (!Array.isArray(songs) || songs.length === 0 || typeof fetch !== 'function') return;
    const queue = songs.filter(s => this.needsRealtimeMetadataLookup(s));
    if (queue.length === 0) return;

    const stemPattern = /(_+(bs_roformer|roformer|mel_band|mdx|demucs|mt_\d+|mt\s*\d+|demon[-_]voices|other|vocals[-_]back|vocals|instrumental|karaoke|drums|bass|lead|backing|stem)[^.]*)/gi;
    const stopWords = new Set(['acoustic', 'version', 'live', 'remaster', 'remastered', 'feat', 'ft', 'official', 'video', 'audio', 'lyric', 'lyrics', 'cover', 'epic', 'orchestral', 'cinematic', 'band', 'single', 'edit', 'radio', 'mix', '2008', '2026']);
    const tokenize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const coreTokens = (s) => tokenize(s).filter(w => w.length >= 2 && !stopWords.has(w));

    const saveCache = () => {
      try {
        localStorage.setItem('sushee_rt_meta_cache_v1', JSON.stringify(this._rtMetaCache));
        if (this.cachedSongs && this.cachedSongs.length > 0) {
          localStorage.setItem('sushee_cached_hosting_songs', JSON.stringify(this.cachedSongs));
        }
      } catch (e) {}
    };

    const resolveOne = async (song) => {
      const key = song.id || song.filename;
      if (!key || this._rtInFlight.has(key) || this._rtMetaCache[key]) return;
      this._rtInFlight.add(key);
      try {
        const rawBase = (song.filename ? song.filename.replace(/\.[^/.]+$/, '') : `${song.artist || ''} ${song.title || ''}`)
          .replace(stemPattern, '').replace(/[-_]+/g, ' ').trim();
        const qTokens = coreTokens(rawBase);
        if (qTokens.length < 2) {
          this._rtMetaCache[key] = { keep: true };
          return;
        }
        const term = qTokens.join(' ');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp || !resp.ok) return;
        const data = await resp.json();
        const results = (data && Array.isArray(data.results)) ? data.results : [];

        let best = null;
        let bestScore = 0;
        for (const r of results) {
          if (!r.trackName || !r.artistName) continue;
          const cArtist = new Set(tokenize(r.artistName));
          const cTrack = new Set(tokenize(r.trackName));
          const cAll = new Set([...cArtist, ...cTrack]);
          let matched = 0, artistHits = 0, trackHits = 0;
          for (const t of qTokens) {
            if (cAll.has(t)) matched++;
            if (cArtist.has(t)) artistHits++;
            if (cTrack.has(t)) trackHits++;
          }
          const ratio = matched / qTokens.length;
          if (ratio >= 0.75 && artistHits >= 1 && trackHits >= 1 && ratio > bestScore) {
            bestScore = ratio;
            best = r;
          }
        }

        if (best) {
          let resolvedTitle = best.trackName.trim();
          const resolvedArtist = best.artistName.trim();
          if (/\bacoustic\b/i.test(rawBase) && !/\bacoustic\b/i.test(resolvedTitle)) {
            resolvedTitle = `${resolvedTitle} (Acoustic)`;
          }
          this._rtMetaCache[key] = { title: resolvedTitle, artist: resolvedArtist };
          const changed = (song.title !== resolvedTitle || song.artist !== resolvedArtist);
          song.title = resolvedTitle;
          song.artist = resolvedArtist;
          const idx = this.cachedSongs.findIndex(cs => (cs.id && cs.id === song.id) || (cs.filename && cs.filename === song.filename));
          if (idx >= 0) {
            this.cachedSongs[idx] = { ...this.cachedSongs[idx], title: resolvedTitle, artist: resolvedArtist };
          }
          saveCache();
          if (changed && typeof onUpdate === 'function') {
            onUpdate(song);
          }
        } else {
          this._rtMetaCache[key] = { keep: true };
          saveCache();
        }
      } catch (e) {
        // Network/timeout error: do not cache failure so it retries next time online
      } finally {
        this._rtInFlight.delete(key);
      }
    };

    // Polite concurrency of 2 to avoid API throttling while keeping UI responsive
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const nextSong = queue[cursor++];
        await resolveOne(nextSong);
      }
    };
    await Promise.all([worker(), worker()]);
  }
}

// Export instance globally
window.HostingServerService = HostingServerService;
