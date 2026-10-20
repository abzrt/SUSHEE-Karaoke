/**
 * SUSHEE - Songbook Karaoke
 * Main Application Controller
 */

async function initApp() {
  // --- CINEMATIC SPLASH SCREEN OPENING CONTROLLER ---
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) {
    let splashDismissed = false;
    const progressBar = document.getElementById('splashProgressBar');
    const percentLabel = document.getElementById('splashPercent');
    const statusText = document.getElementById('splashStatusText');
    const skipBtn = document.getElementById('splashSkipBtn');
    let splashTimers = [];

    const dismissSplash = () => {
      if (splashDismissed) return;
      splashDismissed = true;
      splashTimers.forEach(clearTimeout);
      splashTimers = [];
      if (progressBar) progressBar.style.width = '100%';
      if (percentLabel) percentLabel.textContent = '100%';
      splashScreen.classList.add('fade-out');
      splashScreen.style.pointerEvents = 'none';
      setTimeout(() => {
        if (splashScreen.parentNode) {
          splashScreen.parentNode.removeChild(splashScreen);
        }
      }, 500);
    };

    const updateStep = (pct, textKey, delay) => {
      const t = setTimeout(() => {
        if (splashDismissed) return;
        if (progressBar) progressBar.style.width = pct + '%';
        if (percentLabel) percentLabel.textContent = pct + '%';
        if (statusText && textKey && window.i18n) {
          statusText.textContent = window.i18n.t(textKey) || statusText.textContent;
        }
      }, delay);
      splashTimers.push(t);
    };

    // Staged realistic progress animation
    updateStep(28, 'splashStatusLoading', 150);
    updateStep(62, 'splashStatusEffects', 600);
    updateStep(88, 'splashStatusSync', 1100);
    updateStep(100, 'splashStatusReady', 1600);

    const autoDismissTimer = setTimeout(dismissSplash, 2050);
    splashTimers.push(autoDismissTimer);

    // Hard absolute fail-safe: guarantees splash dismiss under all network or slow load conditions
    const failSafeTimer = setTimeout(dismissSplash, 2400);
    splashTimers.push(failSafeTimer);

    if (skipBtn) {
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissSplash();
      });
    }
    splashScreen.addEventListener('click', dismissSplash);
    splashScreen.addEventListener('touchstart', dismissSplash, { passive: true });
  }

  // Elements
  const audioElement = document.getElementById('musicAudio');
  const visualizerCanvas = document.getElementById('visualizerCanvas');
  const lyricsContainer = document.getElementById('lyricsContainer');

  // Enforce playback speed and preserve pitch across all loading and playback events
  const enforcePlaybackSpeed = () => {
    if (audioElement && typeof audioEngine !== 'undefined' && audioEngine && audioEngine.musicSpeed) {
      try {
        audioElement.preservesPitch = true;
        audioElement.webkitPreservesPitch = true;
        audioElement.mozPreservesPitch = true;
        audioElement.playbackRate = audioEngine.musicSpeed;
      } catch (e) {}
    }
  };
  window.enforcePlaybackSpeed = enforcePlaybackSpeed;
  if (audioElement) {
    ['play', 'playing', 'loadedmetadata', 'canplay', 'ratechange'].forEach(evt => {
      audioElement.addEventListener(evt, enforcePlaybackSpeed);
    });
  }

  // Initialize Core Systems
  const audioEngine = new AudioEffectsEngine();
  window.audioEngine = audioEngine;
  window.audioElement = audioElement;

  // Immediately unlock AudioContext on first user interaction on mobile devices
  const unlockAudioContext = () => {
    if (audioEngine && typeof audioEngine.resumeContext === 'function') {
      audioEngine.resumeContext();
    }
  };
  window.addEventListener('touchstart', unlockAudioContext, { passive: true, once: true });
  window.addEventListener('click', unlockAudioContext, { once: true });
  if (audioElement) {
    try {
      const vol = (audioEngine.musicVolume !== undefined && !isNaN(audioEngine.musicVolume)) ? audioEngine.musicVolume : 0.35;
      audioElement.volume = Math.max(0, Math.min(1, vol));
    } catch (e) {
      console.warn("Could not set initial audio volume:", e);
    }
    // Pre-initialize audio engine and bind audioElement early so Pitch, Tempo & Sync are fully ready
    try {
      audioEngine.init(audioElement);
    } catch (e) {
      console.warn("Early AudioEffectsEngine init:", e);
    }
  }
  const storageScanner = new StorageScanner();
  window.storageScanner = storageScanner;
  const recorder = new KaraokeRecorder(audioEngine);
  window.recorder = recorder;
  const hostingService = new HostingServerService();
  window.hostingService = hostingService;
  let visualizer = null;
  const lrcParser = new LrcParser();

  // App State
  let currentSong = null;
  let isKaraokePlaying = false;
  let activeLyricIndex = -1;
  let lyricScrollTimer = null;

  // --- SCREEN WAKE LOCK CONTROLLER (KEEP SCREEN AWAKE ONLY DURING RECORDING) ---
  let screenWakeLock = null;

  async function requestScreenWakeLock() {
    // 1. Android Native Window Flag Bridge
    if (window.AndroidStorage && typeof window.AndroidStorage.setKeepScreenAwake === 'function') {
      try {
        window.AndroidStorage.setKeepScreenAwake(true);
      } catch (e) {
        console.warn('Native setKeepScreenAwake error:', e);
      }
    }

    // 2. Modern Web Wake Lock API
    if ('wakeLock' in navigator && typeof navigator.wakeLock.request === 'function') {
      try {
        if (!screenWakeLock) {
          screenWakeLock = await navigator.wakeLock.request('screen');
          screenWakeLock.addEventListener('release', () => {
            screenWakeLock = null;
          });
        }
      } catch (e) {
        console.warn('Web WakeLock request error:', e);
      }
    }
  }

  async function releaseScreenWakeLock() {
    // 1. Android Native Window Flag Bridge
    if (window.AndroidStorage && typeof window.AndroidStorage.setKeepScreenAwake === 'function') {
      try {
        window.AndroidStorage.setKeepScreenAwake(false);
      } catch (e) {
        console.warn('Native setKeepScreenAwake error:', e);
      }
    }

    // 2. Modern Web Wake Lock API
    if (screenWakeLock) {
      try {
        await screenWakeLock.release();
      } catch (e) {}
      screenWakeLock = null;
    }
  }

  // --- LIFECYCLE & BACKGROUND/RESUME RECOVERY CONTROLLER ---
  const handlePageResume = async () => {
    // 1. Resume AudioContext if suspended by OS/browser
    if (audioEngine && typeof audioEngine.resumeContext === 'function') {
      try {
        await audioEngine.resumeContext();
      } catch (e) {}
    }

    // 2. Validate and refresh object URLs for local songs if needed
    if (storageScanner && storageScanner.songs) {
      storageScanner.songs.forEach(s => {
        if (s.audioBlob && (!s.audioUrl || s.audioUrl.length === 0)) {
          try { s.audioUrl = URL.createObjectURL(s.audioBlob); } catch (e) {}
        }
      });
    }

    // 3. Keep visualizer responsive
    if (visualizer && isKaraokePlaying) {
      visualizer.resizeCanvas();
    }

    // 4. Restore screen wake lock if recording
    if (isKaraokePlaying && recorder && recorder.isRecording) {
      await requestScreenWakeLock();
    }
  };

  const handlePageSuspend = () => {
    // Cleanly stop microphone if user left app and not actively recording
    if (!isKaraokePlaying && audioEngine && audioEngine.micStream) {
      audioEngine.stopMicrophone();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handlePageResume();
    } else {
      handlePageSuspend();
    }
  });

  window.addEventListener('pageshow', handlePageResume);
  window.addEventListener('focus', handlePageResume);

  // Clean shutdown on close/reload to release hardware microphone
  window.addEventListener('pagehide', () => {
    if (audioEngine) {
      audioEngine.stopMicrophone();
    }
  });
  window.addEventListener('beforeunload', () => {
    if (audioEngine) {
      audioEngine.stopMicrophone();
    }
  });

  // Initialize UI language
  window.i18n.updateDOM();

  // Initialize Visualizer
  if (visualizerCanvas) {
    visualizer = new AudioVisualizer(visualizerCanvas, audioEngine);
  }

  // Toast notification helper with deduplication
  let lastToastMsg = '';
  let lastToastTime = 0;
  function showToast(message, type = 'info') {
    if (!message) return;
    const now = Date.now();
    // Prevent duplicate identical toasts within 1800ms
    if (message === lastToastMsg && (now - lastToastTime) < 1800) {
      return;
    }
    lastToastMsg = message;
    lastToastTime = now;

    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    // Remove older toasts if already 2 visible
    const existing = toastContainer.querySelectorAll('.toast');
    if (existing.length >= 2) {
      existing[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span>${message}</span>
      </div>
    `;

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (typeof toast.remove === 'function') toast.remove();
        else if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  }
  window.showAppToast = showToast;
  window.showToast = showToast;

  // --- AUDIO & LYRIC POSITION RESET TO 00:00 ---
  function resetAudioAndLyricsToStart() {
    if (audioElement && audioElement.readyState > 0) {
      try {
        audioElement.currentTime = 0;
      } catch (e) {
        console.warn("Could not set currentTime to 0:", e);
      }
    }
    activeLyricIndex = -1;
    if (currentTimeEl) currentTimeEl.textContent = '00:00';
    if (progressBar) progressBar.value = 0;
    if (lyricsContainer) {
      lyricsContainer.scrollTop = 0;
      const allLines = lyricsContainer.querySelectorAll('.lyric-line');
      allLines.forEach((lineEl) => {
        lineEl.classList.remove('active');
      });
    }
  }
  window.resetAudioAndLyricsToStart = resetAudioAndLyricsToStart;

  // --- UNIFIED SONG FINDER (Storage, Cloud, Pre-rendered HTML) ---
  function findSongById(idOrSong, cardElement = null) {
    if (!idOrSong && !cardElement) return null;
    if (idOrSong && typeof idOrSong === 'object' && idOrSong.title && (idOrSong.audioUrl || idOrSong.id)) {
      return idOrSong;
    }
    const id = typeof idOrSong === 'string' ? idOrSong : (idOrSong ? idOrSong.id : null);
    const cardTitle = cardElement ? cardElement.querySelector('.song-card-title')?.textContent?.trim() : null;

    const allSources = [
      ...(storageScanner && Array.isArray(storageScanner.songs) ? storageScanner.songs : []),
      ...(hostingService && Array.isArray(hostingService.cachedSongs) ? hostingService.cachedSongs : []),
      ...(window.SUSHEE_DEFAULT_CLOUD_CATALOG && Array.isArray(window.SUSHEE_DEFAULT_CLOUD_CATALOG) ? window.SUSHEE_DEFAULT_CLOUD_CATALOG : [])
    ];

    if (id) {
      const match = allSources.find(item => item && (item.id === id || item.cloudId === id || item.filename === id));
      if (match) return match;
    }

    if (cardTitle) {
      const match = allSources.find(item => item && item.title && item.title.toLowerCase() === cardTitle.toLowerCase());
      if (match) return match;
    }

    if (cardElement) {
      const title = cardTitle || 'Lagu';
      const artist = cardElement.querySelector('.song-card-artist')?.textContent?.trim() || 'Artis';
      const cleanId = id || cardElement.getAttribute('data-song-id') || cardElement.getAttribute('data-cloud-id') || ('song_' + Date.now());
      const baseServerUrl = (hostingService && hostingService.serverUrl) ? hostingService.serverUrl.replace(/api\.php.*$/, '') : 'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/SONGS/';
      return {
        id: cleanId,
        title: title,
        artist: artist,
        source: cleanId.startsWith('host_') ? 'custom_host' : 'local_device',
        format: '.mp3',
        audioUrl: `${baseServerUrl}${encodeURIComponent(title)}.mp3`,
        hasLyrics: !cardElement.querySelector('.badge-no-lyrics'),
        lrcUrl: `${baseServerUrl}${encodeURIComponent(title)}.lrc`
      };
    }
    return null;
  }
  window.findSongById = findSongById;

  // --- PLAY SONG DIRECTLY FROM LIST INTO KARAOKE STUDIO ---
  let lastPlayFromList = 0;
  async function playSongFromList(song) {
    if (!song) return;
    const now = Date.now();
    if (now - lastPlayFromList < 350) return;
    lastPlayFromList = now;

    isSongsPlaylistMode = false;

    // 1. Select the song without auto-navigation
    selectSong(song, false);

    // 2. Switch directly to Karaoke tab
    switchTab('viewKaraoke');

    // 3. Reset audio and lyrics to 00:00
    resetAudioAndLyricsToStart();

    // 4. Safely start audio playback from 00:00
    try {
      await audioEngine.init(audioElement);
      await audioEngine.resumeContext();
      audioElement.muted = false;
      try {
        audioElement.currentTime = 0;
      } catch (e) {}

      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      enforcePlaybackSpeed();
      if (audioEngine && audioEngine.pitchShifter && audioEngine.musicPitch !== 0) {
        audioEngine.pitchShifter.setPitch(audioEngine.musicPitch, true);
      }
      isKaraokePlaying = true;
      if (visualizer) visualizer.start();
      updateMusicPlayButtonUI(true);
      showToast(window.i18n.t('toastPlayingMusic'), 'info');
    } catch (err) {
      console.warn("Play song from list error:", err);
      if (err.name !== 'AbortError') {
        showToast(window.i18n.t('toastPlaybackError', { err: err.message || err }), 'error');
      }
    }
  }
  window.playSongFromList = playSongFromList;

  // Format seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- TAB NAVIGATION ---
  let lastTabSwitchTime = 0;
  let lastTabSwitchedId = '';
  function switchTab(viewId) {
    if (!viewId) return;
    const now = Date.now();
    if (viewId === lastTabSwitchedId && (now - lastTabSwitchTime) < 200) {
      return;
    }
    lastTabSwitchTime = now;
    lastTabSwitchedId = viewId;
    if (!viewId) return;
    const views = document.querySelectorAll('.app-view');
    const navButtons = document.querySelectorAll('.nav-item');
    views.forEach(v => v.classList.remove('active'));
    navButtons.forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    const activeBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    try {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (e) {
      window.scrollTo(0, 0);
    }

    if (viewId === 'viewKaraoke') {
      if (visualizer) visualizer.resizeCanvas();
      if (!currentSong) {
        if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
          selectSong(hostingService.cachedSongs[0], false);
        } else if (storageScanner.songs && storageScanner.songs.length > 0) {
          selectSong(storageScanner.songs[0], false);
        }
      }
    }

    if (viewId === 'viewCloud') {
      renderCloudSongList();
    }
    if (viewId === 'viewSongs') {
      renderSongList();
    }
    if (viewId === 'viewRecordings') {
      renderRecordingsList();
    }
  }
  window.switchTab = switchTab;
  window.onTabSwitched = (viewId) => {
    if (viewId === 'viewKaraoke' && visualizer) visualizer.resizeCanvas();
    if (viewId === 'viewCloud') renderCloudSongList();
  };

  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = btn.getAttribute('data-view');
      if (viewId) switchTab(viewId);
    });
  });

  // Delegated fallback listener for tab navigation
  document.addEventListener('click', (e) => {
    const navBtn = e.target && e.target.closest && e.target.closest('.nav-item');
    if (navBtn) {
      const viewId = navBtn.getAttribute('data-view');
      if (viewId) switchTab(viewId);
    }
  });

  // --- LANGUAGE SWITCHING ---
  let lastLangSwitch = 0;
  function setAppLanguage(lang) {
    if (!lang) return;
    const now = Date.now();
    if (now - lastLangSwitch < 250 && window.i18n && window.i18n.currentLang === lang) return;
    lastLangSwitch = now;
    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
      window.i18n.setLanguage(lang);
    } else {
      localStorage.setItem('karaoke_lang', lang);
    }
    document.querySelectorAll('.lang-btn').forEach(btn => {
      if (btn.getAttribute('data-lang') === lang) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    showToast(lang === 'en' ? 'Language switched to English' : 'Bahasa dialihkan ke Bahasa Indonesia', 'success');
  }
  window.setAppLanguage = setAppLanguage;

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const lang = btn.getAttribute('data-lang');
      if (lang) setAppLanguage(lang);
    });
  });

  // Delegated listener for all language buttons anywhere in DOM
  document.addEventListener('click', (e) => {
    const langBtn = e.target && e.target.closest && e.target.closest('.lang-btn');
    if (langBtn) {
      const lang = langBtn.getAttribute('data-lang');
      if (lang) setAppLanguage(lang);
    }
  });

  window.addEventListener('languageChanged', () => {
    renderSongList();
    renderRecordingsList();
    if (typeof renderCloudSongList === 'function') renderCloudSongList();
    updateKaraokeUIState(isKaraokePlaying);
    if (currentSong) {
      document.querySelectorAll('.current-song-title').forEach(el => el.textContent = currentSong.title);
      document.querySelectorAll('.current-song-artist').forEach(el => el.textContent = currentSong.artist);
    } else {
      document.querySelectorAll('.current-song-title').forEach(el => el.textContent = window.i18n.t('selectSongHint'));
      document.querySelectorAll('.current-song-artist').forEach(el => el.textContent = window.i18n.t('studioReady'));
    }
    const musicPlayLabel = document.getElementById('musicPlayLabel');
    if (musicPlayLabel && audioElement) {
      musicPlayLabel.textContent = !audioElement.paused ? window.i18n.t('btnPauseMusic') : window.i18n.t('btnPlayMusic');
    }
    if (typeof updateServerStatusUI === 'function') {
      updateServerStatusUI(hostingService.isConnected, (hostingService.cachedSongs && hostingService.cachedSongs.length) || 0);
    }
  });

  // --- SONG LIBRARY RENDERING ---
  const songsListContainer = document.getElementById('songsList');
  const searchInput = document.getElementById('songSearchInput');
  const filterButtons = document.querySelectorAll('.filter-chip');
  let currentFilter = 'all';

  let lastFilterSwitch = 0;
  function setSongFilter(filter) {
    if (!filter) return;
    const now = Date.now();
    if (now - lastFilterSwitch < 200 && currentFilter === filter) return;
    lastFilterSwitch = now;
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => {
      if (c.getAttribute('data-filter') === filter) c.classList.add('active');
      else c.classList.remove('active');
    });
    renderSongList();
  }
  window.setSongFilter = setSongFilter;

  filterButtons.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = chip.getAttribute('data-filter');
      if (filter) setSongFilter(filter);
    });
  });

  document.addEventListener('click', (e) => {
    const chip = e.target && e.target.closest && e.target.closest('.filter-chip');
    if (chip) {
      const filter = chip.getAttribute('data-filter');
      if (filter) setSongFilter(filter);
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderSongList();
    });
  }

  function renderSongList() {
    if (!songsListContainer) return;
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    // Aggregate songs from local phone scanner, PHP hosting server, and bundled catalog
    let allSongs = [];
    const localSongs = (storageScanner.songs || []).map(s => ({ ...s, source: 'local' }));
    const defaultCatalog = (window.SUSHEE_DEFAULT_CLOUD_CATALOG && Array.isArray(window.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? window.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
    const cloudSongs = ((hostingService.cachedSongs && hostingService.cachedSongs.length > 0) ? hostingService.cachedSongs : defaultCatalog).map(s => ({ ...s, source: 'custom_host' }));

    if (currentFilter === 'local') {
      allSongs = localSongs;
    } else if (currentFilter === 'cloud') {
      allSongs = cloudSongs;
    } else {
      allSongs = [...cloudSongs, ...localSongs];
    }

    let filtered = allSongs.filter(song => {
      const matchesSearch = (song.title && song.title.toLowerCase().includes(query)) ||
                            (song.artist && song.artist.toLowerCase().includes(query));
      return matchesSearch;
    });

    if (filtered.length === 0) {
      songsListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎵</div>
          <h4 data-i18n="emptyLibraryTitle">${window.i18n.t('emptyLibraryTitle')}</h4>
          <p data-i18n="emptyLibraryDesc">${window.i18n.t('emptyLibraryDesc')}</p>
          <div class="empty-actions" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary" id="btnEmptyScan">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>${window.i18n.t('btnScanStorage')}</span>
            </button>
            
          </div>
        </div>
      `;
      const emptyScan = document.getElementById('btnEmptyScan');
      if (emptyScan) emptyScan.addEventListener('click', openScanModal);
      const emptyCloud = document.getElementById('btnEmptyCloud');
      if (emptyCloud) emptyCloud.addEventListener('click', () => switchTab('viewSongs'));
      return;
    }

    songsListContainer.innerHTML = filtered.map(song => `
      <div class="song-card ${currentSong && currentSong.id === song.id ? 'now-playing' : ''}" data-song-id="${song.id}">
        <div class="song-card-avatar" style="${song.source === 'custom_host' ? 'background: rgba(0, 242, 254, 0.15); color: #00f2fe;' : ''}">
          <div class="music-disc-icon">
            ${song.source === 'custom_host' ? 
              `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>` :
              `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`
            }
          </div>
        </div>
        <div class="song-card-info">
          <h4 class="song-card-title">${song.title}</h4>
          <p class="song-card-artist">${song.artist}</p>
          <div class="song-badges">
            <span class="badge badge-format">${song.format || '.MP3'}</span>
            ${song.source === 'custom_host' ? 
              `<span class="badge" style="background: rgba(0, 242, 254, 0.15); color: var(--color-cyan); border: 1px solid rgba(0, 242, 254, 0.3);">PHP Hosting</span>` :
              `<span class="badge badge-source">HP</span>`
            }
            ${song.hasLyrics ? 
              `<span class="badge badge-lyrics"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${window.i18n.t('badgeHasLyrics')}</span>` : 
              `<span class="badge badge-no-lyrics">${window.i18n.t('badgeNoLyrics')}</span>`
            }
          </div>
        </div>
        <div class="song-card-actions" style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-sm btn-songs-playlist-add ${(typeof isSongInPlaylist === 'function' && isSongInPlaylist(song)) ? 'in-playlist' : ''}" data-song-id="${song.id}" onclick="window.toggleSongsPlaylist && window.toggleSongsPlaylist('${song.id}', true, event)" title="${(typeof isSongInPlaylist === 'function' && isSongInPlaylist(song)) ? 'Di Playlist (Ketuk untuk menghapus)' : ((window.i18n && window.i18n.t) ? window.i18n.t('btnAddToPlaylist') : '+ Playlist')}">
            ${(typeof isSongInPlaylist === 'function' && isSongInPlaylist(song)) ? ((window.i18n && window.i18n.t) ? window.i18n.t('btnAddedToPlaylist') : '✓ Di Playlist') : ((window.i18n && window.i18n.t) ? window.i18n.t('btnAddToPlaylist') : '+ Playlist')}
          </button>
          <button class="btn-icon-sing" title="${window.i18n.t('btnSingNow')}" data-song-id="${song.id}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    if (typeof updateSongsPlaylistButtonsUI === 'function') {
      updateSongsPlaylistButtonsUI();
    }
  }

  
  // SUSHEE_GLOBAL_PLAYLIST_CLICK_CAPTURE: Global capture-phase listener guarantees + Playlist clicks work 100%
  document.addEventListener('click', (e) => {
    const playlistBtn = e.target && e.target.closest && (e.target.closest('.btn-songs-playlist-add') || e.target.closest('.btn-cloud-playlist-add'));
    if (playlistBtn) {
      e.preventDefault();
      e.stopPropagation();
      const card = playlistBtn.closest('.song-card');
      const songId = playlistBtn.getAttribute('data-song-id') || playlistBtn.getAttribute('data-cloud-id') || (card && (card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id')));
      const song = findSongById(songId, card);
      if (song) {
        toggleSongsPlaylist(song, true, e);
      }
    }
  }, true);

  // Delegated click & touch listener ensuring all song cards are responsive immediately without duplicate events
  if (songsListContainer) {
    songsListContainer.addEventListener('click', (e) => {
      // 1. + Playlist button clicked (Toggle add/remove with instant UI response)
      const playlistBtn = e.target.closest('.btn-songs-playlist-add') || e.target.closest('.btn-cloud-playlist-add');
      if (playlistBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = playlistBtn.closest('.song-card');
        const songId = playlistBtn.getAttribute('data-song-id') || playlistBtn.getAttribute('data-cloud-id') || (card && (card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id')));
        const song = findSongById(songId, card);
        if (song) {
          toggleSongsPlaylist(song, true);
        }
        return;
      }

      // 2. Play / Sing button clicked: Switch directly to Karaoke tab & play without error
      const singBtn = e.target.closest('.btn-icon-sing');
      if (singBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = singBtn.closest('.song-card');
        const songId = singBtn.getAttribute('data-song-id') || singBtn.getAttribute('data-cloud-id') || (card && (card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id')));
        const song = findSongById(songId, card);
        if (song) {
          playSongFromList(song);
        }
        return;
      }

      // 3. Song card body (Title, artist, etc.): Switch to Karaoke tab, select song, reset to 00:00 (single toast)
      const card = e.target.closest('.song-card');
      if (card) {
        e.preventDefault();
        const songId = card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id');
        const song = findSongById(songId, card);
        if (song) {
          selectSong(song, true);
        }
        return;
      }
    });
  }

  // Delegated listener for playlist mode buttons
  document.addEventListener('click', (e) => {
    const modeBtn = e.target && e.target.closest && e.target.closest('.btn-mode-pill');
    if (modeBtn) {
      const mode = modeBtn.getAttribute('data-mode');
      if (mode && typeof window.setPlaylistMode === 'function') {
        window.setPlaylistMode(mode);
      }
    }
  });

  // --- SONG SELECTION & KARAOKE SETUP ---
  function selectSong(song, autoNavigate = false) {
    if (!song) return;
    currentSong = song;

    // Update Player Bar and Studio UI
    document.querySelectorAll('.current-song-title').forEach(el => el.textContent = song.title);
    document.querySelectorAll('.current-song-artist').forEach(el => el.textContent = song.artist);

    // Audio element source: ensure CORS is set before src for remote hosting URLs
    if (song.audioUrl && (song.audioUrl.startsWith('http://') || song.audioUrl.startsWith('https://'))) {
      audioElement.crossOrigin = 'anonymous';
    } else {
      audioElement.removeAttribute('crossorigin');
    }
    audioElement.src = song.audioUrl;
    audioElement.muted = false;
    audioElement.load();
    enforcePlaybackSpeed();

    // Position audio and lyrics at the very beginning (00:00)
    resetAudioAndLyricsToStart();

    // Parse lyrics
    if (song.hasLyrics && song.lrcContent) {
      lrcParser.parse(song.lrcContent);
      renderLyricsView();
      resetAudioAndLyricsToStart();
    } else if (song.hasLyrics && song.lrcUrl) {
      showToast(window.i18n.t('toastDownloadingLyrics'), 'info');
      hostingService.fetchLrcContent(song.lrcUrl).then(text => {
        if (text) {
          song.lrcContent = text;
          lrcParser.parse(text);
          renderLyricsView();
          resetAudioAndLyricsToStart();
        } else {
          lrcParser.lines = [];
          renderEmptyLyricsView();
        }
      }).catch(err => {
        console.warn('Gagal memuat LRC server:', err);
        lrcParser.lines = [];
        renderEmptyLyricsView();
      });
    } else {
      lrcParser.lines = [];
      renderEmptyLyricsView();
    }

    // Update active highlight on cards in song lists
    if (songsListContainer) {
      songsListContainer.querySelectorAll('.song-card').forEach(card => {
        const id = card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id');
        if (id === song.id) card.classList.add('now-playing');
        else card.classList.remove('now-playing');
      });
    }
    if (cloudListContainer) {
      cloudListContainer.querySelectorAll('.song-card').forEach(card => {
        const id = card.getAttribute('data-cloud-id') || card.getAttribute('data-song-id');
        if (id === song.id) card.classList.add('now-playing');
        else card.classList.remove('now-playing');
      });
    }

    if (autoNavigate) {
      switchTab('viewKaraoke');
    }

    showToast(`${window.i18n.t('nowSinging')}: ${song.title}`, 'info');
  }

  // --- LYRICS DISPLAY & SCROLLING ---
  function renderEmptyLyricsView() {
    if (!lyricsContainer) return;
    lyricsContainer.innerHTML = `
      <div class="empty-lyrics">
        <p data-i18n="lyricsNotFound">${window.i18n.t('lyricsNotFound')}</p>
        <button class="btn btn-secondary btn-sm" id="btnAttachLrc">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>${window.i18n.t('btnAddLyricsManual')}</span>
        </button>
      </div>
    `;

    const attachBtn = document.getElementById('btnAttachLrc');
    if (attachBtn) {
      attachBtn.addEventListener('click', () => {
        const lrcInput = document.getElementById('lrcManualInput');
        if (lrcInput) lrcInput.click();
      });
    }
  }

  function renderLyricsView() {
    if (!lyricsContainer) return;
    if (lrcParser.lines.length === 0) {
      renderEmptyLyricsView();
      return;
    }

    lyricsContainer.innerHTML = lrcParser.lines.map((line, idx) => `
      <div class="lyric-line ${idx === activeLyricIndex ? 'active' : ''}" data-idx="${idx}" data-time="${line.time}">
        ${line.text}
      </div>
    `).join('');

    // Allow clicking on a lyric line to jump audio
    lyricsContainer.querySelectorAll('.lyric-line').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.getAttribute('data-time'));
        if (!isNaN(time)) {
          audioElement.currentTime = time;
          updateLyricSync(time);
        }
      });
    });
  }

  function updateLyricSync(currentTime) {
    if (lrcParser.lines.length === 0 || !lyricsContainer) return;

    const newIndex = lrcParser.getCurrentIndex(currentTime);
    if (newIndex !== activeLyricIndex) {
      activeLyricIndex = newIndex;

      // Update styling
      const allLines = lyricsContainer.querySelectorAll('.lyric-line');
      allLines.forEach((lineEl, idx) => {
        if (newIndex === -1) {
          // Intro / before first lyric: clear highlight & scroll to top
          lineEl.classList.remove('active');
        } else if (idx === activeLyricIndex) {
          lineEl.classList.add('active');
          // Smooth scroll active line into view center
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          lineEl.classList.remove('active');
        }
      });

      if (newIndex === -1 && lyricsContainer) {
        lyricsContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  // --- AUDIO PLAYBACK & TIME UPDATES ---
  const progressBar = document.getElementById('songProgress');
  const currentTimeEl = document.getElementById('currentTime');
  const totalDurationEl = document.getElementById('totalDuration');

  audioElement.addEventListener('timeupdate', () => {
    const cur = audioElement.currentTime;
    const dur = audioElement.duration || 1;

    if (currentTimeEl) currentTimeEl.textContent = formatTime(cur);
    if (totalDurationEl && !isNaN(dur)) totalDurationEl.textContent = formatTime(dur);
    if (progressBar) progressBar.value = (cur / dur) * 100;

    updateLyricSync(cur);
  });

  if (progressBar) {
    progressBar.addEventListener('input', () => {
      const dur = audioElement.duration || 1;
      audioElement.currentTime = (progressBar.value / 100) * dur;
    });
  }

  // --- KARAOKE CONTROLLER & SIMULTANEOUS RECORDING ---
  const btnKaraokeAction = document.getElementById('btnKaraokeAction');
  const btnRestartKaraoke = document.getElementById('btnRestartKaraoke');
  const recordingIndicator = document.getElementById('recordingIndicator');

  let lastKaraokeToggle = 0;
  async function toggleKaraoke() {
    const now = Date.now();
    if (now - lastKaraokeToggle < 300) return;
    lastKaraokeToggle = now;

    if (!currentSong) {
      if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
        selectSong(hostingService.cachedSongs[0], false);
      } else if (storageScanner.songs && storageScanner.songs.length > 0) {
        selectSong(storageScanner.songs[0], false);
      } else {
        showToast(window.i18n.t('noSongSelected'), 'warning');
        switchTab('viewSongs');
        return;
      }
    }

    if (!isKaraokePlaying) {
      // START KARAOKE
      try {
        await audioEngine.init(audioElement);
        await audioEngine.resumeContext();
        audioElement.muted = false;

        // Position song and lyrics at 00:00 before starting recording
        resetAudioAndLyricsToStart();

        let micStarted = false;
        try {
          await audioEngine.startMicrophone();
          micStarted = true;
        } catch (micErr) {
          console.warn("Microphone not available or permission denied:", micErr);
          showToast(window.i18n.t('toastMicNotGranted'), 'warning');
        }

        // Ensure low-latency audio mode and latency offset are active
        if (window.AndroidStorage && typeof window.AndroidStorage.enableRealtimeAudioMode === 'function') {
          try {
            window.AndroidStorage.enableRealtimeAudioMode();
          } catch (e) {}
        }
        audioEngine.setLatencyOffset(audioEngine.latencyOffsetMs);

        // Start simultaneous recording if mic available
        if (micStarted) {
          try {
            recorder.startRecording();
            await requestScreenWakeLock(); // Screen keep-awake ONLY while recording!
          } catch (recErr) {
            console.warn("Recorder start error:", recErr);
          }
        }

        try {
          await audioElement.play();
          enforcePlaybackSpeed();
          if (audioEngine && audioEngine.pitchShifter && audioEngine.musicPitch !== 0) {
            audioEngine.pitchShifter.setPitch(audioEngine.musicPitch, true);
          }
        } catch (playErr) {
          console.error("Audio playback error:", playErr);
          await releaseScreenWakeLock();
          showToast(window.i18n.t('toastPlaybackError', { err: playErr.message || playErr }), 'error');
          return;
        }

        isKaraokePlaying = true;
        if (visualizer) visualizer.start();

        updateKaraokeUIState(true);
        updateMusicPlayButtonUI(true);
        showToast(micStarted ? window.i18n.t('toastKaraokeStarted') : window.i18n.t('toastMusicStarted'), 'success');
      } catch (err) {
        await releaseScreenWakeLock();
        if (audioEngine && typeof audioEngine.stopMicrophone === 'function') {
          audioEngine.stopMicrophone();
        }
        showToast(window.i18n.t('toastKaraokeStartError', { err: err.message || err }), 'error');
        console.error(err);
      }
    } else {
      // STOP KARAOKE & SAVE RECORDING
      audioElement.pause();
      isKaraokePlaying = false;
      if (visualizer) visualizer.stop();

      // Reset lagu dan lirik kembali ke awal lagu (00:00)
      resetAudioAndLyricsToStart();

      // Pastikan tetap berada di tab Karaoke
      switchTab('viewKaraoke');

      // Release wake lock and stop mic so screen can turn off normally and battery is conserved
      await releaseScreenWakeLock();
      if (audioEngine && typeof audioEngine.stopMicrophone === 'function') {
        audioEngine.stopMicrophone();
      }

      // Stop recording instantaneously without heavy conversion lag
      const recordingResult = await recorder.stopRecording();
      updateKaraokeUIState(false);
      updateMusicPlayButtonUI(false);

      if (recordingResult && recordingResult.duration >= 3) {
        showToast(window.i18n.t('toastConvertingMp3') || 'Menyimpan & memproses rekaman di background...', 'info');
        recorder.saveCurrentRecording(
          currentSong.title,
          currentSong.artist,
          audioEngine.currentPreset,
          recordingResult.duration
        ).then(savedItem => {
          if (savedItem) {
            renderRecordingsList();
            showToast(window.i18n.t('toastRecordingSaved'), 'success');
          }
        }).catch(err => {
          console.error("Background recording processing error:", err);
        });
      } else {
        showToast(window.i18n.t('toastRecordingTooShort'), 'info');
      }
    }
  }

  function updateKaraokeUIState(isPlaying) {
    if (!btnKaraokeAction) return;

    if (isPlaying) {
      btnKaraokeAction.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        <span id="karaokeActionLabel" data-i18n="btnStopKaraoke">Stop</span>
      `;
      btnKaraokeAction.classList.add('recording-active');
      if (recordingIndicator) recordingIndicator.classList.add('active');
    } else {
      btnKaraokeAction.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
        <span id="karaokeActionLabel" data-i18n="btnStartKaraoke">Record</span>
      `;
      btnKaraokeAction.classList.remove('recording-active');
      if (recordingIndicator) recordingIndicator.classList.remove('active');
    }
  }

  const restartKaraoke = async () => {
    resetAudioAndLyricsToStart();
    if (isKaraokePlaying && audioEngine) {
      await audioEngine.resumeContext();
      if (audioElement) audioElement.play();
    }
    showToast(window.i18n.currentLang === 'id' ? 'Lagu diulangi dari awal' : 'Restarted from beginning', 'info');
  };
  window.restartKaraoke = restartKaraoke;
  window.toggleKaraokeRecording = toggleKaraoke;

  if (btnKaraokeAction) {
    btnKaraokeAction.addEventListener('click', toggleKaraoke);
  }

  if (btnRestartKaraoke) {
    btnRestartKaraoke.addEventListener('click', restartKaraoke);
  }

  // --- INDEPENDENT BACKING TRACK PLAY/PAUSE CONTROLLER ---
  const btnToggleMusicPlayback = document.getElementById('btnToggleMusicPlayback');
  const musicPlayIcon = document.getElementById('musicPlayIcon');
  const musicPlayLabel = document.getElementById('musicPlayLabel');

  function updateMusicPlayButtonUI(isPlaying) {
    if (!btnToggleMusicPlayback) return;
    if (isPlaying) {
      btnToggleMusicPlayback.classList.add('is-playing');
      if (musicPlayLabel) musicPlayLabel.textContent = 'Jeda Musik';
      if (musicPlayIcon) {
        musicPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
      }
    } else {
      btnToggleMusicPlayback.classList.remove('is-playing');
      if (musicPlayLabel) musicPlayLabel.textContent = 'Putar Musik';
      if (musicPlayIcon) {
        musicPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
      }
    }
  }

  let lastMusicToggle = 0;
  async function toggleMusicPlayback() {
    const now = Date.now();
    if (now - lastMusicToggle < 250) return;
    lastMusicToggle = now;

    isSongsPlaylistMode = false;

    if (!currentSong) {
      if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
        selectSong(hostingService.cachedSongs[0], false);
      } else if (storageScanner.songs && storageScanner.songs.length > 0) {
        selectSong(storageScanner.songs[0], false);
      } else {
        showToast(window.i18n.t('noSongSelected'), 'warning');
        switchTab('viewSongs');
        return;
      }
    }

    if (audioElement.paused) {
      try {
        await audioEngine.init(audioElement);
        await audioEngine.resumeContext();
        audioElement.muted = false;
        await audioElement.play();
        enforcePlaybackSpeed();
        if (audioEngine && audioEngine.pitchShifter && audioEngine.musicPitch !== 0) {
          audioEngine.pitchShifter.setPitch(audioEngine.musicPitch, true);
        }
        isKaraokePlaying = true;
        if (visualizer) visualizer.start();
        updateMusicPlayButtonUI(true);
        showToast(window.i18n.t('toastPlayingMusic'), 'info');
      } catch (err) {
        console.error("Music playback failed:", err);
        showToast(window.i18n.t('toastMusicPlayError', { err: err.message || err }), 'error');
      }
    } else {
      audioElement.pause();
      isKaraokePlaying = false;
      if (visualizer) visualizer.stop();
      updateMusicPlayButtonUI(false);
      updateKaraokeUIState(false);
    }
  }
  window.toggleMusicPlayback = toggleMusicPlayback;

  if (btnToggleMusicPlayback) {
    btnToggleMusicPlayback.addEventListener('click', toggleMusicPlayback);
  }

  // --- MEDIA SESSION & BACKGROUND AUDIO CONTROLLER ---
  function setupMediaSession(song) {
    if (!('mediaSession' in navigator) || !song) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'SUSHEE Karaoke',
        artist: song.artist || 'SUSHEE Studio',
        album: 'SUSHEE Karaoke & Audio',
        artwork: [
          { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (typeof isCloudPlaylistMode !== 'undefined' && isCloudPlaylistMode) toggleCloudPlaylistPlayback();
        else toggleMusicPlayback();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (typeof isCloudPlaylistMode !== 'undefined' && isCloudPlaylistMode) toggleCloudPlaylistPlayback();
        else toggleMusicPlayback();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (typeof isCloudPlaylistMode !== 'undefined' && isCloudPlaylistMode) prevCloudPlaylistSong();
        else restartKaraoke();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (typeof isCloudPlaylistMode !== 'undefined' && isCloudPlaylistMode) nextCloudPlaylistSong();
      });
    } catch (e) {
      console.warn('MediaSession error:', e);
    }
  }

  audioElement.addEventListener('play', () => {
    updateMusicPlayButtonUI(true);
    if (typeof updatePlaylistPlayButtonUI === 'function') updatePlaylistPlayButtonUI(true);
    if (window.AndroidStorage && typeof window.AndroidStorage.setBackgroundAudioActive === 'function') {
      try { window.AndroidStorage.setBackgroundAudioActive(true); } catch (e) {}
    }
    if (currentSong) setupMediaSession(currentSong);
  });

  audioElement.addEventListener('pause', () => {
    updateMusicPlayButtonUI(false);
    if (typeof updatePlaylistPlayButtonUI === 'function') updatePlaylistPlayButtonUI(false);
    if (window.AndroidStorage && typeof window.AndroidStorage.setBackgroundAudioActive === 'function') {
      try { window.AndroidStorage.setBackgroundAudioActive(false); } catch (e) {}
    }
  });

  audioElement.addEventListener('error', (e) => {
    console.warn('audioElement playback error:', e);
    if ((typeof isSongsPlaylistMode !== 'undefined' && isSongsPlaylistMode) && typeof nextSongsPlaylistSong === 'function') {
      setTimeout(() => {
        if (typeof nextSongsPlaylistSong === 'function') nextSongsPlaylistSong();
      }, 1200);
    }
  });

  audioElement.addEventListener('ended', () => {
    isKaraokePlaying = false;
    if (visualizer) visualizer.stop();
    updateMusicPlayButtonUI(false);
    if (typeof updatePlaylistPlayButtonUI === 'function') updatePlaylistPlayButtonUI(false);
    updateKaraokeUIState(false);
    if (window.AndroidStorage && typeof window.AndroidStorage.setBackgroundAudioActive === 'function') {
      try { window.AndroidStorage.setBackgroundAudioActive(false); } catch (e) {}
    }

    if (recorder && recorder.isRecording) {
      if (audioEngine && typeof audioEngine.stopMicrophone === 'function') {
        audioEngine.stopMicrophone();
      }
      recorder.stopRecording().then(recordingResult => {
        if (recordingResult && recordingResult.duration >= 3) {
          showToast(window.i18n.t('toastConvertingMp3') || 'Menyimpan & memproses rekaman di background...', 'info');
          recorder.saveCurrentRecording(
            currentSong ? currentSong.title : 'Karaoke',
            currentSong ? currentSong.artist : 'Singer',
            audioEngine.currentPreset,
            recordingResult.duration
          ).then(savedItem => {
            if (savedItem) {
              renderRecordingsList();
              showToast(window.i18n.t('toastRecordingSaved'), 'success');
            }
          }).catch(err => console.error("Background recording processing error:", err));
        }
      }).catch(err => console.warn(err));
    }

    if ((typeof isSongsPlaylistMode !== 'undefined' && isSongsPlaylistMode) || (typeof isCloudPlaylistMode !== 'undefined' && isCloudPlaylistMode)) {
      if (typeof playlistPlaybackMode !== 'undefined' && playlistPlaybackMode === 'repeat_one') {
        // Repeat one single song indefinitely
        audioElement.currentTime = 0;
        audioElement.play().then(() => {
          if (typeof updatePlaylistPlayButtonUI === 'function') updatePlaylistPlayButtonUI(true);
        }).catch(err => {
          console.warn("Repeat playback error, reloading:", err);
          playSongsPlaylist(songsPlaylistIndex >= 0 ? songsPlaylistIndex : 0);
        });
      } else {
        nextSongsPlaylistSong();
      }
    } else {
      // In Karaoke mode: stay on Karaoke tab and position song at the beginning (00:00)
      resetAudioAndLyricsToStart();
      switchTab('viewKaraoke');
    }
  });

  // --- STARMAKER VOCAL EFFECT PRESET SELECTOR ---
  let lastPresetSwitch = 0;
  function selectVocalPreset(preset) {
    if (!preset) return;
    const now = Date.now();
    if (now - lastPresetSwitch < 150 && audioEngine && audioEngine.currentPreset === preset) return;
    lastPresetSwitch = now;
    document.querySelectorAll('.preset-btn').forEach(b => {
      if (b.getAttribute('data-preset') === preset) b.classList.add('active');
      else b.classList.remove('active');
    });
    if (audioEngine && typeof audioEngine.applyPreset === 'function') {
      audioEngine.applyPreset(preset);
    }
    const activeBtn = document.querySelector(`.preset-btn[data-preset="${preset}"]`);
    const name = activeBtn ? activeBtn.textContent.trim() : preset;
    showToast(window.i18n.t('toastVocalEffect', { preset: name }), 'info');
  }
  window.selectVocalPreset = selectVocalPreset;

  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const preset = btn.getAttribute('data-preset');
      if (preset) selectVocalPreset(preset);
    });
  });

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.preset-btn');
    if (btn) {
      const preset = btn.getAttribute('data-preset');
      if (preset) selectVocalPreset(preset);
    }
  });

  // Slider controls (Volume, Reverb, Echo, Tone) & Value Badges
  const vocalVolSlider = document.getElementById('vocalVolSlider');
  const musicVolSlider = document.getElementById('musicVolSlider');
  const reverbSlider = document.getElementById('reverbSlider');
  const echoSlider = document.getElementById('echoSlider');
  const toneSlider = document.getElementById('toneSlider');
  const earphoneMonitorToggle = document.getElementById('earphoneMonitorToggle');

  const vocalVolVal = document.getElementById('vocalVolVal');
  const musicVolVal = document.getElementById('musicVolVal');
  const reverbVal = document.getElementById('reverbVal');
  const echoVal = document.getElementById('echoVal');
  const toneVal = document.getElementById('toneVal');

  const updateSliderBadgesUI = () => {
    if (vocalVolSlider && vocalVolVal) {
      vocalVolVal.textContent = Math.round(parseFloat(vocalVolSlider.value) * 100) + '%';
    }
    if (musicVolSlider && musicVolVal) {
      musicVolVal.textContent = Math.round(parseFloat(musicVolSlider.value) * 100) + '%';
    }
    if (reverbSlider && reverbVal) {
      reverbVal.textContent = Math.round(parseFloat(reverbSlider.value) * 100) + '%';
    }
    if (echoSlider && echoVal) {
      echoVal.textContent = Math.round(parseFloat(echoSlider.value) * 100) + '%';
    }
    if (toneSlider && toneVal) {
      const v = parseFloat(toneSlider.value) || 0;
      toneVal.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
    }
  };

  if (vocalVolSlider) {
    vocalVolSlider.value = (audioEngine.vocalVolume !== undefined) ? audioEngine.vocalVolume : 0.60;
    vocalVolSlider.addEventListener('input', () => {
      audioEngine.setVocalVolume(vocalVolSlider.value);
      updateSliderBadgesUI();
    });
  }

  if (musicVolSlider) {
    musicVolSlider.value = (audioEngine.musicVolume !== undefined) ? audioEngine.musicVolume : 0.35;
    musicVolSlider.addEventListener('input', () => {
      audioEngine.setMusicVolume(musicVolSlider.value);
      updateSliderBadgesUI();
    });
  }

  if (reverbSlider) {
    reverbSlider.addEventListener('input', () => {
      audioEngine.setReverbAmount(reverbSlider.value);
      updateSliderBadgesUI();
    });
  }

  if (echoSlider) {
    echoSlider.addEventListener('input', () => {
      audioEngine.setEchoAmount(echoSlider.value);
      updateSliderBadgesUI();
    });
  }

  if (toneSlider) {
    toneSlider.addEventListener('input', () => {
      audioEngine.setVocalTone(toneSlider.value);
      updateSliderBadgesUI();
    });
  }

  // Initial badge update
  updateSliderBadgesUI();

  if (earphoneMonitorToggle) {
    earphoneMonitorToggle.addEventListener('change', () => {
      audioEngine.setMonitoring(earphoneMonitorToggle.checked);
      if (earphoneMonitorToggle.checked) {
        showToast(window.i18n.t('toastMonitorActive'), 'warning');
      }
    });
  }

  // --- COMBINED STUDIO SETTINGS DRAWER (UPWARD-EXPANDING DROPUP) ---
  const btnToggleStudioSettings = document.getElementById('btnToggleStudioSettings');
  const studioSettingsCollapseContainer = document.getElementById('studioSettingsCollapseContainer');
  const toggleStudioSettingsAction = document.getElementById('toggleStudioSettingsAction');
  const toggleStudioSettingsArrow = document.getElementById('toggleStudioSettingsArrow');

  let isStudioDrawerOpen = false;
  const setStudioDrawerState = (isOpen, savePref = true) => {
    isStudioDrawerOpen = isOpen;
    const container = document.getElementById('studioSettingsCollapseContainer');
    const btn = document.getElementById('btnToggleStudioSettings');
    const toggleAction = document.getElementById('toggleStudioSettingsAction');
    const toggleArrow = document.getElementById('toggleStudioSettingsArrow');

    if (!container || !btn) return;

    if (isOpen) {
      container.style.display = 'block';
      container.classList.remove('collapsed');
      btn.setAttribute('aria-expanded', 'true');
      if (toggleAction) {
        toggleAction.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnHideSettings') : 'Sembunyikan';
      }
      if (toggleArrow) {
        toggleArrow.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      }      // Ensure saved or active subtab is visible
      const savedSubtab = localStorage.getItem('sushee_active_studio_subtab');
      const activeTabBtn = document.querySelector('.studio-subtab.active');
      const currentTab = savedSubtab || (activeTabBtn ? activeTabBtn.getAttribute('data-subtab') : 'vocalTab');
      switchStudioSubtab(currentTab || 'vocalTab');

      // Expand upwards into viewport view smoothly
      setTimeout(() => {
        try {
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {}
      }, 80);
      if (savePref) localStorage.setItem('sushee_studio_settings_open', '1');
    } else {
      container.style.display = 'none';
      container.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
      if (toggleAction) {
        toggleAction.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnShowSettings') : 'Buka Pengaturan';
      }
      if (toggleArrow) {
        toggleArrow.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
      }
      if (savePref) localStorage.setItem('sushee_studio_settings_open', '0');
    }
  };

  let lastStudioToggleTime = 0;
  const toggleStudioSettingsDrawer = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const now = Date.now();
    if (now - lastStudioToggleTime < 250) return;
    lastStudioToggleTime = now;
    setStudioDrawerState(!isStudioDrawerOpen, true);
  };
  window.toggleStudioSettingsDrawer = toggleStudioSettingsDrawer;

  // Subtab navigation inside combined studio drawer
  function switchStudioSubtab(tabName) {
    if (!tabName) return;
    try {
      localStorage.setItem('sushee_active_studio_subtab', tabName);
    } catch (e) {}
    document.querySelectorAll('.studio-subtab').forEach(btn => {
      const match = btn.getAttribute('data-subtab') === tabName;
      if (match) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });
    const paneVocal = document.getElementById('paneVocalTab');
    const panePitch = document.getElementById('panePitchTab');
    const paneSync = document.getElementById('paneSyncTab');

    if (paneVocal) {
      paneVocal.style.display = tabName === 'vocalTab' ? 'block' : 'none';
      if (tabName === 'vocalTab') paneVocal.classList.add('active'); else paneVocal.classList.remove('active');
    }
    if (panePitch) {
      panePitch.style.display = tabName === 'pitchTab' ? 'block' : 'none';
      if (tabName === 'pitchTab') panePitch.classList.add('active'); else panePitch.classList.remove('active');
    }
    if (paneSync) {
      paneSync.style.display = tabName === 'syncTab' ? 'block' : 'none';
      if (tabName === 'syncTab') paneSync.classList.add('active'); else paneSync.classList.remove('active');
    }
  }
  window.switchStudioSubtab = switchStudioSubtab;

  if (btnToggleStudioSettings) {
    const savedState = localStorage.getItem('sushee_studio_settings_open');
    if (savedState === '1') {
      setStudioDrawerState(true, false);
    }
  }

  // Direct and delegated click and touch handler for subtab buttons to ensure 100% responsiveness on mobile
  const handleSubtabTrigger = (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.studio-subtab');
    if (btn) {
      const tabName = btn.getAttribute('data-subtab');
      if (tabName) {
        switchStudioSubtab(tabName);
      }
    }
  };
  document.addEventListener('click', handleSubtabTrigger);

  // Backward compatibility triggers for tests and external bindings
  const vocalEffectsCollapseContainer = document.getElementById('vocalEffectsCollapseContainer') || studioSettingsCollapseContainer;
  const audioSettingsCollapseContainer = document.getElementById('audioSettingsCollapseContainer') || studioSettingsCollapseContainer;
  const btnToggleVocalSettings = document.getElementById('btnToggleVocalSettings') || btnToggleStudioSettings;
  const btnToggleAudioSettings = document.getElementById('btnToggleAudioSettings') || btnToggleStudioSettings;

  window.toggleVocalSettingsDrawer = () => {
    setStudioDrawerState(true, true);
    switchStudioSubtab('vocalTab');
  };
  window.toggleAudioSettingsDrawer = () => {
    setStudioDrawerState(true, true);
    switchStudioSubtab('pitchTab');
  };

  // --- PITCH SHIFTER & SPEED (TEMPO) CONTROLS ---
  const musicPitchSlider = document.getElementById('musicPitchSlider');
  const musicPitchVal = document.getElementById('musicPitchVal');
  const musicSpeedSlider = document.getElementById('musicSpeedSlider');
  const musicSpeedVal = document.getElementById('musicSpeedVal');

  const updatePitchBadge = (semitones) => {
    if (!musicPitchVal) return;
    const val = parseInt(semitones, 10) || 0;
    if (val === 0) {
      musicPitchVal.textContent = '0 (Normal)';
      musicPitchVal.style.color = 'var(--color-cyan, #00f2fe)';
    } else if (val > 0) {
      musicPitchVal.textContent = `+${val} (♯ Naik)`;
      musicPitchVal.style.color = '#38ef7d';
    } else {
      musicPitchVal.textContent = `${val} (♭ Turun)`;
      musicPitchVal.style.color = '#ff4b91';
    }
  };

  const updateSpeedBadge = (speed) => {
    if (!musicSpeedVal) return;
    const val = parseFloat(speed) || 1.0;
    if (Math.abs(val - 1.0) < 0.01) {
      musicSpeedVal.textContent = '1.00x (Normal)';
      musicSpeedVal.style.color = 'var(--color-cyan, #00f2fe)';
    } else if (val > 1.0) {
      musicSpeedVal.textContent = `${val.toFixed(2)}x (Cepat)`;
      musicSpeedVal.style.color = '#38ef7d';
    } else {
      musicSpeedVal.textContent = `${val.toFixed(2)}x (Lambat)`;
      musicSpeedVal.style.color = '#ffb300';
    }
  };

  // Initialize Pitch & Speed sliders and badges with current state on startup
  const initPitchVal = parseInt((audioEngine.musicPitch !== undefined ? audioEngine.musicPitch : audioEngine.musicPitchShift) || 0, 10);
  if (musicPitchSlider) musicPitchSlider.value = initPitchVal;
  updatePitchBadge(initPitchVal);

  const initSpeedVal = parseFloat((audioEngine.musicSpeed !== undefined ? audioEngine.musicSpeed : audioEngine.musicPlaybackSpeed) || 1.0);
  if (musicSpeedSlider) musicSpeedSlider.value = initSpeedVal;
  updateSpeedBadge(initSpeedVal);

  let lastPitchStepTime = 0;
  window.stepMusicPitch = (delta) => {
    const now = Date.now();
    if (now - lastPitchStepTime < 350) return;
    lastPitchStepTime = now;

    if (!audioEngine) return;
    const current = parseInt((audioEngine.musicPitch !== undefined ? audioEngine.musicPitch : audioEngine.musicPitchShift) || 0, 10);
    const target = Math.max(-6, Math.min(6, current + delta));
    audioEngine.setMusicPitch(target, true);
    if (musicPitchSlider) musicPitchSlider.value = target;
    updatePitchBadge(target);
  };

  window.resetMusicPitch = () => {
    if (!audioEngine) return;
    lastPitchStepTime = Date.now();
    audioEngine.resetMusicPitch();
    if (musicPitchSlider) musicPitchSlider.value = 0;
    updatePitchBadge(0);
  };

  let lastSpeedStepTime = 0;
  window.stepMusicSpeed = (delta) => {
    const now = Date.now();
    if (now - lastSpeedStepTime < 350) return;
    lastSpeedStepTime = now;

    if (!audioEngine) return;
    const current = parseFloat((audioEngine.musicSpeed !== undefined ? audioEngine.musicSpeed : audioEngine.musicPlaybackSpeed) || 1.0);
    const target = Math.max(0.75, Math.min(1.25, Math.round((current + delta) * 20) / 20));
    audioEngine.setMusicSpeed(target);
    enforcePlaybackSpeed();
    if (musicSpeedSlider) musicSpeedSlider.value = target;
    updateSpeedBadge(target);
  };

  window.resetMusicSpeed = () => {
    if (!audioEngine) return;
    lastSpeedStepTime = Date.now();
    audioEngine.resetMusicSpeed();
    enforcePlaybackSpeed();
    if (musicSpeedSlider) musicSpeedSlider.value = 1.0;
    updateSpeedBadge(1.0);
  };

  if (musicPitchSlider) {
    musicPitchSlider.addEventListener('input', () => {
      const val = parseInt(musicPitchSlider.value, 10) || 0;
      audioEngine.setMusicPitch(val);
      updatePitchBadge(val);
    });
  }

  if (musicSpeedSlider) {
    musicSpeedSlider.addEventListener('input', () => {
      const val = parseFloat(musicSpeedSlider.value) || 1.0;
      audioEngine.setMusicSpeed(val);
      if (audioElement) {
        try {
          audioElement.preservesPitch = true;
          audioElement.playbackRate = val;
        } catch (e) {}
      }
      updateSpeedBadge(val);
    });
  }

  // --- LATENCY & AUDIO SYNC ADJUSTMENT ---
  const latencySlider = document.getElementById('latencySlider');
  const latencyDisplayVal = document.getElementById('latencyDisplayVal');
  const latencyChips = document.querySelectorAll('.btn-latency-chip');

  // Modal Sync Controls
  const modalRecSyncVal = document.getElementById('modalRecSyncVal');
  const modalRecSyncSlider = document.getElementById('modalRecSyncSlider');
  const btnModalSyncMinus = document.getElementById('btnModalSyncMinus');
  const btnModalSyncPlus = document.getElementById('btnModalSyncPlus');
  const modalSyncChips = document.querySelectorAll('.btn-modal-sync-chip');

  function updateLatencyUI(val, updateSlider = true) {
    const num = parseInt(val, 10) || 0;
    if (updateSlider && latencySlider) {
      latencySlider.value = num;
    }
    if (latencyDisplayVal) {
      latencyDisplayVal.textContent = (num > 0 ? '+' : '') + num + ' ms';
    }
    latencyChips.forEach(chip => {
      const chipVal = parseInt(chip.getAttribute('data-latency'), 10);
      if (chipVal === num) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Synchronize modal controls
    if (modalRecSyncSlider && updateSlider) {
      modalRecSyncSlider.value = num;
    }
    if (modalRecSyncVal) {
      modalRecSyncVal.textContent = (num > 0 ? '+' : '') + num + ' ms';
    }
    modalSyncChips.forEach(chip => {
      const chipVal = parseInt(chip.getAttribute('data-latency'), 10);
      if (chipVal === num) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  // Restore saved latency offset or use smart defaults (+110ms mobile, +45ms desktop)
  let activeLatency = audioEngine.latencyOffsetMs || 110;
  const storedLatencyStr = localStorage.getItem('sushee_latency_offset');
  if (storedLatencyStr !== null && storedLatencyStr !== '0') {
    const parsed = parseInt(storedLatencyStr, 10);
    if (!isNaN(parsed)) activeLatency = parsed;
  }
  updateLatencyUI(activeLatency, true);
  audioEngine.setLatencyOffset(activeLatency);

  if (latencySlider) {
    latencySlider.addEventListener('input', () => {
      const val = parseInt(latencySlider.value, 10);
      updateLatencyUI(val, false);
      audioEngine.setLatencyOffset(val);
    });

    latencySlider.addEventListener('change', () => {
      const val = parseInt(latencySlider.value, 10);
      showToast(window.i18n.t('latencyToast', { ms: (val > 0 ? '+' : '') + val }), 'info');
    });
  }

  function selectLatencyPreset(val) {
    const num = parseInt(val, 10) || 0;
    updateLatencyUI(num, true);
    if (audioEngine) audioEngine.setLatencyOffset(num);
    showToast(window.i18n.t('latencyToast', { ms: (num > 0 ? '+' : '') + num }), 'info');
  }
  window.selectLatencyPreset = selectLatencyPreset;

  latencyChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const val = parseInt(chip.getAttribute('data-latency'), 10) || 0;
      selectLatencyPreset(val);
    });
  });

  document.addEventListener('click', (e) => {
    const chip = e.target && e.target.closest && e.target.closest('.btn-latency-chip, .btn-modal-sync-chip');
    if (chip) {
      const val = parseInt(chip.getAttribute('data-latency'), 10);
      if (!isNaN(val)) selectLatencyPreset(val);
    }
  });

  // Wire Recording Modal Sync Adjuster
  if (modalRecSyncSlider) {
    modalRecSyncSlider.addEventListener('input', () => {
      const val = parseInt(modalRecSyncSlider.value, 10);
      updateLatencyUI(val, false);
      if (latencySlider) latencySlider.value = val;
      audioEngine.setLatencyOffset(val);
    });
    modalRecSyncSlider.addEventListener('change', () => {
      const val = parseInt(modalRecSyncSlider.value, 10);
      showToast(`⚡ Real-time delay diatur: ${(val > 0 ? '+' : '') + val} ms`, 'info');
    });
  }

  if (btnModalSyncMinus) {
    btnModalSyncMinus.addEventListener('click', () => {
      const current = parseInt(audioEngine.latencyOffsetMs, 10) || 0;
      const next = Math.max(-300, current - 20);
      updateLatencyUI(next, true);
      audioEngine.setLatencyOffset(next);
      showToast(`⚡ Real-time delay: ${(next > 0 ? '+' : '') + next} ms`, 'info');
    });
  }

  if (btnModalSyncPlus) {
    btnModalSyncPlus.addEventListener('click', () => {
      const current = parseInt(audioEngine.latencyOffsetMs, 10) || 0;
      const next = Math.min(300, current + 20);
      updateLatencyUI(next, true);
      audioEngine.setLatencyOffset(next);
      showToast(`⚡ Real-time delay: ${(next > 0 ? '+' : '') + next} ms`, 'info');
    });
  }

  modalSyncChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const val = parseInt(chip.getAttribute('data-latency'), 10) || 0;
      updateLatencyUI(val, true);
      audioEngine.setLatencyOffset(val);
      showToast(`⚡ Preset Real-time: ${(val > 0 ? '+' : '') + val} ms`, 'info');
    });
  });

  // --- AUTO CALIBRATION MODAL & CONTROLS ---
  const latencyCalibrateModal = document.getElementById('latencyCalibrateModal');
  const btnAutoCalibrateLatency = document.getElementById('btnAutoCalibrateLatency');
  const btnCloseCalibrateModal = document.getElementById('btnCloseCalibrateModal');
  const btnStartCalibrate = document.getElementById('btnStartCalibrate');
  const btnApplyCalibrate = document.getElementById('btnApplyCalibrate');
  const calibrateRadar = document.getElementById('calibrateRadar');
  const calibrateStatusTitle = document.getElementById('calibrateStatusTitle');
  const calibrateStatusDesc = document.getElementById('calibrateStatusDesc');
  const calibrateDetectedBox = document.getElementById('calibrateDetectedBox');
  const detectedLatencyVal = document.getElementById('detectedLatencyVal');
  const detectedLatencySub = document.getElementById('detectedLatencySub');

  let lastDetectedMs = 0;

  function openCalibrateModal() {
    if (latencyCalibrateModal) {
      latencyCalibrateModal.classList.add('open');
      if (calibrateRadar) calibrateRadar.classList.remove('pulsing');
      if (calibrateDetectedBox) calibrateDetectedBox.style.display = 'none';
      if (btnApplyCalibrate) btnApplyCalibrate.style.display = 'none';
      if (btnStartCalibrate) {
        btnStartCalibrate.style.display = 'inline-flex';
        btnStartCalibrate.disabled = false;
      }
      if (calibrateStatusTitle) calibrateStatusTitle.textContent = window.i18n.t('calibrateReadyTitle');
      if (calibrateStatusDesc) calibrateStatusDesc.textContent = window.i18n.t('calibrateReadyDesc');
    }
  }

  function closeCalibrateModal() {
    if (latencyCalibrateModal) {
      latencyCalibrateModal.classList.remove('open');
      if (calibrateRadar) calibrateRadar.classList.remove('pulsing');
    }
  }
  window.openCalibrateModal = openCalibrateModal;
  window.closeCalibrateModal = closeCalibrateModal;

  if (btnAutoCalibrateLatency) {
    btnAutoCalibrateLatency.addEventListener('click', openCalibrateModal);
  }
  if (btnCloseCalibrateModal) {
    btnCloseCalibrateModal.addEventListener('click', closeCalibrateModal);
  }

  if (btnStartCalibrate) {
    btnStartCalibrate.addEventListener('click', async () => {
      try {
        btnStartCalibrate.disabled = true;
        if (calibrateRadar) calibrateRadar.classList.add('pulsing');
        if (calibrateStatusTitle) calibrateStatusTitle.textContent = window.i18n.t('calibrateRunning');
        if (calibrateStatusDesc) calibrateStatusDesc.textContent = 'Memancarkan sinyal pulsa chirp & menganalisis loopback...';

        const result = await audioEngine.autoDetectLatency((status) => {
          if (calibrateStatusDesc) calibrateStatusDesc.textContent = status;
        });

        lastDetectedMs = result.latencyMs;
        if (calibrateRadar) calibrateRadar.classList.remove('pulsing');
        if (calibrateStatusTitle) calibrateStatusTitle.textContent = window.i18n.t('calibrateSuccess');
        if (calibrateStatusDesc) {
          calibrateStatusDesc.textContent = result.mode === 'acoustic' 
            ? window.i18n.t('detectedAcoustic') 
            : window.i18n.t('detectedHardware');
        }

        if (detectedLatencyVal) detectedLatencyVal.textContent = (result.latencyMs > 0 ? '+' : '') + result.latencyMs + ' ms';
        if (detectedLatencySub) {
          detectedLatencySub.textContent = result.mode === 'acoustic'
            ? 'Mikrofon mendengar suara speaker langsung'
            : 'Kompensasi buffer output audio Android aktif';
        }

        if (calibrateDetectedBox) calibrateDetectedBox.style.display = 'flex';
        btnStartCalibrate.style.display = 'none';
        if (btnApplyCalibrate) btnApplyCalibrate.style.display = 'inline-flex';

        // Update UI right away
        updateLatencyUI(result.latencyMs, true);
        showToast(window.i18n.t('latencyToast', { ms: (result.latencyMs > 0 ? '+' : '') + result.latencyMs }), 'success');

      } catch (err) {
        console.error("Auto calibrate error:", err);
        if (calibrateRadar) calibrateRadar.classList.remove('pulsing');
        btnStartCalibrate.disabled = false;
        if (calibrateStatusTitle) calibrateStatusTitle.textContent = window.i18n.currentLang === 'id' ? 'Gagal Mengukur Latensi' : 'Failed to Measure Latency';
        if (calibrateStatusDesc) calibrateStatusDesc.textContent = window.i18n.currentLang === 'id' ? 'Pastikan izin mikrofon telah diberikan lalu coba kembali.' : 'Please ensure microphone permission is granted and try again.';
        showToast(window.i18n.t('toastCalibrateFailed'), 'error');
      }
    });
  }

  if (btnApplyCalibrate) {
    btnApplyCalibrate.addEventListener('click', () => {
      updateLatencyUI(lastDetectedMs, true);
      audioEngine.setLatencyOffset(lastDetectedMs);
      closeCalibrateModal();
      showToast(window.i18n.t('latencyToast', { ms: (lastDetectedMs > 0 ? '+' : '') + lastDetectedMs }), 'success');
    });
  }

  // --- STORAGE SCANNING MODAL & FILE PICKERS ---
  const scanModal = document.getElementById('scanModal');
  const btnOpenScan = document.getElementById('btnOpenScan');
  const btnCloseScan = document.getElementById('btnCloseScan');
  const btnDirectoryScan = document.getElementById('btnDirectoryScan');
  const btnFileScan = document.getElementById('btnFileScan');
  const fileInputFolder = document.getElementById('fileInputFolder');
  const fileInputMulti = document.getElementById('fileInputMulti');
  const lrcManualInput = document.getElementById('lrcManualInput');

  function openScanModal() {
    if (scanModal) scanModal.classList.add('open');
  }

  function closeScanModal() {
    if (scanModal) scanModal.classList.remove('open');
  }
  window.openScanModal = openScanModal;
  window.closeScanModal = closeScanModal;

  if (btnOpenScan) btnOpenScan.addEventListener('click', openScanModal);
  if (btnCloseScan) btnCloseScan.addEventListener('click', closeScanModal);

  // Directory scan via modern API or fallback
  if (btnDirectoryScan) {
    btnDirectoryScan.addEventListener('click', async () => {
      try {
        if (window.showDirectoryPicker) {
          const res = await storageScanner.scanDirectoryPicker();
          closeScanModal();
          renderSongList();
          showToast(window.i18n.t('storageScanSuccess', { count: res.addedCount }), 'success');
        } else {
          // On Android / mobile devices, webkitdirectory is not supported; use fileInputMulti for direct multi-file selection
          const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || !!window.AndroidStorage;
          if (isMobileDevice && fileInputMulti) {
            fileInputMulti.click();
          } else if (fileInputFolder) {
            fileInputFolder.click();
          }
        }
      } catch (err) {
        console.warn("Directory picker error:", err);
        if (fileInputMulti) fileInputMulti.click();
      }
    });
  }

  if (fileInputFolder) {
    fileInputFolder.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const res = await storageScanner.processInputFiles(e.target.files);
        closeScanModal();
        renderSongList();
        showToast(window.i18n.t('storageScanSuccess', { count: res.addedCount }), 'success');
      }
    });
  }

  if (btnFileScan) {
    btnFileScan.addEventListener('click', () => {
      fileInputMulti.click();
    });
  }

  if (fileInputMulti) {
    fileInputMulti.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const res = await storageScanner.processInputFiles(e.target.files);
        closeScanModal();
        renderSongList();
        showToast(window.i18n.t('storageScanSuccess', { count: res.addedCount }), 'success');
      }
    });
  }

  // Manual LRC file attach
  if (lrcManualInput) {
    lrcManualInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0] && currentSong) {
        const file = e.target.files[0];
        await storageScanner.linkLrcToSong(currentSong.id, file);
        lrcParser.parse(await file.text());
        currentSong.hasLyrics = true;
        currentSong.lrcContent = await file.text();
        renderLyricsView();
        renderSongList();
        showToast(window.i18n.t('toastLyricsAttached'), 'success');
      }
    });
  }



  // --- RECORDINGS LIST & MODAL ---
  const recordingsListContainer = document.getElementById('recordingsList');
  const recordingModal = document.getElementById('recordingResultModal');
  const btnCloseRecModal = document.getElementById('btnCloseRecModal');
  const modalRecAudio = document.getElementById('modalRecAudio');
  const btnDownloadRec = document.getElementById('btnDownloadRec');
  let currentModalRecording = null;

  function renderRecordingsList() {
    if (!recordingsListContainer) return;
    const list = recorder.recordings;

    if (list.length === 0) {
      recordingsListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <h4 data-i18n="noRecordingsTitle">${window.i18n.t('noRecordingsTitle')}</h4>
          <p data-i18n="noRecordingsDesc">${window.i18n.t('noRecordingsDesc')}</p>
          <div class="empty-actions" style="display: flex; justify-content: center; margin-top: 14px;">
            <button type="button" class="btn btn-primary" id="btnGoToKaraoke" onclick="window.switchTab && window.switchTab('viewKaraoke')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <span>${window.i18n.currentLang === 'id' ? 'Mulai Bernyanyi & Rekam' : 'Start Singing & Recording'}</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    recordingsListContainer.innerHTML = list.map(rec => `
      <div class="recording-card" data-rec-id="${rec.id}">
        <div class="recording-card-row-top">
          <div class="recording-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
          <div class="recording-card-info">
            <h4 class="recording-title">${rec.songTitle}</h4>
            <div class="recording-meta">
              <span class="recording-meta-artist">${rec.artist}</span>
              <span class="recording-meta-badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.35);">${rec.format ? (rec.format + (rec.bitrate ? ` • ${rec.bitrate}` : '')) : (rec.isMp3Converted ? 'MP3 320K' : 'AUDIO')}</span>
              <span class="recording-meta-badge">${rec.preset ? rec.preset.toUpperCase() : 'STUDIO'}</span>
              <span class="recording-meta-duration">⏱️ ${formatTime(rec.duration)}</span>
            </div>
            <span class="recording-date">${new Date(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <button type="button" class="btn-rec-action btn-play-rec" data-rec-id="${rec.id}" title="Putar Rekaman" aria-label="Putar Rekaman">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
        </div>
        <div class="recording-card-actions">
          <button type="button" class="btn-rec-action btn-play-rec btn-play-rec-mobile" data-rec-id="${rec.id}" title="Putar Rekaman" aria-label="Putar Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            <span class="btn-rec-label">Putar</span>
          </button>
          <button type="button" class="btn-rec-action btn-dl-rec" data-rec-id="${rec.id}" title="Simpan / Download Rekaman" aria-label="Simpan Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span class="btn-rec-label">Simpan</span>
          </button>
          <button type="button" class="btn-rec-action btn-del-rec" data-rec-id="${rec.id}" title="Hapus Rekaman" aria-label="Hapus Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span class="btn-rec-label">Hapus</span>
          </button>
        </div>
      </div>
    `).join('');

    // Attach card click listener to preview recording directly
    recordingsListContainer.querySelectorAll('.recording-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-dl-rec') || e.target.closest('.btn-del-rec')) return;
        const id = card.getAttribute('data-rec-id');
        const rec = recorder.recordings.find(r => r.id === id);
        if (rec) showRecordingModal(rec);
      });
    });

    // Attach events directly to elements
    recordingsListContainer.querySelectorAll('.btn-play-rec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-rec-id');
        const rec = recorder.recordings.find(r => r.id === id);
        if (rec) showRecordingModal(rec);
      });
    });

    recordingsListContainer.querySelectorAll('.btn-dl-rec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-rec-id');
        const rec = recorder.recordings.find(r => r.id === id);
        if (rec) recorder.downloadRecording(rec);
      });
    });

    recordingsListContainer.querySelectorAll('.btn-del-rec').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-rec-id');
        await recorder.deleteRecordingFromDB(id);
        renderRecordingsList();
        showToast(window.i18n.t('toastRecordingDeleted'), 'info');
      });
    });
  }
  window.renderRecordingsList = renderRecordingsList;

  // Delegated fallback listener for recording card action buttons
  document.addEventListener('click', async (e) => {
    const playBtn = e.target && e.target.closest && e.target.closest('.btn-play-rec');
    if (playBtn) {
      const id = playBtn.getAttribute('data-rec-id');
      const rec = recorder.recordings.find(r => r.id === id);
      if (rec) showRecordingModal(rec);
      return;
    }

    const dlBtn = e.target && e.target.closest && e.target.closest('.btn-dl-rec');
    if (dlBtn) {
      const id = dlBtn.getAttribute('data-rec-id');
      const rec = recorder.recordings.find(r => r.id === id);
      if (rec) recorder.downloadRecording(rec);
      return;
    }

    const delBtn = e.target && e.target.closest && e.target.closest('.btn-del-rec');
    if (delBtn) {
      const id = delBtn.getAttribute('data-rec-id');
      await recorder.deleteRecordingFromDB(id);
      renderRecordingsList();
      showToast(window.i18n.t('toastRecordingDeleted'), 'info');
      return;
    }
  });

  const btnModalPlayPause = document.getElementById('btnModalPlayPause');
  const modalPlayIcon = document.getElementById('modalPlayIcon');
  const modalProgressBar = document.getElementById('modalProgressBar');
  const modalTimeCurrent = document.getElementById('modalTimeCurrent');
  const modalTimeTotal = document.getElementById('modalTimeTotal');
  const btnModalDone = document.getElementById('btnModalDone');

  function updateModalPlayBtn(isPlaying) {
    if (!modalPlayIcon) return;
    if (isPlaying) {
      modalPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
      modalPlayIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
    }
  }

  function showRecordingModal(rec, autoPlay = true) {
    currentModalRecording = rec;
    if (modalRecAudio) {
      modalRecAudio.src = rec.url;
      modalRecAudio.load();
      if (autoPlay) {
        modalRecAudio.play().then(() => {
          updateModalPlayBtn(true);
        }).catch(() => {
          updateModalPlayBtn(false);
        });
      } else {
        updateModalPlayBtn(false);
      }
    }
    const titleEl = document.getElementById('modalRecTitle');
    const metaEl = document.getElementById('modalRecMeta');
    if (titleEl) titleEl.textContent = rec.songTitle;
    if (metaEl) metaEl.textContent = `${rec.artist} • ${rec.format ? (rec.format + (rec.bitrate ? ` (${rec.bitrate})` : '')) : (rec.isMp3Converted ? 'MP3 320 Kbps' : 'AUDIO')} • Durasi ${formatTime(rec.duration)} • Preset: ${rec.preset ? rec.preset.toUpperCase() : 'STUDIO'}`;

    if (modalTimeCurrent) modalTimeCurrent.textContent = '00:00';
    if (modalTimeTotal) modalTimeTotal.textContent = formatTime(rec.duration);
    if (modalProgressBar) modalProgressBar.value = 0;

    // Refresh modal sync UI to reflect current real-time delay
    updateLatencyUI(audioEngine.latencyOffsetMs, true);

    if (recordingModal) recordingModal.classList.add('open');
  }

  function closeRecordingModal() {
    if (modalRecAudio) {
      modalRecAudio.pause();
      modalRecAudio.currentTime = 0;
    }
    updateModalPlayBtn(false);
    if (recordingModal) recordingModal.classList.remove('open');
  }

  if (btnCloseRecModal) {
    btnCloseRecModal.addEventListener('click', closeRecordingModal);
  }
  if (btnModalDone) {
    btnModalDone.addEventListener('click', closeRecordingModal);
  }

  if (btnModalPlayPause && modalRecAudio) {
    btnModalPlayPause.addEventListener('click', () => {
      if (modalRecAudio.paused) {
        modalRecAudio.play().then(() => updateModalPlayBtn(true)).catch(e => console.log(e));
      } else {
        modalRecAudio.pause();
        updateModalPlayBtn(false);
      }
    });
  }

  if (modalRecAudio) {
    modalRecAudio.addEventListener('play', () => updateModalPlayBtn(true));
    modalRecAudio.addEventListener('pause', () => updateModalPlayBtn(false));
    modalRecAudio.addEventListener('ended', () => {
      updateModalPlayBtn(false);
      if (modalProgressBar) modalProgressBar.value = 0;
      if (modalTimeCurrent) modalTimeCurrent.textContent = '00:00';
    });

    modalRecAudio.addEventListener('timeupdate', () => {
      if (!modalRecAudio.duration || isNaN(modalRecAudio.duration)) return;
      const progress = (modalRecAudio.currentTime / modalRecAudio.duration) * 100;
      if (modalProgressBar) modalProgressBar.value = progress;
      if (modalTimeCurrent) modalTimeCurrent.textContent = formatTime(modalRecAudio.currentTime);
      if (modalTimeTotal) modalTimeTotal.textContent = formatTime(modalRecAudio.duration);
    });
  }

  if (modalProgressBar && modalRecAudio) {
    modalProgressBar.addEventListener('input', () => {
      if (modalRecAudio.duration && !isNaN(modalRecAudio.duration)) {
        modalRecAudio.currentTime = (modalProgressBar.value / 100) * modalRecAudio.duration;
      }
    });
  }

  if (btnDownloadRec) {
    btnDownloadRec.addEventListener('click', () => {
      if (currentModalRecording) {
        recorder.downloadRecording(currentModalRecording);
      }
    });
  }

  // --- SETTINGS CONTROLS (MIC PERMISSION & AUDIO QUALITY) ---
  const btnTestMic = document.getElementById('btnTestMic');
  const testMicrophone = async () => {
    try {
      showToast(window.i18n.t('toastMicRequesting'), 'info');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      showToast(window.i18n.t('toastMicGranted'), 'success');
      if (btnTestMic) {
        btnTestMic.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span style="color: #34d399; font-weight: 700;">${window.i18n.currentLang === 'id' ? 'Izin Mic Aktif' : 'Mic Access Granted'}</span>
        `;
      }
    } catch (err) {
      console.error("Mic test error:", err);
      showToast(window.i18n.t('toastMicDenied'), 'error');
    }
  };
  window.testMicrophone = testMicrophone;
  if (btnTestMic) {
    btnTestMic.addEventListener('click', testMicrophone);
  }

  const btnRequestStorage = document.getElementById('btnRequestStorage');
  const requestStoragePermission = () => {
    if (window.AndroidStorage && typeof window.AndroidStorage.requestStoragePermission === 'function') {
      window.AndroidStorage.requestStoragePermission();
      showToast(window.i18n.t('toastStorageRequesting'), 'info');
      setTimeout(() => {
        if (window.AndroidStorage.isStoragePermissionGranted && window.AndroidStorage.isStoragePermissionGranted()) {
          if (btnRequestStorage) {
            btnRequestStorage.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span style="color: #34d399; font-weight: 700;">${window.i18n.currentLang === 'id' ? 'Izin Penyimpanan Aktif' : 'Storage Access Granted'}</span>
            `;
          }
          showToast(window.i18n.t('toastStorageGranted'), 'success');
        }
      }, 1500);
    } else {
      showToast(window.i18n.t('toastBrowserDownloadHint'), 'info');
    }
  };
  window.requestStoragePermission = requestStoragePermission;
  if (btnRequestStorage) {
    if (window.AndroidStorage && typeof window.AndroidStorage.isStoragePermissionGranted === 'function') {
      if (window.AndroidStorage.isStoragePermissionGranted()) {
        btnRequestStorage.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span style="color: #34d399; font-weight: 700;">Izin Penyimpanan Aktif</span>
        `;
      }
    }
    btnRequestStorage.addEventListener('click', requestStoragePermission);
  }

  // --- RECORDING OUTPUT FORMAT & BITRATE SETTINGS ---
  const recordingFormatSelect = document.getElementById('recordingFormatSelect');
  const recordFormatBadge = document.getElementById('recordFormatBadge');
  const recordBitrateBadge = document.getElementById('recordBitrateBadge');
  const audioQualitySelect = document.getElementById('audioQualitySelect');

  const updateRecordingSettingsBadges = (fmt, bitrate) => {
    const currentFmt = (fmt || (recorder && recorder.recordingFormat) || 'mp3').toUpperCase();
    const currentBitrate = bitrate || (recorder && recorder.recordingBitrate) || 320;
    const bitrateFormGroup = document.getElementById('bitrateFormGroup');
    const bitrateHintText = document.getElementById('bitrateHintText');

    if (recordFormatBadge) {
      recordFormatBadge.textContent = `FORMAT: ${currentFmt}`;
    }

    if (recordBitrateBadge) {
      if (currentFmt === 'WAV') {
        recordBitrateBadge.textContent = '⚡ Lossless 16-Bit Studio PCM (Uncompressed)';
      } else if (currentFmt === 'M4A') {
        recordBitrateBadge.textContent = '⚡ AAC High Efficiency Audio';
      } else if (currentFmt === 'WEBM') {
        recordBitrateBadge.textContent = '⚡ Opus High Fidelity Audio';
      } else {
        recordBitrateBadge.textContent = `⚡ ${currentBitrate} Kbps High-Bitrate Stereo`;
      }
    }

    if (audioQualitySelect) {
      if (currentFmt === 'WAV') {
        audioQualitySelect.disabled = true;
        if (bitrateFormGroup) bitrateFormGroup.classList.add('disabled-form-group');
        if (bitrateHintText) {
          bitrateHintText.textContent = '⚡ Format WAV menyimpan sinyal audio murni (Lossless 16-Bit / 44.1 kHz Studio Master) tanpa kompresi bitrate.';
        }
      } else {
        audioQualitySelect.disabled = false;
        if (bitrateFormGroup) bitrateFormGroup.classList.remove('disabled-form-group');
        if (bitrateHintText) {
          bitrateHintText.textContent = `⚡ Rekomendasi ${currentBitrate} Kbps untuk kejernihan vokal maksimal menyerupai rekaman studio master.`;
        }
      }
    }
  };
  window.updateRecordingSettingsBadges = updateRecordingSettingsBadges;

  window.onRecordingFormatChanged = (fmt) => {
    if (recorder && typeof recorder.setRecordingFormat === 'function') {
      recorder.setRecordingFormat(fmt);
    }
    updateRecordingSettingsBadges(fmt, recorder ? recorder.recordingBitrate : 320);
    const fmtUpper = (fmt || 'mp3').toUpperCase();
    showToast(`Format rekaman diatur ke ${fmtUpper}`, 'success');
  };

  window.onRecordingBitrateChanged = (kbps) => {
    if (recorder && typeof recorder.setRecordingBitrate === 'function') {
      recorder.setRecordingBitrate(kbps);
    }
    updateRecordingSettingsBadges(recorder ? recorder.recordingFormat : 'mp3', kbps);
    showToast(window.i18n.t('toastBitrateChanged', { val: kbps }), 'success');
  };

  if (recordingFormatSelect) {
    const savedFormat = (recorder && recorder.recordingFormat) || localStorage.getItem('sushee_record_format') || 'mp3';
    recordingFormatSelect.value = savedFormat;
    recordingFormatSelect.addEventListener('change', () => {
      window.onRecordingFormatChanged(recordingFormatSelect.value);
    });
  }

  if (audioQualitySelect) {
    const savedQuality = (recorder && recorder.recordingBitrate) ? recorder.recordingBitrate.toString() : (localStorage.getItem('karaoke_audio_quality') || '320');
    audioQualitySelect.value = savedQuality;
    audioQualitySelect.addEventListener('change', () => {
      window.onRecordingBitrateChanged(audioQualitySelect.value);
    });
  }

  updateRecordingSettingsBadges(recorder ? recorder.recordingFormat : 'mp3', recorder ? recorder.recordingBitrate : 320);

  // --- PHP WEB HOSTING CLOUD INTEGRATION (my.php.id) ---
  const cloudListContainer = document.getElementById('cloudSongList');
  const cloudSearchInput = document.getElementById('cloudSearchInput');
  const btnToggleServerConfig = document.getElementById('btnToggleServerConfig');
  const btnToggleServerConfigAlt = document.getElementById('btnToggleServerConfigAlt');
  const serverConfigDrawer = document.getElementById('serverConfigDrawer');
  const serverUrlInput = document.getElementById('serverUrlInput');
  const btnSaveServerConfig = document.getElementById('btnSaveServerConfig');
  const btnOpenServerExternal = document.getElementById('btnOpenServerExternal');
  const btnRefreshCloudSongs = document.getElementById('btnRefreshCloudSongs');
  const btnOpenHostingGuide = document.getElementById('btnOpenHostingGuide');
  const hostingGuideModal = document.getElementById('hostingGuideModal');
  const btnCloseHostingGuideModal = document.getElementById('btnCloseHostingGuideModal');
  const btnCopyPhpScript = document.getElementById('btnCopyPhpScript');
  const serverActiveLabel = document.getElementById('serverActiveLabel');
  const serverStatusPulse = document.getElementById('serverStatusPulse');

  if (serverUrlInput) {
    serverUrlInput.value = hostingService.serverUrl || '';
  }

  function updateServerStatusUI(isConnected, songCount = 0) {
    if (!serverActiveLabel) return;
    if (hostingService.serverUrl) {
      let hostDisplay = hostingService.serverUrl;
      try {
        const u = new URL(hostingService.serverUrl);
        hostDisplay = u.hostname;
      } catch (e) {}

      const statusTag = isConnected ? 
        `<strong id="cloudStatusText" style="color: #00f2fe; font-weight: 700;">Terhubung</strong>` : 
        (songCount > 0 ? `<strong id="cloudStatusText" style="color: #f59e0b; font-weight: 600;">Mode Cache Offline</strong>` : `<strong id="cloudStatusText" style="color: #00f2fe; font-weight: 600;">Menghubungkan...</strong>`);

      const songTag = songCount > 0 ? ` (${songCount} Lagu)` : '';
      serverActiveLabel.innerHTML = `Server: <strong>${hostDisplay}</strong> &bull; ${statusTag}${songTag}`;

      if (serverStatusPulse) {
        serverStatusPulse.style.background = isConnected ? '#00f2fe' : (songCount > 0 ? '#f59e0b' : '#00f2fe');
        serverStatusPulse.style.boxShadow = isConnected ? '0 0 8px #00f2fe' : (songCount > 0 ? '0 0 8px #f59e0b' : '0 0 8px #00f2fe');
      }
    } else {
      serverActiveLabel.innerHTML = `Server: <strong id="cloudStatusText" style="color: #888;">Belum Dikonfigurasi</strong>`;
      if (serverStatusPulse) {
        serverStatusPulse.style.background = '#888';
        serverStatusPulse.style.boxShadow = 'none';
      }
    }
  }

  // Immediately update status with current server connection state
  updateServerStatusUI(hostingService.isConnected, (hostingService.cachedSongs && hostingService.cachedSongs.length) || 0);

    // --- SONGS PLAYLIST CONTROLLER (DEDICATED SEQUENTIAL, SHUFFLE & REPEAT PLAYBACK) ---
  let songsPlaylist = [];
  try {
    const saved = localStorage.getItem('sushee_songs_playlist') || localStorage.getItem('sushee_cloud_playlist');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        songsPlaylist = parsed.filter(s => s && typeof s === 'object' && s.title);
      }
    }
  } catch (e) { songsPlaylist = []; }

  let songsPlaylistIndex = -1;
  let isSongsPlaylistMode = false;
  let playlistPlaybackMode = 'sequential'; // 'sequential', 'shuffle', 'repeat_one'
  try {
    const savedMode = localStorage.getItem('sushee_playlist_mode');
    if (savedMode && ['sequential', 'shuffle', 'repeat_one'].includes(savedMode)) {
      playlistPlaybackMode = savedMode;
    }
  } catch (e) {}

  function updateSongsPlaylistBadgeUI() {
    const badge = document.getElementById('songsPlaylistCountBadge');
    const totalCount = document.getElementById('queueTotalCount');
    const oldCloudBadge = document.getElementById('cloudPlaylistCountBadge');
    const countStr = songsPlaylist.length.toString();
    if (badge) {
      badge.textContent = countStr;
      badge.classList.remove('pulse-badge');
      void badge.offsetWidth;
      badge.classList.add('pulse-badge');
    }
    if (totalCount) totalCount.textContent = countStr;
    if (oldCloudBadge) oldCloudBadge.textContent = countStr;
  }

  function updatePlaylistModeUI() {
    document.querySelectorAll('.btn-mode-pill').forEach(btn => {
      const mode = btn.getAttribute('data-mode');
      if (mode === playlistPlaybackMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function setPlaylistMode(mode) {
    if (!mode || !['sequential', 'shuffle', 'repeat_one'].includes(mode)) return;
    playlistPlaybackMode = mode;
    try {
      localStorage.setItem('sushee_playlist_mode', mode);
    } catch (e) {}
    updatePlaylistModeUI();

    let toastText = 'Mode: Putar Berurut';
    if (mode === 'shuffle') {
      toastText = (window.i18n && window.i18n.t) ? window.i18n.t('toastModeShuffle') : 'Mode: Putar Acak (Shuffle)';
    } else if (mode === 'repeat_one') {
      toastText = (window.i18n && window.i18n.t) ? window.i18n.t('toastModeRepeatOne') : 'Mode: Ulangi 1 Lagu (Repeat One)';
    } else {
      toastText = (window.i18n && window.i18n.t) ? window.i18n.t('toastModeSequential') : 'Mode: Putar Berurut (Sequential)';
    }
    showToast(toastText, 'info');
  }
  window.setPlaylistMode = setPlaylistMode;

  function saveSongsPlaylist() {
    try {
      localStorage.setItem('sushee_songs_playlist', JSON.stringify(songsPlaylist));
      localStorage.setItem('sushee_cloud_playlist', JSON.stringify(songsPlaylist));
    } catch (e) {}
    updateSongsPlaylistBadgeUI();
  }

  function updatePlaylistPlayButtonUI(isPlaying) {
    const playIcon = document.getElementById('songsPlaylistPlayIcon');
    const miniIcon = document.getElementById('miniPlayIcon');
    const iconHtml = isPlaying ? 
      '<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>' : 
      '<polygon points="5 3 19 12 5 21 5 3"/>';

    if (playIcon) playIcon.innerHTML = iconHtml;
    if (miniIcon) miniIcon.innerHTML = iconHtml;
  }

  function renderSongsPlaylistItems() {
    const container = document.getElementById('songsPlaylistItems') || document.getElementById('cloudPlaylistItems');
    if (!container) return;
    if (songsPlaylist.length === 0) {
      container.innerHTML = `<p class="queue-empty-text" data-i18n="playlistEmpty">${(window.i18n && window.i18n.t) ? window.i18n.t('playlistEmpty') : 'Playlist masih kosong. Ketuk \'+ Playlist\' pada lagu di bawah.'}</p>`;
      return;
    }
    container.innerHTML = songsPlaylist.map((s, idx) => `
      <div class="queue-item ${songsPlaylistIndex === idx ? 'active' : ''}" data-queue-idx="${idx}">
        <div class="queue-item-info">
          <span class="queue-item-title">${idx + 1}. ${s.title}</span>
          <span class="queue-item-artist">${s.artist || (s.source === 'custom_host' ? 'PHP Hosting' : 'Penyimpanan HP')}</span>
        </div>
        <button type="button" class="queue-item-remove" data-remove-idx="${idx}" title="Hapus">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-item-remove')) {
          const rmIdx = parseInt(e.target.closest('.queue-item-remove').getAttribute('data-remove-idx'), 10);
          removeSongsPlaylistSong(rmIdx);
          return;
        }
        const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
        playSongsPlaylist(idx);
      });
    });
  }

  function isSongInPlaylist(songOrId) {
    if (!songOrId) return false;
    const id = typeof songOrId === 'string' ? songOrId : songOrId.id;
    const title = typeof songOrId === 'object' ? songOrId.title : null;
    const artist = typeof songOrId === 'object' ? songOrId.artist : null;
    return songsPlaylist.some(s => s && (
      (id && (s.id === id || s.cloudId === id || s.filename === id)) || 
      (title && s.title && s.title.toLowerCase() === title.toLowerCase() && (!artist || s.artist === artist)) ||
      (typeof songOrId === 'string' && s.title && s.title.toLowerCase() === songOrId.toLowerCase())
    ));
  }
  window.isSongInPlaylist = isSongInPlaylist;

  function updateSongsPlaylistButtonsUI() {
    const allPlaylistBtns = document.querySelectorAll('.btn-songs-playlist-add, .btn-cloud-playlist-add');
    const addedText = (window.i18n && window.i18n.t) ? window.i18n.t('btnAddedToPlaylist') : '✓ Di Playlist';
    const addText = (window.i18n && window.i18n.t) ? window.i18n.t('btnAddToPlaylist') : '+ Playlist';

    allPlaylistBtns.forEach(btn => {
      const card = btn.closest('.song-card');
      const songId = btn.getAttribute('data-song-id') || btn.getAttribute('data-cloud-id') || (card && (card.getAttribute('data-song-id') || card.getAttribute('data-cloud-id')));
      const cardTitle = card ? card.querySelector('.song-card-title')?.textContent?.trim() : null;
      
      const inPlaylist = songsPlaylist.some(s => s && (
        (songId && (s.id === songId || s.cloudId === songId || s.filename === songId)) || 
        (cardTitle && s.title && s.title.toLowerCase() === cardTitle.toLowerCase())
      ));

      if (inPlaylist) {
        btn.classList.add('in-playlist');
        btn.textContent = addedText;
        btn.setAttribute('title', 'Di Playlist (Ketuk untuk menghapus)');
      } else {
        btn.classList.remove('in-playlist');
        btn.textContent = addText;
        btn.setAttribute('title', 'Tambah ke Playlist');
      }
    });

    updateSongsPlaylistBadgeUI();
  }
  window.updateSongsPlaylistButtonsUI = updateSongsPlaylistButtonsUI;

  let lastPlaylistToggleTime = 0;
  let lastPlaylistToggleId = null;

  function toggleSongsPlaylist(songOrId, showToastNotice = true, event = null) {
    if (event) {
      try {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      } catch (e) {}
    }
    const song = findSongById(songOrId, (event && event.target) ? event.target.closest('.song-card') : null);
    if (!song) {
      console.warn("toggleSongsPlaylist: could not resolve song from", songOrId);
      return false;
    }

    const songKey = song.id || song.cloudId || song.title;
    const now = Date.now();
    if (songKey && songKey === lastPlaylistToggleId && (now - lastPlaylistToggleTime) < 350) {
      return isSongInPlaylist(song);
    }
    lastPlaylistToggleTime = now;
    lastPlaylistToggleId = songKey;

    const existsIdx = songsPlaylist.findIndex(s => s && (
      (s.id && (s.id === song.id || s.cloudId === song.id)) ||
      (s.title && s.title.toLowerCase() === song.title.toLowerCase() && (!song.artist || s.artist === song.artist))
    ));

    let inPlaylist = false;
    if (existsIdx === -1) {
      songsPlaylist.push(song);
      inPlaylist = true;
      if (showToastNotice) {
        showToast(`✓ ${song.title} ${(window.i18n && window.i18n.t) ? window.i18n.t('btnAddedToPlaylist') : 'ditambahkan ke Playlist'}`, 'success');
      }
      // When first song is added or playlist was idle, update the controller preview
      if (songsPlaylistIndex === -1 && songsPlaylist.length > 0) {
        const trackTitle = document.getElementById('songsPlaylistTrackTitle');
        const trackArtist = document.getElementById('songsPlaylistTrackArtist');
        const nowText = document.getElementById('songsPlaylistNowText');
        if (trackTitle) trackTitle.textContent = songsPlaylist[0].title;
        if (trackArtist) trackArtist.textContent = `${songsPlaylist[0].artist || 'PHP Hosting'} • Siap diputar (${songsPlaylist.length} lagu)`;
        if (nowText) nowText.textContent = `Antrean: ${songsPlaylist.length} Lagu siap diputar`;
      }
      // Automatically open queue drawer so user gets immediate visual confirmation
      const drawer = document.getElementById('songsPlaylistQueue') || document.getElementById('cloudPlaylistQueue');
      if (drawer && drawer.style.display === 'none') {
        drawer.style.display = 'block';
      }
    } else {
      songsPlaylist.splice(existsIdx, 1);
      if (songsPlaylistIndex >= songsPlaylist.length) {
        songsPlaylistIndex = songsPlaylist.length - 1;
      }
      inPlaylist = false;
      if (showToastNotice) {
        showToast(`${song.title} dihapus dari playlist`, 'info');
      }
      if (songsPlaylist.length === 0) {
        songsPlaylistIndex = -1;
        const trackTitle = document.getElementById('songsPlaylistTrackTitle');
        const trackArtist = document.getElementById('songsPlaylistTrackArtist');
        const nowText = document.getElementById('songsPlaylistNowText');
        if (trackTitle) trackTitle.textContent = '-';
        if (trackArtist) trackArtist.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnPlayMusic') : 'Ketuk tombol putar untuk mulai mendengarkan';
        if (nowText) nowText.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('songsPlaylistSubtitle') : 'Mode dengar lagu berturut-turut tanpa vokal mic';
      } else if (songsPlaylistIndex === -1) {
        const trackTitle = document.getElementById('songsPlaylistTrackTitle');
        const trackArtist = document.getElementById('songsPlaylistTrackArtist');
        if (trackTitle) trackTitle.textContent = songsPlaylist[0].title;
        if (trackArtist) trackArtist.textContent = `${songsPlaylist[0].artist || 'PHP Hosting'} • Siap diputar (${songsPlaylist.length} lagu)`;
      }
    }

    saveSongsPlaylist();
    renderSongsPlaylistItems();
    updateSongsPlaylistButtonsUI();
    return inPlaylist;
  }
  window.toggleSongsPlaylist = toggleSongsPlaylist;
  window._toggleSongsPlaylistImpl = toggleSongsPlaylist;

  function toggleSongsPlaylistDrawer() {
    const drawer = document.getElementById('songsPlaylistQueue') || document.getElementById('cloudPlaylistQueue');
    if (!drawer) return;
    const isHidden = drawer.style.display === 'none';
    drawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderSongsPlaylistItems();
  }
  window.toggleSongsPlaylistDrawer = toggleSongsPlaylistDrawer;

  function addToSongsPlaylist(songOrId, showToastNotice = true) {
    const song = findSongById(songOrId);
    if (!song) return;
    const exists = songsPlaylist.some(s => s && (
      (s.id && (s.id === song.id || s.cloudId === song.id)) ||
      (s.title && s.title.toLowerCase() === song.title.toLowerCase())
    ));
    if (!exists) {
      songsPlaylist.push(song);
      saveSongsPlaylist();
      renderSongsPlaylistItems();
      updateSongsPlaylistButtonsUI();
      if (showToastNotice) {
        showToast(`✓ ${song.title} ${(window.i18n && window.i18n.t) ? window.i18n.t('btnAddedToPlaylist') : 'ditambahkan ke Playlist'}`, 'success');
      }
    } else if (showToastNotice) {
      showToast(`${song.title} sudah ada di playlist`, 'info');
    }
  }
  window.addToSongsPlaylist = addToSongsPlaylist;

  function removeSongsPlaylistSong(idx) {
    if (idx >= 0 && idx < songsPlaylist.length) {
      songsPlaylist.splice(idx, 1);
      if (songsPlaylistIndex >= songsPlaylist.length) {
        songsPlaylistIndex = songsPlaylist.length - 1;
      }
      saveSongsPlaylist();
      renderSongsPlaylistItems();
      updateSongsPlaylistButtonsUI();
      if (songsPlaylist.length === 0) {
        songsPlaylistIndex = -1;
        const trackTitle = document.getElementById('songsPlaylistTrackTitle');
        const trackArtist = document.getElementById('songsPlaylistTrackArtist');
        if (trackTitle) trackTitle.textContent = '-';
        if (trackArtist) trackArtist.textContent = 'Ketuk tombol putar untuk mulai mendengarkan';
      }
    }
  }

  function clearSongsPlaylist() {
    songsPlaylist = [];
    songsPlaylistIndex = -1;
    saveSongsPlaylist();
    renderSongsPlaylistItems();
    updateSongsPlaylistButtonsUI();
    const trackTitle = document.getElementById('songsPlaylistTrackTitle');
    const trackArtist = document.getElementById('songsPlaylistTrackArtist');
    if (trackTitle) trackTitle.textContent = '-';
    if (trackArtist) trackArtist.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnPlayMusic') : 'Ketuk tombol putar untuk mulai mendengarkan';
    showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastPlaylistCleared') : 'Playlist berhasil dikosongkan', 'info');
  }
  window.clearSongsPlaylist = clearSongsPlaylist;

  function populateAllSongsToPlaylist() {
    const defaultCatalog = (window.SUSHEE_DEFAULT_CLOUD_CATALOG && Array.isArray(window.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? window.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
    const cloudSongs = (hostingService && hostingService.cachedSongs && hostingService.cachedSongs.length > 0) ? hostingService.cachedSongs : defaultCatalog;
    const allCandidates = [
      ...((storageScanner && storageScanner.songs) || []),
      ...cloudSongs
    ];
    if (allCandidates.length === 0) {
      showToast('Tidak ada lagu untuk dimasukkan ke playlist', 'info');
      return;
    }
    let addedCount = 0;
    allCandidates.forEach(song => {
      if (!song) return;
      const exists = songsPlaylist.some(s => s && (s.id === song.id || (s.title === song.title && s.artist === song.artist)));
      if (!exists) {
        songsPlaylist.push(song);
        addedCount++;
      }
    });
    saveSongsPlaylist();
    renderSongsPlaylistItems();
    updateSongsPlaylistButtonsUI();
    if (songsPlaylist.length > 0 && songsPlaylistIndex === -1) {
      const trackTitle = document.getElementById('songsPlaylistTrackTitle');
      const trackArtist = document.getElementById('songsPlaylistTrackArtist');
      if (trackTitle) trackTitle.textContent = songsPlaylist[0].title;
      if (trackArtist) trackArtist.textContent = `${songsPlaylist[0].artist || 'PHP Hosting'} • Siap diputar (${songsPlaylist.length} lagu)`;
    }
    const drawer = document.getElementById('songsPlaylistQueue') || document.getElementById('cloudPlaylistQueue');
    if (drawer) drawer.style.display = 'block';
    showToast(`✓ Ditambahkan ${addedCount} lagu ke playlist (Total: ${songsPlaylist.length})`, 'success');
  }
  window.populateAllSongsToPlaylist = populateAllSongsToPlaylist;

  async function playSongsPlaylist(idx = 0) {
    if (songsPlaylist.length === 0) {
      populateAllSongsToPlaylist();
      if (songsPlaylist.length === 0) return;
    }

    if (idx < 0) idx = 0;
    if (idx >= songsPlaylist.length) idx = 0;

    songsPlaylistIndex = idx;
    isSongsPlaylistMode = true;
    const song = songsPlaylist[idx];

    if (audioElement) {
      audioElement.muted = false;
    }

    const trackTitle = document.getElementById('songsPlaylistTrackTitle');
    const trackArtist = document.getElementById('songsPlaylistTrackArtist');
    const nowText = document.getElementById('songsPlaylistNowText');

    if (trackTitle) trackTitle.textContent = song.title;
    if (trackArtist) trackArtist.textContent = `${song.artist || (song.source === 'custom_host' ? 'PHP Hosting' : 'Penyimpanan HP')} • Lagu ${idx + 1} dari ${songsPlaylist.length}`;
    if (nowText) nowText.textContent = `Memutar: ${song.title} (${idx + 1}/${songsPlaylist.length})`;

    try {
      if (audioEngine) {
        await audioEngine.init(audioElement);
        await audioEngine.resumeContext();
      }
      selectSong(song, false);
      resetAudioAndLyricsToStart();
      if (audioEngine) audioEngine.setMusicSpeed(audioEngine.musicSpeed);
      if (audioElement) {
        enforcePlaybackSpeed();
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        updatePlaylistPlayButtonUI(true);
      }
      renderSongsPlaylistItems();
    } catch (e) {
      console.warn("Playlist play error:", e);
      updatePlaylistPlayButtonUI(false);
    }
  }
  window.playSongsPlaylist = playSongsPlaylist;

  async function toggleSongsPlaylistPlayback() {
    if (songsPlaylist.length === 0) {
      const defaultCatalog = (window.SUSHEE_DEFAULT_CLOUD_CATALOG && Array.isArray(window.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? window.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
      const cloudSongs = (hostingService && hostingService.cachedSongs && hostingService.cachedSongs.length > 0) ? hostingService.cachedSongs : defaultCatalog;
      const allCandidates = [
        ...((storageScanner && storageScanner.songs) || []),
        ...cloudSongs
      ];
      if (allCandidates.length > 0) {
        songsPlaylist = [...allCandidates];
        saveSongsPlaylist();
        renderSongsPlaylistItems();
        updateSongsPlaylistButtonsUI();
        playSongsPlaylist(0);
        return;
      } else {
        showToast((window.i18n && window.i18n.t) ? window.i18n.t('playlistEmpty') : 'Playlist masih kosong', 'warning');
        return;
      }
    }

    const currentTargetSong = (songsPlaylistIndex >= 0 && songsPlaylistIndex < songsPlaylist.length) ? songsPlaylist[songsPlaylistIndex] : songsPlaylist[0];
    const isCurrentTrackLoaded = currentSong && currentTargetSong && (currentSong.id === currentTargetSong.id || audioElement.src === currentTargetSong.audioUrl);

    if (songsPlaylistIndex === -1 || !isCurrentTrackLoaded || !audioElement.src || audioElement.src === '' || audioElement.src === window.location.href || audioElement.error) {
      playSongsPlaylist(songsPlaylistIndex >= 0 ? songsPlaylistIndex : 0);
      return;
    }

    if (audioElement.paused) {
      try {
        if (audioEngine) {
          await audioEngine.init(audioElement);
          await audioEngine.resumeContext();
        }
        audioElement.muted = false;
        await audioElement.play();
        enforcePlaybackSpeed();
        updatePlaylistPlayButtonUI(true);
      } catch (err) {
        console.warn('Playback error, reloading track:', err);
        playSongsPlaylist(songsPlaylistIndex >= 0 ? songsPlaylistIndex : 0);
      }
    } else {
      audioElement.pause();
      updatePlaylistPlayButtonUI(false);
    }
  }
  window.toggleSongsPlaylistPlayback = toggleSongsPlaylistPlayback;

  function nextSongsPlaylistSong() {
    if (songsPlaylist.length === 0) return;
    let nextIdx = 0;
    if (playlistPlaybackMode === 'shuffle') {
      nextIdx = Math.floor(Math.random() * songsPlaylist.length);
      if (songsPlaylist.length > 1 && nextIdx === songsPlaylistIndex) {
        nextIdx = (nextIdx + 1) % songsPlaylist.length;
      }
    } else {
      nextIdx = songsPlaylistIndex + 1;
      if (nextIdx >= songsPlaylist.length) nextIdx = 0;
    }
    playSongsPlaylist(nextIdx);
  }
  window.nextSongsPlaylistSong = nextSongsPlaylistSong;

  function prevSongsPlaylistSong() {
    if (songsPlaylist.length === 0) return;
    let prevIdx = 0;
    if (playlistPlaybackMode === 'shuffle') {
      prevIdx = Math.floor(Math.random() * songsPlaylist.length);
    } else {
      prevIdx = songsPlaylistIndex - 1;
      if (prevIdx < 0) prevIdx = songsPlaylist.length - 1;
    }
    playSongsPlaylist(prevIdx);
  }
  window.prevSongsPlaylistSong = prevSongsPlaylistSong;

  // Backward compatibility aliases
  window.cloudPlaylist = songsPlaylist;
  window.addToCloudPlaylist = addToSongsPlaylist;
  window.toggleCloudPlaylistPlayback = toggleSongsPlaylistPlayback;
  window.toggleCloudPlaylistDrawer = toggleSongsPlaylistDrawer;
  window.updateCloudPlaylistBadgeUI = updateSongsPlaylistBadgeUI;
  window.updateCloudPlaylistBadgeUI = updateSongsPlaylistBadgeUI;


  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper to render cloud song cards into cloudListContainer
  function renderCloudCards(songs) {
    if (!cloudListContainer) return;
    if (!songs || songs.length === 0) {
      cloudListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🌐</div>
          <h4>Belum Ada Lagu di Server</h4>
          <p>Upload file .mp3 dan .lrc ke folder <code>songs/</code> di hosting Anda.</p>
          <div class="empty-actions">
            <button class="btn btn-primary" id="btnEmptyConfigServer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Atur URL Hosting Anda</span>
            </button>
          </div>
        </div>
      `;
      const btnEmpty = document.getElementById('btnEmptyConfigServer');
      if (btnEmpty && serverConfigDrawer) {
        btnEmpty.addEventListener('click', () => {
          serverConfigDrawer.style.display = 'block';
          if (serverUrlInput) serverUrlInput.focus();
        });
      }
      return;
    }

    const hasLyricsLabel = (window.i18n && window.i18n.t('badgeHasLyrics')) || 'Ada Lirik (.LRC)';
    const noLyricsLabel = (window.i18n && window.i18n.t('badgeNoLyrics')) || 'Tanpa Lirik';
    const singTitle = (window.i18n && window.i18n.t('btnSingNow')) || 'Nyalakan Karaoke';

    cloudListContainer.innerHTML = songs.map(song => {
      const isInPlaylist = cloudPlaylist.some(p => p.id === song.id || (p.title === song.title && p.artist === song.artist));
      return `
        <div class="song-card ${currentSong && currentSong.id === song.id ? 'now-playing' : ''}" data-cloud-id="${song.id}">
          <div class="song-card-avatar" style="background: rgba(0, 242, 254, 0.15); color: #00f2fe;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
          </div>
          <div class="song-card-info">
            <h4 class="song-card-title">${song.title}</h4>
            <p class="song-card-artist">${song.artist}</p>
            <div class="song-badges">
              <span class="badge badge-format">${song.format || '.MP3'}</span>
              <span class="badge" style="background: rgba(0, 242, 254, 0.15); color: var(--color-cyan); border: 1px solid rgba(0, 242, 254, 0.3);">PHP Hosting</span>
              ${song.hasLyrics ? 
                `<span class="badge badge-lyrics"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${hasLyricsLabel}</span>` : 
                `<span class="badge badge-no-lyrics">${noLyricsLabel}</span>`
              }
            </div>
          </div>
          <div class="song-card-actions" style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-sm btn-cloud-playlist-add" data-song-id="${song.id}" title="Tambah ke Playlist Dengar" style="padding: 6px 10px; font-size: 0.74rem; background: ${isInPlaylist ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.08)'}; color: ${isInPlaylist ? 'var(--color-cyan)' : 'var(--text-main)'}; border: 1px solid ${isInPlaylist ? 'rgba(0, 242, 254, 0.4)' : 'var(--border-subtle)'}; border-radius: 8px;">
              ${isInPlaylist ? '✓ In Queue' : '+ Playlist'}
            </button>
            <button class="btn-icon-sing" title="${singTitle}" data-cloud-id="${song.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

  }

  // Delegated click listener for cloud list without duplicate events
  if (cloudListContainer) {
    cloudListContainer.addEventListener('click', (e) => {
      const playlistBtn = e.target.closest('.btn-cloud-playlist-add');
      if (playlistBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = playlistBtn.closest('.song-card');
        const id = card ? (card.getAttribute('data-cloud-id') || card.getAttribute('data-song-id')) : null;
        const song = findSongById(id, card);
        if (song) {
          toggleSongsPlaylist(song, true);
        }
        return;
      }

      const singBtn = e.target.closest('.btn-icon-sing');
      if (singBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = singBtn.closest('.song-card');
        const id = card ? card.getAttribute('data-cloud-id') : null;
        const song = findSongById(id, card);
        if (song) {
          playSongFromList(song);
        }
        return;
      }

      const card = e.target.closest('.song-card');
      if (card) {
        e.preventDefault();
        const id = card.getAttribute('data-cloud-id');
        const song = findSongById(id, card);
        if (song) {
          selectSong(song, true);
        }
      }
    });
  }

  async function renderCloudSongList() {
    if (!cloudListContainer) return;
    const query = (cloudSearchInput ? cloudSearchInput.value : '').trim();

    if (typeof updateSongsPlaylistBadgeUI === 'function') updateSongsPlaylistBadgeUI();

    // 1. INSTANT LOCAL RENDER (0ms delay) from memory cache
    const initialList = hostingService.getFilteredCache(query);
    if (initialList.length > 0) {
      renderCloudCards(initialList);
      updateServerStatusUI(hostingService.isConnected, initialList.length);
    } else if (query) {
      cloudListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h4>Lagu Tidak Ditemukan</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px;">Tidak ada lagu yang cocok dengan kata kunci "${escapeHtml(query)}".</p>
        </div>
      `;
      updateServerStatusUI(hostingService.isConnected, 0);
    } else if (!cloudListContainer.children || cloudListContainer.children.length === 0) {
      const gObj = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
      const bundled = (gObj && Array.isArray(gObj.SUSHEE_DEFAULT_CLOUD_CATALOG)) ? gObj.SUSHEE_DEFAULT_CLOUD_CATALOG : [];
      if (bundled.length > 0) {
        hostingService.cachedSongs = [...bundled];
        hostingService.isConnected = true;
        renderCloudCards(bundled);
        updateServerStatusUI(true, bundled.length);
      }
    }

    // 2. Fetch fresh catalog from remote hosting in background
    try {
      const songs = await hostingService.searchSongs(query);
      if (songs && songs.length > 0) {
        updateServerStatusUI(hostingService.isConnected, songs.length);
        renderCloudCards(songs);
        renderSongList(); // Also update combined library view
      } else if (initialList.length > 0) {
        updateServerStatusUI(hostingService.isConnected, initialList.length);
        renderCloudCards(initialList);
      }
    } catch (e) {
      console.warn("Background cloud hosting refresh notice:", e);
      if (initialList.length > 0) {
        updateServerStatusUI(hostingService.isConnected, initialList.length);
        renderCloudCards(initialList);
      }
    }
  }

  let cloudSearchDebounceTimer = null;
  if (cloudSearchInput) {
    cloudSearchInput.addEventListener('input', () => {
      clearTimeout(cloudSearchDebounceTimer);
      cloudSearchDebounceTimer = setTimeout(() => {
        renderCloudSongList();
      }, 300);
    });
  }

  let lastServerDrawerToggle = 0;
  const toggleDrawer = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const now = Date.now();
    if (now - lastServerDrawerToggle < 250) return;
    lastServerDrawerToggle = now;
    const drawer = document.getElementById('serverConfigDrawer');
    if (!drawer) return;
    const isVisible = drawer.style.display !== 'none';
    drawer.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      const input = document.getElementById('serverUrlInput');
      if (input && (!input.value || input.value.trim() === '')) {
        input.value = hostingService.serverUrl || 'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/SONGS/api.php';
      }
    }
  };
  window.toggleServerConfigDrawer = toggleDrawer;
  if (btnToggleServerConfig) {
    btnToggleServerConfig.addEventListener('click', toggleDrawer);
  }

  const saveServerConfig = async () => {
    const input = document.getElementById('serverUrlInput');
    const url = input ? input.value.trim() : '';
    if (!url) {
      showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastEnterServerUrl') : 'Masukkan URL server hosting Anda', 'warning');
      return;
    }

    showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastConnectingServer') : 'Menghubungkan ke server...', 'info');
    try {
      const res = await hostingService.testConnection(url);
      const drawer = document.getElementById('serverConfigDrawer');
      if (drawer) drawer.style.display = 'none';
      showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastConnectedServer', { count: res.total }) : `Terhubung! Ditemukan ${res.total} lagu.`, 'success');
      renderCloudSongList();
    } catch (err) {
      showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastConnectFailed', { err: err.message }) : `Gagal: ${err.message}`, 'error');
    }
  };
  window.saveServerConfig = saveServerConfig;

  const openServerExternal = () => {
    if (hostingService.serverUrl) {
      window.open(hostingService.serverUrl, '_blank');
    } else {
      showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastFillServerFirst') : 'Isi URL server terlebih dahulu', 'warning');
    }
  };
  window.openServerExternal = openServerExternal;

  const refreshCloudSongs = () => {
    showToast((window.i18n && window.i18n.t) ? window.i18n.t('toastRefreshingServer') : 'Menyegarkan server hosting...', 'info');
    renderCloudSongList();
  };
  window.refreshCloudSongs = refreshCloudSongs;

  const openHostingGuide = () => {
    if (hostingGuideModal) hostingGuideModal.classList.add('open');
  };
  const closeHostingGuide = () => {
    if (hostingGuideModal) hostingGuideModal.classList.remove('open');
  };
  window.openHostingGuideModal = openHostingGuide;
  window.closeHostingGuideModal = closeHostingGuide;

  if (btnOpenHostingGuide) {
    btnOpenHostingGuide.addEventListener('click', openHostingGuide);
  }

  if (btnCloseHostingGuideModal) {
    btnCloseHostingGuideModal.addEventListener('click', closeHostingGuide);
  }

  const copyPhpScript = () => {
    const code = document.getElementById('phpScriptCodeBlock')?.value;
    if (code && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        showToast(window.i18n.t('toastScriptCopied'), 'success');
      }).catch(() => {
        showToast(window.i18n.t('toastScriptCopyFailed'), 'warning');
      });
    }
  };
  window.copyPhpScriptCode = copyPhpScript;

  if (btnCopyPhpScript) {
    btnCopyPhpScript.addEventListener('click', copyPhpScript);
  }

  // Universal delegated backdrop and modal close button listener
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
    const closeBtn = e.target && e.target.closest && e.target.closest('.modal-close, .btn-modal-close-action');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal-overlay');
      if (modal) modal.classList.remove('open');
    }
  });

  // --- REACTIVE DB EVENT LISTENERS ---
  // Ensure that whenever songs or recordings are loaded/updated from IndexedDB, UI updates immediately
  window.addEventListener('sushee:songsLoaded', () => {
    renderSongList();
    if (!currentSong && storageScanner.songs && storageScanner.songs.length > 0) {
      selectSong(storageScanner.songs[0], false);
    }
  });

  window.addEventListener('sushee:recordingsLoaded', () => {
    renderRecordingsList();
  });

  // --- INITIALIZE UI ---
  // 1. Wait briefly (up to 500ms) for local IndexedDB to load cached songs & recordings so initial render isn't empty
  try {
    await Promise.race([
      Promise.allSettled([
        (storageScanner && storageScanner.ready) || Promise.resolve(),
        (recorder && recorder.ready) || Promise.resolve()
      ]),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);
  } catch (e) {}

  // 2. Immediate First Render from Local & Cached Data
  renderSongList();
  renderRecordingsList();
  updateServerStatusUI(hostingService.isConnected, (hostingService.cachedSongs && hostingService.cachedSongs.length) || 0);

  // 3. Immediately select a default song if available from local or cached cloud library
  if (!currentSong) {
    if (storageScanner.songs && storageScanner.songs.length > 0) {
      selectSong(storageScanner.songs[0], false);
    } else if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
      selectSong(hostingService.cachedSongs[0], false);
    }
  }

  // 4. Background Cloud Sync: query remote hosting without blocking or hiding local songs
  renderCloudSongList()
    .catch(err => {
      console.warn("Background cloud songs check error:", err);
    })
    .finally(() => {
      renderSongList();
      if (!currentSong) {
        if (storageScanner.songs && storageScanner.songs.length > 0) {
          selectSong(storageScanner.songs[0], false);
        } else if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
          selectSong(hostingService.cachedSongs[0], false);
        }
      }
    });
}

// Ensure initApp runs whether DOM is loading or already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
