/**
 * SUSHEE - Songbook Karaoke
 * Main Application Controller
 */

async function initApp() {
  // --- SPLASH SCREEN OPENING ANIMATION ---
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) {
    let splashDismissed = false;
    const dismissSplash = () => {
      if (splashDismissed) return;
      splashDismissed = true;
      splashScreen.classList.add('fade-out');
      splashScreen.style.pointerEvents = 'none';
      splashScreen.style.opacity = '0';
      setTimeout(() => {
        if (splashScreen.parentNode) {
          splashScreen.parentNode.removeChild(splashScreen);
        }
      }, 400);
    };

    setTimeout(dismissSplash, 600);
    splashScreen.addEventListener('click', dismissSplash);
    splashScreen.addEventListener('touchstart', dismissSplash, { passive: true });
  }

  // Elements
  const audioElement = document.getElementById('musicAudio');
  const visualizerCanvas = document.getElementById('visualizerCanvas');
  const lyricsContainer = document.getElementById('lyricsContainer');

  // Initialize Core Systems
  const audioEngine = new AudioEffectsEngine();
  window.audioEngine = audioEngine;
  if (audioElement) {
    try {
      const vol = (audioEngine.musicVolume !== undefined && !isNaN(audioEngine.musicVolume)) ? audioEngine.musicVolume : 0.85;
      audioElement.volume = Math.max(0, Math.min(1, vol));
    } catch (e) {
      console.warn("Could not set initial audio volume:", e);
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

  // Initialize UI language
  window.i18n.updateDOM();

  // Initialize Visualizer
  if (visualizerCanvas) {
    visualizer = new AudioVisualizer(visualizerCanvas, audioEngine);
  }

  // Toast notification helper
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

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
    }, 3500);
  }
  window.showAppToast = showToast;

  // Format seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- TAB NAVIGATION ---
  function switchTab(viewId) {
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
    const cloudStatus = document.getElementById('cloudStatusText');
    if (cloudStatus) {
      cloudStatus.textContent = hostingService.isConfigured() ? window.i18n.t('cloudConnected') : window.i18n.t('cloudNotConfigured');
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

    // Aggregate songs from both local phone scanner and PHP hosting server
    let allSongs = [];
    const localSongs = (storageScanner.songs || []).map(s => ({ ...s, source: 'local' }));
    const cloudSongs = (hostingService.cachedSongs || []).map(s => ({ ...s, source: 'custom_host' }));

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
            <button class="btn btn-secondary" id="btnEmptyCloud">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
              <span>Buka Server Hosting</span>
            </button>
          </div>
        </div>
      `;
      const emptyScan = document.getElementById('btnEmptyScan');
      if (emptyScan) emptyScan.addEventListener('click', openScanModal);
      const emptyCloud = document.getElementById('btnEmptyCloud');
      if (emptyCloud) emptyCloud.addEventListener('click', () => switchTab('viewCloud'));
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
        <div class="song-card-actions">
          <button class="btn-icon-sing" title="${window.i18n.t('btnSingNow')}" data-song-id="${song.id}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach click events
    songsListContainer.querySelectorAll('.song-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const songId = card.getAttribute('data-song-id');
        const song = allSongs.find(s => s.id === songId);
        if (song) {
          selectSong(song, true);
          if (e.target.closest('.btn-icon-sing')) {
            toggleMusicPlayback();
          }
        }
      });
    });
  }

  // --- SONG SELECTION & KARAOKE SETUP ---
  function selectSong(song, autoNavigate = false) {
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

    // Parse lyrics
    if (song.hasLyrics && song.lrcContent) {
      lrcParser.parse(song.lrcContent);
      renderLyricsView();
    } else if (song.hasLyrics && song.lrcUrl) {
      showToast(window.i18n.t('toastDownloadingLyrics'), 'info');
      hostingService.fetchLrcContent(song.lrcUrl).then(text => {
        if (text) {
          song.lrcContent = text;
          lrcParser.parse(text);
          renderLyricsView();
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

    renderSongList();
    if (cloudListContainer) {
      cloudListContainer.querySelectorAll('.song-card').forEach(card => {
        const id = card.getAttribute('data-cloud-id');
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
    if (newIndex !== activeLyricIndex && newIndex !== -1) {
      activeLyricIndex = newIndex;

      // Update styling
      const allLines = lyricsContainer.querySelectorAll('.lyric-line');
      allLines.forEach((lineEl, idx) => {
        if (idx === activeLyricIndex) {
          lineEl.classList.add('active');
          // Smooth scroll active line into view center
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          lineEl.classList.remove('active');
        }
      });
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
        switchTab('viewCloud');
        return;
      }
    }

    if (!isKaraokePlaying) {
      // START KARAOKE
      try {
        await audioEngine.init(audioElement);
        await audioEngine.resumeContext();
        audioElement.muted = false;

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
          } catch (recErr) {
            console.warn("Recorder start error:", recErr);
          }
        }

        try {
          await audioElement.play();
        } catch (playErr) {
          console.error("Audio playback error:", playErr);
          showToast(window.i18n.t('toastPlaybackError', { err: playErr.message || playErr }), 'error');
          return;
        }

        isKaraokePlaying = true;
        if (visualizer) visualizer.start();

        updateKaraokeUIState(true);
        updateMusicPlayButtonUI(true);
        showToast(micStarted ? window.i18n.t('toastKaraokeStarted') : window.i18n.t('toastMusicStarted'), 'success');
      } catch (err) {
        showToast(window.i18n.t('toastKaraokeStartError', { err: err.message || err }), 'error');
        console.error(err);
      }
    } else {
      // STOP KARAOKE & SAVE RECORDING
      audioElement.pause();
      isKaraokePlaying = false;
      if (visualizer) visualizer.stop();

      showToast(window.i18n.t('toastConvertingMp3'), 'info');
      const recordingResult = await recorder.stopRecording();
      updateKaraokeUIState(false);

      if (recordingResult && recordingResult.duration >= 3) {
        // Save recording
        const savedItem = recorder.saveCurrentRecording(
          currentSong.title,
          currentSong.artist,
          audioEngine.currentPreset,
          recordingResult.duration
        );
        renderRecordingsList();
        showRecordingModal(savedItem);
        showToast(window.i18n.t('toastRecordingSaved'), 'success');
      } else {
        showToast(window.i18n.t('toastRecordingTooShort'), 'info');
      }
    }
  }

  function updateKaraokeUIState(isPlaying) {
    if (!btnKaraokeAction) return;

    if (isPlaying) {
      btnKaraokeAction.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <span data-i18n="btnStopKaraoke">${window.i18n.t('btnStopKaraoke')}</span>
      `;
      btnKaraokeAction.classList.add('recording-active');
      if (recordingIndicator) recordingIndicator.classList.add('active');
    } else {
      btnKaraokeAction.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
        <span data-i18n="btnStartKaraoke">${window.i18n.t('btnStartKaraoke')}</span>
      `;
      btnKaraokeAction.classList.remove('recording-active');
      if (recordingIndicator) recordingIndicator.classList.remove('active');
    }
  }

  const restartKaraoke = async () => {
    if (audioElement) audioElement.currentTime = 0;
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

    if (!currentSong) {
      if (hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
        selectSong(hostingService.cachedSongs[0], false);
      } else if (storageScanner.songs && storageScanner.songs.length > 0) {
        selectSong(storageScanner.songs[0], false);
      } else {
        showToast(window.i18n.t('noSongSelected'), 'warning');
        switchTab('viewCloud');
        return;
      }
    }

    if (audioElement.paused) {
      try {
        await audioEngine.init(audioElement);
        await audioEngine.resumeContext();
        audioElement.muted = false;
        await audioElement.play();
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

  audioElement.addEventListener('play', () => updateMusicPlayButtonUI(true));
  audioElement.addEventListener('pause', () => updateMusicPlayButtonUI(false));
  audioElement.addEventListener('ended', () => {
    isKaraokePlaying = false;
    if (visualizer) visualizer.stop();
    updateMusicPlayButtonUI(false);
    updateKaraokeUIState(false);
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
    vocalVolSlider.addEventListener('input', () => {
      audioEngine.setVocalVolume(vocalVolSlider.value);
      updateSliderBadgesUI();
    });
  }

  if (musicVolSlider) {
    musicVolSlider.value = audioEngine.musicVolume;
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

  // --- TOGGLE AUDIO SETTINGS DRAWER (ANTI-SCROLL SLIP) ---
  const btnToggleAudioSettings = document.getElementById('btnToggleAudioSettings');
  const audioSettingsCollapseContainer = document.getElementById('audioSettingsCollapseContainer');
  const toggleAudioSettingsTitle = document.getElementById('toggleAudioSettingsTitle');
  const toggleAudioSettingsSub = document.getElementById('toggleAudioSettingsSub');
  const toggleAudioSettingsAction = document.getElementById('toggleAudioSettingsAction');
  const toggleAudioSettingsArrow = document.getElementById('toggleAudioSettingsArrow');

  const setAudioSettingsDrawerState = (isCollapsed, savePref = true) => {
    if (!audioSettingsCollapseContainer || !btnToggleAudioSettings) return;

    if (isCollapsed) {
      audioSettingsCollapseContainer.classList.add('collapsed');
      btnToggleAudioSettings.classList.add('collapsed-state');
      btnToggleAudioSettings.setAttribute('aria-expanded', 'false');
      if (toggleAudioSettingsTitle) {
        toggleAudioSettingsTitle.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('toggleAudioSettingsHidden') : 'Pengaturan Slider & Audio (Disembunyikan)';
      }
      if (toggleAudioSettingsSub) {
        toggleAudioSettingsSub.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('toggleAudioSettingsHiddenSub') : 'Ketuk untuk membuka slider volume, efek & latensi';
      }
      if (toggleAudioSettingsAction) {
        toggleAudioSettingsAction.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnShowSettings') : 'Buka Pengaturan';
      }
      if (toggleAudioSettingsArrow) {
        toggleAudioSettingsArrow.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      }
      if (savePref) localStorage.setItem('sushee_audio_settings_hidden', '1');
    } else {
      audioSettingsCollapseContainer.classList.remove('collapsed');
      btnToggleAudioSettings.classList.remove('collapsed-state');
      btnToggleAudioSettings.setAttribute('aria-expanded', 'true');
      if (toggleAudioSettingsTitle) {
        toggleAudioSettingsTitle.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('toggleAudioSettings') : 'Pengaturan Slider & Audio Lengkap';
      }
      if (toggleAudioSettingsSub) {
        toggleAudioSettingsSub.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('toggleAudioSettingsSub') : 'Sembunyikan agar kontrol tidak tergeser saat scrolling';
      }
      if (toggleAudioSettingsAction) {
        toggleAudioSettingsAction.textContent = (window.i18n && window.i18n.t) ? window.i18n.t('btnHideSettings') : 'Sembunyikan';
      }
      if (toggleAudioSettingsArrow) {
        toggleAudioSettingsArrow.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
      }
      if (savePref) localStorage.setItem('sushee_audio_settings_hidden', '0');
    }
  };

  let lastAudioDrawerToggle = 0;
  const toggleAudioSettingsDrawer = () => {
    const now = Date.now();
    if (now - lastAudioDrawerToggle < 250) return;
    lastAudioDrawerToggle = now;
    const isCurrentlyCollapsed = audioSettingsCollapseContainer && audioSettingsCollapseContainer.classList.contains('collapsed');
    setAudioSettingsDrawerState(!isCurrentlyCollapsed, true);
  };
  window.toggleAudioSettingsDrawer = toggleAudioSettingsDrawer;

  if (btnToggleAudioSettings) {
    btnToggleAudioSettings.addEventListener('click', toggleAudioSettingsDrawer);

    // Check saved state: if user previously collapsed it, restore collapsed state
    const savedAudioCollapse = localStorage.getItem('sushee_audio_settings_hidden');
    if (savedAudioCollapse === '1') {
      setAudioSettingsDrawerState(true, false);
    }
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
          // Fallback to webkitdirectory input
          fileInputFolder.click();
        }
      } catch (err) {
        console.warn("Directory picker error:", err);
        fileInputFolder.click();
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
        </div>
      `;
      return;
    }

    recordingsListContainer.innerHTML = list.map(rec => `
      <div class="recording-card" data-rec-id="${rec.id}">
        <div class="recording-card-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </div>
        <div class="recording-card-info">
          <h4 class="recording-title">${rec.songTitle}</h4>
          <div class="recording-meta">
            <span class="recording-meta-artist">${rec.artist}</span>
            <span class="recording-meta-badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.35);">MP3 320K</span>
            <span class="recording-meta-badge">${rec.preset ? rec.preset.toUpperCase() : 'STUDIO'}</span>
            <span class="recording-meta-duration">⏱️ ${formatTime(rec.duration)}</span>
          </div>
          <span class="recording-date">${new Date(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <div class="recording-card-actions">
          <button type="button" class="btn-rec-action btn-play-rec" data-rec-id="${rec.id}" title="Putar Rekaman" aria-label="Putar Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
          <button type="button" class="btn-rec-action btn-dl-rec" data-rec-id="${rec.id}" title="Simpan / Download Rekaman" aria-label="Simpan Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button type="button" class="btn-rec-action btn-del-rec" data-rec-id="${rec.id}" title="Hapus Rekaman" aria-label="Hapus Rekaman">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

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
    if (metaEl) metaEl.textContent = `${rec.artist} • MP3 320 Kbps • Durasi ${formatTime(rec.duration)} • Preset: ${rec.preset ? rec.preset.toUpperCase() : 'STUDIO'}`;

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

  const audioQualitySelect = document.getElementById('audioQualitySelect');
  if (audioQualitySelect) {
    const savedQuality = localStorage.getItem('karaoke_audio_quality') || '320';
    audioQualitySelect.value = savedQuality;

    audioQualitySelect.addEventListener('change', () => {
      const val = audioQualitySelect.value;
      localStorage.setItem('karaoke_audio_quality', val);
      showToast(window.i18n.t('toastBitrateChanged', { val }), 'success');
    });
  }

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
      try {
        const u = new URL(hostingService.serverUrl);
        serverActiveLabel.innerHTML = `Server: <strong>${u.hostname}</strong> (${songCount} Lagu)`;
      } catch (e) {
        serverActiveLabel.innerHTML = `Server: <strong>${hostingService.serverUrl}</strong>`;
      }
      if (serverStatusPulse) {
        serverStatusPulse.style.background = isConnected ? '#00f2fe' : '#f59e0b';
        serverStatusPulse.style.boxShadow = isConnected ? '0 0 8px #00f2fe' : '0 0 8px #f59e0b';
      }
    } else {
      serverActiveLabel.innerHTML = `Server: <strong>Belum Dikonfigurasi (Demo Cloud)</strong>`;
      if (serverStatusPulse) {
        serverStatusPulse.style.background = '#888';
        serverStatusPulse.style.boxShadow = 'none';
      }
    }
  }

  async function renderCloudSongList() {
    if (!cloudListContainer) return;
    const query = (cloudSearchInput ? cloudSearchInput.value : '').trim();

    // Show instant loading state if container is empty and songs not cached
    if ((!cloudListContainer.children || cloudListContainer.children.length === 0) && (!hostingService.cachedSongs || hostingService.cachedSongs.length === 0)) {
      cloudListContainer.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--color-cyan);">
          <div class="status-dot-pulse" style="width: 14px; height: 14px; margin: 0 auto 12px; background: #00f2fe; box-shadow: 0 0 12px #00f2fe;"></div>
          <p style="font-size: 0.85rem; font-weight: 600;">Menghubungkan ke server hosting & memuat lagu...</p>
        </div>
      `;
    }

    try {
      const songs = await hostingService.searchSongs(query);
      updateServerStatusUI(hostingService.isConnected, songs.length);
      renderSongList(); // Also update the library view so cloud songs show under 'Semua'

      if (songs.length === 0) {
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

      cloudListContainer.innerHTML = songs.map(song => `
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
                `<span class="badge badge-lyrics"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${window.i18n.t('badgeHasLyrics')}</span>` : 
                `<span class="badge badge-no-lyrics">${window.i18n.t('badgeNoLyrics')}</span>`
              }
            </div>
          </div>
          <div class="song-card-actions">
            <button class="btn-icon-sing" title="${window.i18n.t('btnSingNow')}" data-cloud-id="${song.id}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
        </div>
      `).join('');

      cloudListContainer.querySelectorAll('.song-card').forEach(card => {
        card.addEventListener('click', (e) => {
          const id = card.getAttribute('data-cloud-id');
          const song = songs.find(s => s.id === id);
          if (song) {
            selectSong(song, true);
            // If user clicked the play icon directly, start music playback immediately!
            if (e.target.closest('.btn-icon-sing')) {
              toggleMusicPlayback();
            }
          }
        });
      });
    } catch (e) {
      console.error("Error rendering Cloud Hosting list:", e);
    }
  }

  if (cloudSearchInput) {
    cloudSearchInput.addEventListener('input', () => {
      renderCloudSongList();
    });
  }

  let lastServerDrawerToggle = 0;
  const toggleDrawer = () => {
    const now = Date.now();
    if (now - lastServerDrawerToggle < 250) return;
    lastServerDrawerToggle = now;
    if (!serverConfigDrawer) return;
    const isVisible = serverConfigDrawer.style.display !== 'none';
    serverConfigDrawer.style.display = isVisible ? 'none' : 'block';
  };
  window.toggleServerConfigDrawer = toggleDrawer;
  if (btnToggleServerConfig) btnToggleServerConfig.addEventListener('click', toggleDrawer);
  if (btnToggleServerConfigAlt) btnToggleServerConfigAlt.addEventListener('click', toggleDrawer);

  if (btnSaveServerConfig) {
    btnSaveServerConfig.addEventListener('click', async () => {
      const url = serverUrlInput ? serverUrlInput.value.trim() : '';
      if (!url) {
        showToast(window.i18n.t('toastEnterServerUrl'), 'warning');
        return;
      }

      showToast(window.i18n.t('toastConnectingServer'), 'info');
      try {
        const res = await hostingService.testConnection(url);
        if (serverConfigDrawer) serverConfigDrawer.style.display = 'none';
        showToast(window.i18n.t('toastConnectedServer', { count: res.total }), 'success');
        renderCloudSongList();
      } catch (err) {
        showToast(window.i18n.t('toastConnectFailed', { err: err.message }), 'error');
      }
    });
  }

  if (btnOpenServerExternal) {
    btnOpenServerExternal.addEventListener('click', () => {
      if (hostingService.serverUrl) {
        window.open(hostingService.serverUrl, '_blank');
      } else {
        showToast(window.i18n.t('toastFillServerFirst'), 'warning');
      }
    });
  }

  if (btnRefreshCloudSongs) {
    btnRefreshCloudSongs.addEventListener('click', () => {
      showToast(window.i18n.t('toastRefreshingServer'), 'info');
      renderCloudSongList();
    });
  }

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

  // --- INITIALIZE UI ---
  renderSongList();
  renderRecordingsList();
  renderCloudSongList().then(() => {
    renderSongList();
    // Select first real cloud song by default if available
    if (!currentSong && hostingService.cachedSongs && hostingService.cachedSongs.length > 0) {
      selectSong(hostingService.cachedSongs[0], false);
    } else if (!currentSong && storageScanner.songs.length > 0) {
      selectSong(storageScanner.songs[0], false);
    }
  });
}

// Ensure initApp runs whether DOM is loading or already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
