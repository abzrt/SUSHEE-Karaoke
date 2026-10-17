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

    // Active PHP Hosting Server Endpoint
    this.serverUrl = localStorage.getItem('sushee_hosting_url') || 'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/SONGS/api.php';
    this.cachedSongs = [];
    this.isConnected = false;

    // No demo songs (removed upon user request)
    this.sampleCatalog = [];
  }

  /**
   * Save and validate user's custom PHP Hosting API URL
   */
  saveServerUrl(url) {
    let cleanUrl = (url || '').trim();
    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
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
    let target = (url || this.serverUrl || '').trim();
    if (!target) throw new Error("URL Server belum diisi.");

    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

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
      if (data && data.status === 'success') {
        this.isConnected = true;
        this.saveServerUrl(target);
        return {
          success: true,
          total: data.total || 0,
          songs: data.songs || []
        };
      } else {
        throw new Error(data.message || "Format data JSON dari server tidak sesuai.");
      }
    } catch (err) {
      clearTimeout(timeoutId);
      this.isConnected = false;
      if (err.name === 'AbortError') {
        throw new Error("Koneksi timeout (10 detik). Pastikan server aktif.");
      }
      throw err;
    }
  }

  /**
   * Fetch songs from PHP Hosting server with search query support
   */
  async searchSongs(query = '') {
    const q = (query || '').toLowerCase().trim();

    // 1. If user has configured their hosting endpoint
    if (this.serverUrl) {
      try {
        const urlObj = new URL(this.serverUrl);
        if (q) urlObj.searchParams.set('q', q);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(urlObj.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.status === 'success' && Array.isArray(data.songs)) {
            this.cachedSongs = data.songs;
            this.isConnected = true;
            return data.songs;
          }
        }
      } catch (err) {
        console.warn("Gagal menghubungi server hosting:", err);
        this.isConnected = false;
        // Fallback to cached songs if available
        if (this.cachedSongs.length > 0) {
          return this.cachedSongs.filter(s => 
            s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
          );
        }
      }
    }

    // 2. Return empty or cached songs if server unreachable (No demo songs)
    this.isConnected = false;
    return this.cachedSongs.filter(s => 
      !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }

  /**
   * Fetch synced LRC lyrics file directly via HTTP
   */
  async fetchLrcContent(lrcUrl) {
    if (!lrcUrl) return null;
    try {
      const resp = await fetch(lrcUrl, { cache: 'no-store' });
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
