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
    this.serverUrl = localStorage.getItem('sushee_hosting_url') || '';
    this.cachedSongs = [];
    this.isConnected = false;

    // Curated Demo Backup Songs (Shown when server is not configured yet)
    this.sampleCatalog = [
      {
        id: 'sample_001',
        title: 'Kemesraan',
        artist: 'Iwan Fals & Friends',
        format: '.MP3',
        source: 'sample_cloud',
        audioUrl: 'https://archive.org/download/kemesraan-karaoke-audio/kemesraan.mp3',
        hasLyrics: true,
        lrcContent: `[ti:Kemesraan]
[ar:Iwan Fals]
[00:00.00]♪ Intro Kemesraan ♪
[00:06.00]Suatu hari di kala kita duduk di tepi pantai
[00:15.50]Dan memandang ombak di lautan yang kian menepi
[00:26.00]Burung camar terbang bermain di derunya angin
[00:36.50]Suara alam ini hangatkan jiwa kita
[00:46.00]♪ Reff ♪
[00:48.00]Kemesraan ini janganlah cepat berlalu
[00:57.00]Kemesraan ini inginku kenang selalu
[01:07.50]Hatiku damai jiwaku tentram di sampingmu
[01:17.00]Hatiku damai jiwaku tentram bersamamu`
      },
      {
        id: 'sample_002',
        title: 'Separuh Nafas',
        artist: 'Dewa 19',
        format: '.MP3',
        source: 'sample_cloud',
        audioUrl: 'https://archive.org/download/separuh-nafas-karaoke/separuh_nafas.mp3',
        hasLyrics: true,
        lrcContent: `[ti:Separuh Nafas]
[ar:Dewa 19]
[00:00.00]♪ Intro Rock Beat ♪
[00:08.00]Separuh nafasku terbang bersama dirimu
[00:16.50]Saat kau tinggalkanku salahkanku
[00:24.00]Salahkah aku bila ku bukanlah
[00:31.50]Seperti aku yang dahulu
[00:38.00]♪ Reff Dewa 19 ♪
[00:41.00]Ada makna tergali dari setiap kata
[00:48.50]Yang kau ucapkan padaku
[00:56.00]Kembalilah kasih kembalilah padaku`
      }
    ];
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

    // 2. Fallback sample catalog if server not configured or unreachable
    this.isConnected = false;
    return this.sampleCatalog.filter(s => 
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
