/**
 * Internationalization (i18n) Module
 * Supports Bahasa Indonesia (ID) and English (EN)
 */

const translations = {
  id: {
    appTitle: "SUSHEE",
    appSubtitle: "Songbook Karaoke",
    navSongs: "Lagu",
    navDrive: "G-Drive",
    navKaraoke: "Karaoke",
    navRecordings: "Rekaman",
    navSettings: "Setelan",
    gdriveTitle: "Google Drive Karaoke",
    gdriveDesc: "Cari dan putar lagu & lirik langsung dari cloud Google Drive",
    btnConfigure: "Ubah Link",
    searchDrivePlaceholder: "Cari lagu di Google Drive...",
    btnAddDriveSong: "+ Tambah Link Lagu GDrive",
    addDriveModalTitle: "Tambah Lagu dari Google Drive",
    
    // Songs / Library View
    libraryTitle: "Koleksi Lagu",
    libraryDesc: "Kelola lagu dari memori HP (.mp3, .m4a, .lrc)",
    btnScanStorage: "Pindai Memori HP",
    btnPickFiles: "Pilih File Manual",
    searchPlaceholder: "Cari judul lagu atau artis...",
    emptyLibraryTitle: "Belum Ada Lagu",
    emptyLibraryDesc: "Pindai folder musik di HP Anda untuk mulai berkaraoke.",
    filterAll: "Semua",
    filterLocal: "Penyimpanan HP",
    filterSample: "Lagu Contoh",
    badgeHasLyrics: "Lirik Tersedia",
    badgeNoLyrics: "Tanpa Lirik",
    btnSingNow: "Mulai Nyanyi",
    btnLinkLyrics: "Pasang Lirik (.lrc)",
    storageScanSuccess: "Berhasil memindai {count} file lagu & lirik!",
    storageScanError: "Gagal memindai penyimpanan. Pastikan izin akses diberikan.",
    
    // Karaoke Studio
    nowSinging: "Sedang Menyanyikan",
    noSongSelected: "Pilih lagu terlebih dahulu dari daftar lagu",
    btnStartKaraoke: "Mulai Rekam & Nyanyi",
    btnStopKaraoke: "Selesai & Simpan",
    btnPause: "Jeda",
    btnResume: "Lanjut",
    btnRestart: "Ulangi",
    monitorVoice: "Dengar Suara Sendiri (Earphone)",
    monitorVoiceDesc: "Gunakan earphone untuk mencegah gema (feedback)",
    latencyAdjust: "Sinkronisasi Audio (Offset Latensi)",
    latencyDesc: "Sesuaikan jeda delay antara vokal dan musik (Bluetooth / Earphone)",
    latencyWired: "Kabel (0ms)",
    latencyPhone: "Speaker HP (+40ms)",
    latencyBT: "Bluetooth TWS (+120ms)",
    latencyBTHigh: "BT Delay Tinggi (+200ms)",
    latencyToast: "Latensi vokal disinkronkan ke {ms} ms",
    btnAutoCalibrate: "Deteksi Delay Otomatis (Auto Adjust)",
    calibrateModalTitle: "Kalibrasi Delay Otomatis",
    calibrateReadyTitle: "Siap Mengukur Delay Audio",
    calibrateReadyDesc: "Sistem akan mendeteksi jeda antara output suara dan mikrofon secara otomatis.",
    calibrateRunning: "Menganalisis audio buffer & respon mikrofon...",
    calibrateSuccess: "Kalibrasi Berhasil!",
    btnRunCalibration: "Mulai Kalibrasi (Ping Test)",
    btnApplyResult: "Terapkan Hasil",
    detectedAcoustic: "Terdeteksi secara akustik (Speaker HP/Ruangan)",
    detectedHardware: "Terdeteksi via hardware buffer Android / Earphone",
    calibrateTip: "💡 Tips: Pastikan mikrofon aktif. Sinyal chirp akan mengukur respon audio secara presisi.",
    musicVol: "Volume Musik",
    vocalVol: "Volume Suara Mic",
    
    // Vocal Effects (StarMaker Style)
    effectsTitle: "Efek Vokal StarMaker",
    effectsDesc: "Pilih preset efek suara profesional seperti di studio",
    presetOriginal: "Asli",
    presetStudio: "Studio Pro",
    presetKtv: "KTV Karaoke",
    presetHall: "Konser Hall",
    presetPop: "Pop Stage",
    presetAutotune: "Auto-Tune / Robot",
    presetWarm: "Akustik Hangat",
    presetCustom: "Kustom",
    reverbWet: "Gema Ruang (Reverb)",
    echoDelay: "Pantulan (Echo / Delay)",
    echoFeedback: "Panjang Pantulan",
    pitchShift: "Kunci Nada (Key Transpose)",
    vocalTone: "Karakter Suara (Tone / Treble)",
    
    // Lyrics Viewer
    lyricsTitle: "Lirik Berjalan (LRC)",
    lyricsNotFound: "Lirik sinkronisasi (.lrc) belum tersedia untuk lagu ini.",
    btnAddLyricsManual: "Unggah File .LRC",
    lyricSyncHint: "Lirik akan otomatis tersinkronisasi mengikuti ketukan lagu",
    
    // Recordings
    recordingsTitle: "Hasil Rekaman Saya",
    recordingsDesc: "Dengarkan dan ekspor vokal bersama musik pengiring",
    noRecordingsTitle: "Belum Ada Rekaman",
    noRecordingsDesc: "Selesaikan sesi karaoke untuk mendengarkan hasil rekaman Anda.",
    btnPlayRecording: "Dengarkan",
    btnDownloadRecording: "Download (.wav / .webm)",
    btnDeleteRecording: "Hapus",
    recordingSaved: "Rekaman berhasil disimpan!",
    recordedAt: "Direkam pada",
    
    // Settings & Language
    settingsTitle: "Pengaturan Aplikasi",
    languageSetting: "Bahasa (Language)",
    languageDesc: "Pilih bahasa tampilan antarmuka",
    audioQualitySetting: "Kualitas Audio Rekaman",
    audioQualityDesc: "Pilih format perekaman vokal simultan",
    highQuality: "Tinggi (Stereo 48kHz, Lossless WAV / WebM)",
    standardQuality: "Standar (Compressed)",
    micPermissionTitle: "Izin Mikrofon",
    micPermissionDesc: "Aplikasi memerlukan izin mic untuk merekam suara karaoke",
    btnRequestMic: "Minta Izin Mic",
    aboutTitle: "Tentang SUSHEE",
    aboutDesc: "Aplikasi Karaoke Android SUSHEE Modern Minimalis dengan Web Audio DSP & Perekaman Simultan.",
    version: "Versi 1.0.0 (Android Edition)"
  },
  
  en: {
    appTitle: "SUSHEE",
    appSubtitle: "Songbook Karaoke",
    navSongs: "Songs",
    navDrive: "G-Drive",
    navKaraoke: "Karaoke",
    navRecordings: "Recordings",
    navSettings: "Settings",
    gdriveTitle: "Google Drive Karaoke",
    gdriveDesc: "Search and play songs & lyrics directly from Google Drive cloud",
    btnConfigure: "Settings",
    searchDrivePlaceholder: "Search songs in Google Drive...",
    btnAddDriveSong: "+ Add G-Drive Song Link",
    addDriveModalTitle: "Add Song from Google Drive",
    
    // Songs / Library View
    libraryTitle: "Song Library",
    libraryDesc: "Manage tracks from device storage (.mp3, .m4a, .lrc)",
    btnScanStorage: "Scan Phone Storage",
    btnPickFiles: "Select Files Manually",
    searchPlaceholder: "Search song title or artist...",
    emptyLibraryTitle: "No Songs Found",
    emptyLibraryDesc: "Scan your phone's music folders to start singing.",
    filterAll: "All",
    filterLocal: "Device Storage",
    filterSample: "Sample Songs",
    badgeHasLyrics: "Lyrics Available",
    badgeNoLyrics: "No Lyrics",
    btnSingNow: "Sing Now",
    btnLinkLyrics: "Attach Lyrics (.lrc)",
    storageScanSuccess: "Successfully scanned {count} audio & lyric files!",
    storageScanError: "Failed to scan storage. Please grant file access permissions.",
    
    // Karaoke Studio
    nowSinging: "Now Singing",
    noSongSelected: "Please select a song from the library first",
    btnStartKaraoke: "Start Record & Sing",
    btnStopKaraoke: "Finish & Save",
    btnPause: "Pause",
    btnResume: "Resume",
    btnRestart: "Restart",
    monitorVoice: "Vocal Earphone Monitor",
    monitorVoiceDesc: "Use headphones to avoid acoustic audio feedback",
    latencyAdjust: "Audio Sync (Latency Offset)",
    latencyDesc: "Calibrate audio delay between voice and music (Bluetooth / Headphones)",
    latencyWired: "Wired (0ms)",
    latencyPhone: "Phone Speaker (+40ms)",
    latencyBT: "Bluetooth TWS (+120ms)",
    latencyBTHigh: "High Delay BT (+200ms)",
    latencyToast: "Audio latency offset set to {ms} ms",
    btnAutoCalibrate: "Auto Detect Delay (Auto Adjust)",
    calibrateModalTitle: "Auto Latency Calibration",
    calibrateReadyTitle: "Ready to Measure Audio Delay",
    calibrateReadyDesc: "The system will automatically measure roundtrip delay between audio output and microphone.",
    calibrateRunning: "Analyzing audio buffers & microphone response...",
    calibrateSuccess: "Calibration Complete!",
    btnRunCalibration: "Start Calibration (Ping Test)",
    btnApplyResult: "Apply Result",
    detectedAcoustic: "Acoustically detected (Device Speaker/Room)",
    detectedHardware: "Detected via Android hardware audio buffer / Earphones",
    calibrateTip: "💡 Tip: Make sure mic is active. The chirp test signal accurately measures audio latency.",
    musicVol: "Music Volume",
    vocalVol: "Mic Vocal Volume",
    
    // Vocal Effects (StarMaker Style)
    effectsTitle: "StarMaker Vocal Effects",
    effectsDesc: "Select professional studio-grade vocal presets",
    presetOriginal: "Original",
    presetStudio: "Studio Pro",
    presetKtv: "KTV Karaoke",
    presetHall: "Concert Hall",
    presetPop: "Pop Stage",
    presetAutotune: "Auto-Tune / Robot",
    presetWarm: "Warm Acoustic",
    presetCustom: "Custom",
    reverbWet: "Room Reverb",
    echoDelay: "Echo / Delay",
    echoFeedback: "Echo Feedback",
    pitchShift: "Key Transpose",
    vocalTone: "Vocal Tone (Treble Boost)",
    
    // Lyrics Viewer
    lyricsTitle: "Synced Lyrics (LRC)",
    lyricsNotFound: "Synchronized lyric (.lrc) is not attached to this song yet.",
    btnAddLyricsManual: "Upload .LRC File",
    lyricSyncHint: "Lyrics will automatically scroll and highlight with the rhythm",
    
    // Recordings
    recordingsTitle: "My Recordings",
    recordingsDesc: "Listen to and export your vocal performances with backing music",
    noRecordingsTitle: "No Recordings Yet",
    noRecordingsDesc: "Finish a karaoke session to listen to your mixed performance.",
    btnPlayRecording: "Play",
    btnDownloadRecording: "Download (.wav / .webm)",
    btnDeleteRecording: "Delete",
    recordingSaved: "Recording saved successfully!",
    recordedAt: "Recorded at",
    
    // Settings & Language
    settingsTitle: "App Settings",
    languageSetting: "Language (Bahasa)",
    languageDesc: "Choose interface display language",
    audioQualitySetting: "Recording Audio Quality",
    audioQualityDesc: "Choose simultaneous vocal recording quality",
    highQuality: "High (Stereo 48kHz, Lossless WAV / WebM)",
    standardQuality: "Standard (Compressed)",
    micPermissionTitle: "Microphone Permission",
    micPermissionDesc: "Required to capture and apply real-time effects to your voice",
    btnRequestMic: "Grant Mic Access",
    aboutTitle: "About SUSHEE",
    aboutDesc: "SUSHEE Modern Minimalist Android Karaoke App with StarMaker DSP & Dual-track Recording.",
    version: "Version 1.0.0 (Android Edition)"
  }
};

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem('karaoke_lang') || 'id';
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('karaoke_lang', lang);
      this.updateDOM();
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    }
  }

  getLanguage() {
    return this.currentLang;
  }

  t(key, params = {}) {
    const dict = translations[this.currentLang] || translations.id;
    let text = dict[key] || translations.en[key] || key;
    
    // Replace interpolation params like {count}
    Object.keys(params).forEach(p => {
      text = text.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
    });
    return text;
  }

  updateDOM() {
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });

    // Update titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });

    // Update active state on language switchers
    document.querySelectorAll('.lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      if (lang === this.currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update HTML lang attribute
    if (document.documentElement) {
      document.documentElement.lang = this.currentLang;
    }
  }
}

// Global instance
window.i18n = new I18nManager();
