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
  }

  /**
   * Helper to safely format and encode URLs with spaces
   */
  cleanUrl(url) {
    let clean = (url || '').trim();
    if (!clean) return '';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    try {
      // Decode then encode to guarantee proper %20 encoding for spaces
      clean = encodeURI(decodeURI(clean));
    } catch (e) {}
    return clean;
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
   * Test connection to personal hosting endpoint
   */
  async testConnection(url) {
    let target = this.cleanUrl(url || this.serverUrl);
    if (!target) throw new Error("URL Server belum diisi.");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const resp = await fetch(target, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Server merespons status HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (data && (data.status === 'success' || Array.isArray(data.songs))) {
        const songsList = Array.isArray(data.songs) ? data.songs : [];
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
      clearTimeout(timeoutId);
      this.isConnected = false;
      if (err.name === 'AbortError') {
        throw new Error("Koneksi timeout (12 detik). Pastikan server aktif dan dapat diakses.");
      }
      throw err;
    }
  }

  /**
   * Fetch songs from PHP Hosting server with search query support
   */
  async searchSongs(query = '') {
    const q = (query || '').toLowerCase().trim();

    if (this.serverUrl) {
      try {
        const cleanTarget = this.cleanUrl(this.serverUrl);
        const urlObj = new URL(cleanTarget);
        if (q) {
          urlObj.searchParams.set('q', q);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const resp = await fetch(urlObj.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          if (data && (data.status === 'success' || Array.isArray(data.songs))) {
            const list = Array.isArray(data.songs) ? data.songs : [];
            this.isConnected = true;
            if (!q) {
              this.cachedSongs = list;
              try {
                localStorage.setItem('sushee_cached_hosting_songs', JSON.stringify(list));
              } catch (e) {}
            }
            return list;
          }
        }
      } catch (err) {
        console.warn("Gagal menghubungi server hosting:", err);
        // Fallback to cache
        if (this.cachedSongs.length > 0) {
          return this.cachedSongs.filter(s => 
            !q || (s.title && s.title.toLowerCase().includes(q)) || 
            (s.artist && s.artist.toLowerCase().includes(q))
          );
        }
      }
    }

    // Return cached songs if available
    if (this.cachedSongs.length > 0) {
      return this.cachedSongs.filter(s => 
        !q || (s.title && s.title.toLowerCase().includes(q)) || 
        (s.artist && s.artist.toLowerCase().includes(q))
      );
    }

    this.isConnected = false;
    return [];
  }

  /**
   * Fetch synced LRC lyrics file directly via HTTP
   */
  async fetchLrcContent(lrcUrl) {
    if (!lrcUrl) return null;
    try {
      const cleanUrl = this.cleanUrl(lrcUrl);
      const resp = await fetch(cleanUrl, { cache: 'no-store' });
      if (resp.ok) {
        return await resp.text();
      }
    } catch (err) {
      console.warn("Gagal mengunduh file LRC dari hosting:", err);
    }
    return null;
  }
}

// Export instance globally
window.HostingServerService = HostingServerService;
