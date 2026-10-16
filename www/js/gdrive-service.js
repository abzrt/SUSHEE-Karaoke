/**
 * Google Drive Karaoke Database Service
 * Enables searching, streaming, and importing songs & lyrics from Google Drive
 */

class GoogleDriveService {
  constructor() {
    this.folderId = localStorage.getItem('gdrive_folder_id') || '1PWplk3vIXo-k3lW7mTq7dcV7KpQyQtC3';
    this.folderUrl = localStorage.getItem('gdrive_folder_url') || 'https://drive.google.com/drive/folders/1PWplk3vIXo-k3lW7mTq7dcV7KpQyQtC3?hl=ID';
    this.apiKey = localStorage.getItem('gdrive_api_key') || '';
    this.webAppUrl = localStorage.getItem('gdrive_webapp_url') || '';
    
    // Curated Cloud Karaoke Database
    this.cloudCatalog = [
      {
        id: 'gdrive_001',
        title: 'Kemesraan',
        artist: 'Iwan Fals & Friends',
        genre: 'Classic Pop / Folk',
        format: '.MP3',
        source: 'gdrive',
        fileId: '1F3o9aM_Kemesraan_Iwan_Fals',
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
        id: 'gdrive_002',
        title: 'Separuh Nafas',
        artist: 'Dewa 19',
        genre: 'Rock / Pop',
        format: '.MP3',
        source: 'gdrive',
        fileId: '1D9e8bW_Separuh_Nafas_Dewa19',
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
      },
      {
        id: 'gdrive_003',
        title: 'Kenangan Manis',
        artist: 'Pamungkas',
        genre: 'Indie / Pop',
        format: '.M4A',
        source: 'gdrive',
        fileId: '1P2m7xZ_Kenangan_Manis_Pamungkas',
        audioUrl: 'https://archive.org/download/kenangan-manis-karaoke/kenangan_manis.mp3',
        hasLyrics: true,
        lrcContent: `[ti:Kenangan Manis]
[ar:Pamungkas]
[00:00.00]♪ Intro Piano Acoustic ♪
[00:07.00]Tawa yang terlepas tanpa ada makna
[00:14.50]Cerita lama yang selalu ada
[00:22.00]Menutup hari yang begitu indah
[00:29.50]Kenangan manis di hari ini
[00:36.00]♪ Chorus ♪
[00:39.00]Kan ku simpan selamanya dalam memori
[00:46.50]Takkan pernah pudar sepanjang waktu`
      },
      {
        id: 'gdrive_004',
        title: 'Perfect',
        artist: 'Ed Sheeran',
        genre: 'Pop Ballad',
        format: '.MP3',
        source: 'gdrive',
        fileId: '1E4s9yQ_Perfect_Ed_Sheeran',
        audioUrl: 'https://archive.org/download/perfect-karaoke-backing/perfect.mp3',
        hasLyrics: true,
        lrcContent: `[ti:Perfect]
[ar:Ed Sheeran]
[00:00.00]♪ Acoustic Guitar Intro ♪
[00:03.00]I found a love for me
[00:10.50]Oh darling, just dive right in and follow my lead
[00:18.00]Well, I found a girl, beautiful and sweet
[00:26.50]Oh, I never knew you were the someone waiting for me
[00:34.00]♪ Chorus ♪
[00:36.50]'Cause we were just kids when we fell in love
[00:41.00]Not knowing what it was
[00:45.00]I will not give you up this time
[00:52.00]Darling, just kiss me slow, your heart is all I own`
      },
      {
        id: 'gdrive_005',
        title: 'Hati-Hati di Jalan',
        artist: 'Tulus',
        genre: 'Soul / Pop',
        format: '.MP3',
        source: 'gdrive',
        fileId: '1T6u3vP_Hati_Hati_Di_Jalan_Tulus',
        audioUrl: 'https://archive.org/download/hati-hati-di-jalan-karaoke/hati_hati_di_jalan.mp3',
        hasLyrics: true,
        lrcContent: `[ti:Hati-Hati di Jalan]
[ar:Tulus]
[00:00.00]♪ Melodi Intro Tulus ♪
[00:07.50]Kukira kita akan bersama
[00:15.00]Begitu banyak yang sama
[00:23.00]Latarmu dan latarku
[00:30.50]Kukira takkan ada kendala
[00:38.50]Dan kita bertemu di belanga
[00:44.00]Kisah yang ternyata tak seindah itu
[00:52.00]♪ Chorus ♪
[00:55.00]Kau melanjutkan perjalananmu
[01:02.00]Ku melanjutkan perjalananku
[01:09.00]Hati-hati di jalan`
      }
    ];

    // Load custom added songs from localStorage
    this.loadCustomSongs();
  }

  loadCustomSongs() {
    try {
      const saved = localStorage.getItem('sushee_custom_gdrive_songs');
      if (saved) {
        const customSongs = JSON.parse(saved);
        if (Array.isArray(customSongs)) {
          // Prepend custom user songs
          this.cloudCatalog = [...customSongs, ...this.cloudCatalog];
        }
      }
    } catch (e) {
      console.warn("Could not load custom GDrive songs:", e);
    }
  }

  saveConfig(folderUrlOrId, apiKey = '', webAppUrl = '') {
    const extractedId = this.extractIdFromUrl(folderUrlOrId) || folderUrlOrId;
    this.folderId = extractedId;
    this.folderUrl = folderUrlOrId.startsWith('http') ? folderUrlOrId : `https://drive.google.com/drive/folders/${extractedId}`;
    this.apiKey = apiKey;
    this.webAppUrl = webAppUrl;

    localStorage.setItem('gdrive_folder_id', this.folderId);
    localStorage.setItem('gdrive_folder_url', this.folderUrl);
    localStorage.setItem('gdrive_api_key', this.apiKey);
    localStorage.setItem('gdrive_webapp_url', this.webAppUrl);
  }

  /**
   * Parse a Google Drive share link into folder or file ID
   */
  extractIdFromUrl(url) {
    if (!url) return '';
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : url.trim();
  }

  /**
   * Get direct streaming URL from a Google Drive file ID
   */
  getDirectStreamUrl(fileId) {
    if (this.apiKey) {
      return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.apiKey}`;
    }
    // Universal Google Drive content direct stream endpoint
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Search songs in Google Drive database
   */
  async searchSongs(query = '') {
    const q = query.toLowerCase().trim();
    
    // 1. If Apps Script Web App URL is configured (CORS-free, no billing)
    if (this.webAppUrl) {
      try {
        const scriptFiles = await this.fetchFromAppsScript(q);
        if (scriptFiles.length > 0) return scriptFiles;
      } catch (e) {
        console.warn("Apps Script query failed:", e);
      }
    }

    // 2. If API key and Folder ID are configured, attempt official Google Drive API v3
    if (this.apiKey && this.folderId) {
      try {
        const driveFiles = await this.fetchFromGoogleDriveApi(q);
        if (driveFiles.length > 0) return driveFiles;
      } catch (e) {
        console.warn("Google Drive API search failed, falling back to catalog:", e);
      }
    }

    // 3. Filter cloud catalog
    if (!q) return this.cloudCatalog;

    return this.cloudCatalog.filter(song => 
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q) ||
      (song.genre && song.genre.toLowerCase().includes(q))
    );
  }

  /**
   * Query Google Drive v3 REST API
   */
  async fetchFromGoogleDriveApi(filterQuery = '') {
    const folder = this.extractIdFromUrl(this.folderId);
    const url = `https://www.googleapis.com/drive/v3/files?q='${folder}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)&key=${this.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Drive API responded with status ${response.status}`);
    }

    const data = await response.json();
    const files = data.files || [];

    // Separate audio and LRC
    const audios = files.filter(f => f.name.match(/\.(mp3|m4a|wav|flac|ogg)$/i));
    const lrcs = files.filter(f => f.name.endsWith('.lrc'));

    return audios.map(audio => {
      const baseName = audio.name.replace(/\.[^/.]+$/, '').toLowerCase();
      const matchedLrc = lrcs.find(l => l.name.toLowerCase().includes(baseName));

      return {
        id: 'gdrive_api_' + audio.id,
        title: audio.name.replace(/\.[^/.]+$/, ''),
        artist: 'Google Drive Cloud',
        genre: 'Cloud Track',
        format: audio.name.endsWith('.m4a') ? '.M4A' : '.MP3',
        source: 'gdrive',
        fileId: audio.id,
        audioUrl: this.getDirectStreamUrl(audio.id),
        hasLyrics: !!matchedLrc,
        lrcFileId: matchedLrc ? matchedLrc.id : null,
        lrcContent: null // Will be fetched on demand
      };
    });
  /**
   * Query Google Drive files via Google Apps Script Web App
   */
  async fetchFromAppsScript(filterQuery = '') {
    if (!this.webAppUrl) return [];
    const targetFolder = this.extractIdFromUrl(this.folderId);
    const endpoint = `${this.webAppUrl}${this.webAppUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(filterQuery)}&folderId=${encodeURIComponent(targetFolder)}`;

    const response = await fetch(endpoint, { method: 'GET', mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Apps Script responded with ${response.status}`);
    }

    const data = await response.json();
    const files = Array.isArray(data) ? data : (data.files || []);

    const audios = files.filter(f => f.name && f.name.match(/\.(mp3|m4a|wav|flac|ogg)$/i));
    const lrcs = files.filter(f => f.name && f.name.endsWith('.lrc'));

    return audios.map(audio => {
      const cleanName = audio.name.replace(/\.[^/.]+$/, '');
      const parts = cleanName.split(' - ');
      const title = parts.length > 1 ? parts[1].trim() : cleanName;
      const artist = parts.length > 1 ? parts[0].trim() : (audio.artist || 'Google Drive (SB)');

      const baseName = cleanName.toLowerCase();
      const matchedLrc = lrcs.find(l => l.name.toLowerCase().includes(baseName) || baseName.includes(l.name.replace(/\.lrc$/i, '').toLowerCase()));

      return {
        id: 'gdrive_script_' + audio.id,
        title: audio.title || title,
        artist: audio.artist || artist,
        genre: audio.genre || 'Cloud Track',
        format: audio.name.endsWith('.m4a') ? '.M4A' : '.MP3',
        source: 'gdrive',
        fileId: audio.id,
        audioUrl: audio.url || this.getDirectStreamUrl(audio.id),
        hasLyrics: !!matchedLrc || !!audio.lrcId || !!audio.lrcContent,
        lrcFileId: matchedLrc ? matchedLrc.id : (audio.lrcId || null),
        lrcContent: audio.lrcContent || null
      };
    });
  }

  /**
   * Fetch LRC file text directly from Google Drive
   */
  async fetchLrcContent(fileId) {
    const url = this.getDirectStreamUrl(fileId);
    const resp = await fetch(url);
    return await resp.text();
  }

  /**
   * Add custom user Google Drive song link
   */
  addCustomSong(title, artist, audioDriveUrl, lrcText = '') {
    const fileId = this.extractIdFromUrl(audioDriveUrl);
    const customSong = {
      id: 'gdrive_custom_' + Date.now(),
      title: title || 'Lagu Google Drive',
      artist: artist || 'Koleksi Pribadi',
      genre: 'Custom Drive',
      format: audioDriveUrl.includes('.m4a') ? '.M4A' : '.MP3',
      source: 'gdrive',
      fileId: fileId,
      audioUrl: this.getDirectStreamUrl(fileId),
      hasLyrics: !!lrcText,
      lrcContent: lrcText || null,
      dateAdded: new Date().toISOString()
    };

    this.cloudCatalog.unshift(customSong);

    // Save custom songs persistently
    try {
      const saved = localStorage.getItem('sushee_custom_gdrive_songs');
      const list = saved ? JSON.parse(saved) : [];
      list.unshift(customSong);
      localStorage.setItem('sushee_custom_gdrive_songs', JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save custom GDrive song:", e);
    }

    return customSong;
  }
}

window.GoogleDriveService = GoogleDriveService;
