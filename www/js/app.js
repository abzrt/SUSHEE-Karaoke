/**
 * SUSHEE - Songbook Karaoke
 * Main Application Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- SPLASH SCREEN OPENING ANIMATION ---
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) {
    let splashDismissed = false;
    const dismissSplash = () => {
      if (splashDismissed) return;
      splashDismissed = true;
      splashScreen.classList.add('fade-out');
      setTimeout(() => {
        if (splashScreen.parentNode) {
          splashScreen.parentNode.removeChild(splashScreen);
        }
      }, 750);
    };

    // Auto dismiss after 2.6 seconds of cool opening intro
    setTimeout(dismissSplash, 2600);

    // Allow user to tap/click anywhere to skip immediately
    splashScreen.addEventListener('click', dismissSplash);
    splashScreen.addEventListener('touchstart', dismissSplash, { passive: true });
  }

  // Elements
  const audioElement = document.getElementById('musicAudio');
  const visualizerCanvas = document.getElementById('visualizerCanvas');
  const lyricsContainer = document.getElementById('lyricsContainer');

  // Initialize Core Systems
  const audioEngine = new AudioEffectsEngine();
  const storageScanner = new StorageScanner();
  const recorder = new KaraokeRecorder(audioEngine);
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
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Format seconds to mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- TAB NAVIGATION ---
  const navButtons = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.app-view');

  function switchTab(viewId) {
    views.forEach(v => v.classList.remove('active'));
    navButtons.forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    const activeBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (viewId === 'viewKaraoke') {
      if (visualizer) visualizer.resizeCanvas();
    }
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      switchTab(viewId);
    });
  });

  // --- LANGUAGE SWITCHING ---
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      window.i18n.setLanguage(lang);
      renderSongList();
      renderRecordingsList();
      showToast(lang === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language switched to English', 'success');
    });
  });

  // --- SONG LIBRARY RENDERING ---
  const songsListContainer = document.getElementById('songsList');
  const searchInput = document.getElementById('songSearchInput');
  const filterButtons = document.querySelectorAll('.filter-chip');
  let currentFilter = 'all';

  filterButtons.forEach(chip => {
    chip.addEventListener('click', () => {
      filterButtons.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      renderSongList();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderSongList();
    });
  }

  function renderSongList() {
    if (!songsListContainer) return;
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    let filtered = storageScanner.songs.filter(song => {
      const matchesSearch = song.title.toLowerCase().includes(query) ||
                            song.artist.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (currentFilter === 'local') return song.source === 'local';
      if (currentFilter === 'sample') return song.source === 'sample';
      return true;
    });

    if (filtered.length === 0) {
      songsListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎵</div>
          <h4 data-i18n="emptyLibraryTitle">${window.i18n.t('emptyLibraryTitle')}</h4>
          <p data-i18n="emptyLibraryDesc">${window.i18n.t('emptyLibraryDesc')}</p>
          <div class="empty-actions">
            <button class="btn btn-primary" id="btnEmptyScan">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>${window.i18n.t('btnScanStorage')}</span>
            </button>
          </div>
        </div>
      `;
      const emptyScan = document.getElementById('btnEmptyScan');
      if (emptyScan) emptyScan.addEventListener('click', openScanModal);
      return;
    }

    songsListContainer.innerHTML = filtered.map(song => `
      <div class="song-card ${currentSong && currentSong.id === song.id ? 'now-playing' : ''}" data-song-id="${song.id}">
        <div class="song-card-avatar">
          <div class="music-disc-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
        </div>
        <div class="song-card-info">
          <h4 class="song-card-title">${song.title}</h4>
          <p class="song-card-artist">${song.artist}</p>
          <div class="song-badges">
            <span class="badge badge-format">${song.format || '.MP3'}</span>
            ${song.hasLyrics ? 
              `<span class="badge badge-lyrics"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${window.i18n.t('badgeHasLyrics')}</span>` : 
              `<span class="badge badge-no-lyrics">${window.i18n.t('badgeNoLyrics')}</span>`
            }
            <span class="badge badge-source">${song.source === 'local' ? 'HP' : 'Sample'}</span>
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
        const song = storageScanner.songs.find(s => s.id === songId);
        if (song) {
          selectSong(song, true);
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

    // Audio element source
    audioElement.src = song.audioUrl;
    audioElement.load();

    // Parse lyrics
    if (song.hasLyrics && song.lrcContent) {
      lrcParser.parse(song.lrcContent);
      renderLyricsView();
    } else {
      lrcParser.lines = [];
      renderEmptyLyricsView();
    }

    renderSongList();

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

  async function toggleKaraoke() {
    if (!currentSong) {
      showToast(window.i18n.t('noSongSelected'), 'warning');
      switchTab('viewSongs');
      return;
    }

    if (!isKaraokePlaying) {
      // START KARAOKE
      try {
        await audioEngine.init(audioElement);
        await audioEngine.startMicrophone();
        
        // Start simultaneous recording
        recorder.startRecording();

        await audioElement.play();
        isKaraokePlaying = true;
        if (visualizer) visualizer.start();

        updateKaraokeUIState(true);
        showToast('Karaoke & Perekaman Dimulai!', 'success');
      } catch (err) {
        showToast(err.message || 'Gagal memulai karaoke / mikrofon.', 'error');
        console.error(err);
      }
    } else {
      // STOP KARAOKE & SAVE RECORDING
      audioElement.pause();
      isKaraokePlaying = false;
      if (visualizer) visualizer.stop();

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
        showToast(window.i18n.t('recordingSaved'), 'success');
      } else {
        showToast('Rekaman terlalu pendek untuk disimpan.', 'info');
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

  if (btnKaraokeAction) {
    btnKaraokeAction.addEventListener('click', toggleKaraoke);
  }

  if (btnRestartKaraoke) {
    btnRestartKaraoke.addEventListener('click', () => {
      audioElement.currentTime = 0;
      if (isKaraokePlaying) {
        audioElement.play();
      }
    });
  }

  // --- STARMAKER VOCAL EFFECT PRESET SELECTOR ---
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.getAttribute('data-preset');
      audioEngine.applyPreset(preset);
      showToast(`Efek Vokal: ${btn.textContent.trim()}`, 'info');
    });
  });

  // Slider controls (Volume, Reverb, Echo, Tone)
  const vocalVolSlider = document.getElementById('vocalVolSlider');
  const musicVolSlider = document.getElementById('musicVolSlider');
  const reverbSlider = document.getElementById('reverbSlider');
  const echoSlider = document.getElementById('echoSlider');
  const toneSlider = document.getElementById('toneSlider');
  const earphoneMonitorToggle = document.getElementById('earphoneMonitorToggle');

  if (vocalVolSlider) {
    vocalVolSlider.addEventListener('input', () => {
      audioEngine.setVocalVolume(vocalVolSlider.value);
    });
  }

  if (musicVolSlider) {
    musicVolSlider.addEventListener('input', () => {
      audioEngine.setMusicVolume(musicVolSlider.value);
    });
  }

  if (reverbSlider) {
    reverbSlider.addEventListener('input', () => {
      audioEngine.setReverbAmount(reverbSlider.value);
    });
  }

  if (echoSlider) {
    echoSlider.addEventListener('input', () => {
      audioEngine.setEchoAmount(echoSlider.value);
    });
  }

  if (toneSlider) {
    toneSlider.addEventListener('input', () => {
      audioEngine.setVocalTone(toneSlider.value);
    });
  }

  if (earphoneMonitorToggle) {
    earphoneMonitorToggle.addEventListener('change', () => {
      audioEngine.setMonitoring(earphoneMonitorToggle.checked);
      if (earphoneMonitorToggle.checked) {
        showToast('Monitor Earphone Aktif (Gunakan Earphone)', 'warning');
      }
    });
  }

  // --- LATENCY & AUDIO SYNC ADJUSTMENT ---
  const latencySlider = document.getElementById('latencySlider');
  const latencyDisplayVal = document.getElementById('latencyDisplayVal');
  const latencyChips = document.querySelectorAll('.btn-latency-chip');

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
  }

  // Restore saved latency offset
  const savedLatency = parseInt(localStorage.getItem('sushee_latency_offset'), 10) || 0;
  updateLatencyUI(savedLatency, true);

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

  latencyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const val = parseInt(chip.getAttribute('data-latency'), 10) || 0;
      updateLatencyUI(val, true);
      audioEngine.setLatencyOffset(val);
      showToast(window.i18n.t('latencyToast', { ms: (val > 0 ? '+' : '') + val }), 'info');
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
        if (calibrateStatusTitle) calibrateStatusTitle.textContent = 'Gagal Mengukur Latensi';
        if (calibrateStatusDesc) calibrateStatusDesc.textContent = 'Pastikan izin mikrofon telah diberikan lalu coba kembali.';
        showToast('Gagal mengukur latensi otomatis', 'error');
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
        showToast('File lirik .LRC berhasil dipasang!', 'success');
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </div>
        <div class="recording-card-info">
          <h4 class="recording-title">${rec.songTitle}</h4>
          <p class="recording-meta">${rec.artist} • Efek: <strong>${rec.preset}</strong> • Durasi: ${formatTime(rec.duration)}</p>
          <span class="recording-date">${new Date(rec.date).toLocaleDateString()}</span>
        </div>
        <div class="recording-card-actions">
          <button class="btn btn-icon-round btn-play-rec" data-rec-id="${rec.id}" title="Putar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="btn btn-icon-round btn-dl-rec" data-rec-id="${rec.id}" title="Download">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="btn btn-icon-round btn-del-rec" data-rec-id="${rec.id}" title="Hapus">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach events
    recordingsListContainer.querySelectorAll('.btn-play-rec').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-rec-id');
        const rec = recorder.recordings.find(r => r.id === id);
        if (rec) showRecordingModal(rec);
      });
    });

    recordingsListContainer.querySelectorAll('.btn-dl-rec').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-rec-id');
        const rec = recorder.recordings.find(r => r.id === id);
        if (rec) recorder.downloadRecording(rec);
      });
    });

    recordingsListContainer.querySelectorAll('.btn-del-rec').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-rec-id');
        await recorder.deleteRecordingFromDB(id);
        renderRecordingsList();
        showToast('Rekaman dihapus.', 'info');
      });
    });
  }

  function showRecordingModal(rec) {
    currentModalRecording = rec;
    if (modalRecAudio) {
      modalRecAudio.src = rec.url;
      modalRecAudio.load();
    }
    const titleEl = document.getElementById('modalRecTitle');
    const metaEl = document.getElementById('modalRecMeta');
    if (titleEl) titleEl.textContent = rec.songTitle;
    if (metaEl) metaEl.textContent = `${rec.artist} • Durasi ${formatTime(rec.duration)} • Preset: ${rec.preset}`;

    if (recordingModal) recordingModal.classList.add('open');
  }

  if (btnCloseRecModal) {
    btnCloseRecModal.addEventListener('click', () => {
      if (modalRecAudio) modalRecAudio.pause();
      if (recordingModal) recordingModal.classList.remove('open');
    });
  }

  if (btnDownloadRec) {
    btnDownloadRec.addEventListener('click', () => {
      if (currentModalRecording) {
        recorder.downloadRecording(currentModalRecording);
      }
    });
  }

  // --- INITIALIZE UI ---
  renderSongList();
  renderRecordingsList();

  // If sample songs exist, select the first one by default
  if (storageScanner.songs.length > 0) {
    selectSong(storageScanner.songs[0], false);
  }
});
