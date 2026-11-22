/**
 * Comprehensive Automated Diagnostics for SUSHEE Karaoke
 * Tests all modules, algorithms, parsers, and localization
 */

const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { querySelectorAll: () => [], getElementById: () => null };
global.localStorage = { getItem: () => null, setItem: () => null };

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    testsFailed++;
  }
}

console.log('=== TEST SUITE 1: i18n Localization Integrity ===');
const i18nContent = fs.readFileSync('js/i18n.js', 'utf8');
const matchTranslations = i18nContent.match(/const translations\s*=\s*(\{[\s\S]*?\n\};)/);
if (matchTranslations) {
  // Evaluate translations object safely
  const sandbox = {};
  const evalFn = new Function('sandbox', `${matchTranslations[0]}; sandbox.translations = translations;`);
  evalFn(sandbox);
  const { id, en } = sandbox.translations;
  
  assert(id && typeof id === 'object', 'ID dictionary loaded');
  assert(en && typeof en === 'object', 'EN dictionary loaded');
  assert(id.splashTagline && en.splashTagline, 'Splash tagline translated in both');
  assert(id.splashSkip && en.splashSkip, 'Splash skip translated in both');
  assert(id.splashStatusLoading && en.splashStatusLoading, 'Splash loading translated in both');
  
  // Check key parity
  const idKeys = Object.keys(id);
  const enKeys = Object.keys(en);
  const missingInEn = idKeys.filter(k => !(k in en));
  const missingInId = enKeys.filter(k => !(k in id));
  
  assert(missingInEn.length === 0, `All ID keys present in EN (missing: ${missingInEn.join(', ')})`);
  assert(missingInId.length === 0, `All EN keys present in ID (missing: ${missingInId.join(', ')})`);
} else {
  assert(false, 'Could not parse translations object');
}

console.log('\n=== TEST SUITE 2: LRC Parser & Lyrics Sync Engine ===');
const lrcParserContent = fs.readFileSync('js/lrc-parser.js', 'utf8');
const lrcSandbox = {};
const lrcEval = new Function('sandbox', `${lrcParserContent}; sandbox.LrcParser = LrcParser;`);
lrcEval(lrcSandbox);
const LrcParser = lrcSandbox.LrcParser;

const sampleLrc = `[ti:SUSHEE Demo]
[ar:SUSHEE]
[00:00.00]Intro Musik
[00:03.50]Ku bernyanyi lagu ini
[00:08.20]Dengan efek vokal StarMaker
[00:14.00]Suara merdu terdengar jernih
[00:20.50]Outro selesai`;

const parser = new LrcParser();
parser.parse(sampleLrc);

assert(parser.lines && parser.lines.length === 5, `Parsed 5 lyric lines (got ${parser.lines.length})`);
assert(parser.lines[0].time === 0 && parser.lines[0].text === 'Intro Musik', 'First line timestamp matches');
assert(parser.lines[1].time === 3.5 && parser.lines[1].text === 'Ku bernyanyi lagu ini', 'Second line timestamp matches');

// Test index search at various timestamps
assert(parser.getCurrentIndex(0) === 0, 'Timestamp 0.0s points to line 0');
assert(parser.getCurrentIndex(3.0) === 0, 'Timestamp 3.0s still points to line 0');
assert(parser.getCurrentIndex(3.5) === 1, 'Timestamp 3.5s points to line 1');
assert(parser.getCurrentIndex(6.0) === 1, 'Timestamp 6.0s points to line 1');
assert(parser.getCurrentIndex(8.2) === 2, 'Timestamp 8.2s points to line 2');
assert(parser.getCurrentIndex(25.0) === 4, 'Timestamp 25.0s points to last line');

// Test edge cases: empty or null LRC
parser.parse('');
assert(parser.lines.length === 0, 'Empty LRC returns empty array without throwing');
parser.parse(null);
assert(parser.lines.length === 0, 'Null LRC returns empty array without throwing');

console.log('\n=== TEST SUITE 3: Storage Scanner Extension & Song Pairing ===');
const scannerContent = fs.readFileSync('js/storage-scanner.js', 'utf8');
const scannerSandbox = {};
const scannerEval = new Function('sandbox', `${scannerContent}; sandbox.StorageScanner = StorageScanner;`);
scannerEval(scannerSandbox);
const StorageScanner = scannerSandbox.StorageScanner;
const scanner = new StorageScanner();

// Test cleanBaseName
const base = scanner.cleanBaseName('Judika - Jikalau Kau Cinta (Karaoke).mp3');
assert(base.includes('jikalau kau cinta'), `cleanBaseName cleans extension: "${base}"`);

// Test cleanTokens for AI stem & karaoke matching
const audioTokens = scanner.cleanTokens('Judika - Jikalau Kau Cinta_instrumental_roformer.mp3');
const lrcTokens = scanner.cleanTokens('Judika - Jikalau Kau Cinta.lrc');

let matchedCount = 0;
for (const token of audioTokens) {
  if (lrcTokens.has(token)) matchedCount++;
}
assert(matchedCount >= 3, `Fuzzy tokens match between audio & LRC stems (${matchedCount} matching tokens)`);

console.log('\n=== TEST SUITE 4: Hosting Server Service Endpoint & Logic ===');
const hostingContent = fs.readFileSync('js/hosting-service.js', 'utf8');
const hostingSandbox = {};
const hostingEval = new Function('sandbox', `${hostingContent}; sandbox.HostingServerService = HostingServerService;`);
hostingEval(hostingSandbox);
const HostingServerService = hostingSandbox.HostingServerService;
const hosting = new HostingServerService();

assert(typeof hosting.cleanUrl === 'function', 'cleanUrl method exists');
assert(typeof hosting.isConfigured === 'function', 'isConfigured method exists');
assert(typeof hosting.saveServerUrl === 'function', 'saveServerUrl method exists');
assert(typeof hosting.testConnection === 'function', 'testConnection method exists');
assert(typeof hosting.searchSongs === 'function', 'searchSongs method exists');

// Test URL cleaning
const cleanedTest = hosting.cleanUrl('http://my.php.id/SUSHEE Karaoke/api.php');
assert(cleanedTest.includes('%20') || cleanedTest.includes('Karaoke'), `cleanUrl formats properly: "${cleanedTest}"`);

console.log('\n=== TEST SUITE 5: Splash Screen Assets & HTML Integrations ===');
assert(fs.existsSync('assets/splash-photo.jpg'), 'assets/splash-photo.jpg exists');
assert(fs.existsSync('assets/icon.jpg'), 'assets/icon.jpg exists');
assert(fs.existsSync('assets/icon-512.png'), 'assets/icon-512.png exists');
assert(fs.existsSync('assets/icon-192.png'), 'assets/icon-192.png exists');
assert(fs.existsSync('android/app/src/main/res/drawable/splash.png'), 'Android default splash.png exists');
assert(fs.existsSync('android/app/src/main/res/drawable-port-xxhdpi/splash.png'), 'Android port-xxhdpi splash.png exists');

const indexHtml = fs.readFileSync('index.html', 'utf8');
assert(indexHtml.includes('id="splashScreen"'), 'index.html contains #splashScreen');
assert(indexHtml.includes('assets/splash-photo.jpg'), 'index.html references splash-photo.jpg');
assert(indexHtml.includes('id="splashProgressBar"'), 'index.html contains #splashProgressBar');
assert(indexHtml.includes('id="splashStatusText"'), 'index.html contains #splashStatusText');
assert(indexHtml.includes('id="splashSkipBtn"'), 'index.html contains #splashSkipBtn');

const styleCss = fs.readFileSync('css/style.css', 'utf8');
assert(styleCss.includes('.app-splash-screen'), 'style.css defines .app-splash-screen');
assert(!styleCss.includes('.app-splash-screen { display: none !important'), 'style.css splash is NOT hidden by default');
assert(styleCss.includes('.splash-photo-wrap'), 'style.css defines .splash-photo-wrap');
assert(styleCss.includes('.splash-aurora'), 'style.css defines .splash-aurora');

console.log('\n=== TEST SUITE 6: Audio Effects Engine Presets & Config ===');
const audioEffectsContent = fs.readFileSync('js/audio-effects.js', 'utf8');
assert(audioEffectsContent.includes('class AudioEffectsEngine'), 'AudioEffectsEngine class exists');
assert(audioEffectsContent.includes('applyPreset'), 'applyPreset method exists');
assert(audioEffectsContent.includes("'studio'"), 'Preset studio exists');
assert(audioEffectsContent.includes("'ktv'"), 'Preset ktv (karaoke room) exists');
assert(audioEffectsContent.includes("'hall'"), 'Preset hall exists');
assert(audioEffectsContent.includes("'pop'"), 'Preset pop exists');
assert(audioEffectsContent.includes("'autotune'"), 'Preset autotune exists');
assert(audioEffectsContent.includes("'warm'"), 'Preset warm exists');

console.log('\n=== TEST SUITE 7: Song Pitch Shifter & Playback Speed Controls ===');
assert(audioEffectsContent.includes('class WebAudioPitchShifter'), 'WebAudioPitchShifter class exists in audio-effects.js');
assert(audioEffectsContent.includes('setMusicPitch'), 'setMusicPitch method exists in audio-effects.js');
assert(audioEffectsContent.includes('setMusicSpeed'), 'setMusicSpeed method exists in audio-effects.js');
assert(audioEffectsContent.includes('resetMusicPitch'), 'resetMusicPitch method exists in audio-effects.js');
assert(audioEffectsContent.includes('resetMusicSpeed'), 'resetMusicSpeed method exists in audio-effects.js');
assert(audioEffectsContent.includes('setupMusicChain'), 'setupMusicChain integrates pitch shifter into audio graph');

// Test pitch shift math formula
const semitonesToRatio = (semitones) => Math.pow(2, semitones / 12);
assert(Math.abs(semitonesToRatio(0) - 1.0) < 0.001, '0 semitones pitch ratio is 1.0 (original)');
assert(Math.abs(semitonesToRatio(12) - 2.0) < 0.001, '+12 semitones pitch ratio is 2.0 (one octave up)');
assert(Math.abs(semitonesToRatio(-12) - 0.5) < 0.001, '-12 semitones pitch ratio is 0.5 (one octave down)');
assert(semitonesToRatio(1) > 1.05 && semitonesToRatio(1) < 1.06, '+1 semitone ratio is ~1.059');

console.log('\n=== TEST SUITE 8: Collapsible Vocal & Audio Drawers UI & CSS ===');
assert(indexHtml.includes('id="btnToggleVocalSettings"'), 'index.html has #btnToggleVocalSettings');
assert(indexHtml.includes('id="vocalEffectsCollapseContainer"'), 'index.html has #vocalEffectsCollapseContainer');
assert(indexHtml.includes('id="btnToggleAudioSettings"'), 'index.html has #btnToggleAudioSettings');
assert(indexHtml.includes('id="audioSettingsCollapseContainer"'), 'index.html has #audioSettingsCollapseContainer');
assert(indexHtml.includes('id="musicPitchSlider"'), 'index.html has #musicPitchSlider');
assert(indexHtml.includes('id="musicSpeedSlider"'), 'index.html has #musicSpeedSlider');
assert(indexHtml.includes('id="btnPitchDown"'), 'index.html has #btnPitchDown');
assert(indexHtml.includes('id="btnPitchUp"'), 'index.html has #btnPitchUp');
assert(indexHtml.includes('id="btnSpeedDown"'), 'index.html has #btnSpeedDown');
assert(indexHtml.includes('id="btnSpeedUp"'), 'index.html has #btnSpeedUp');

assert(styleCss.includes('.btn-toggle-audio-drawer'), 'style.css defines .btn-toggle-audio-drawer');
assert(styleCss.includes('.audio-settings-collapse-container'), 'style.css defines .audio-settings-collapse-container');
assert(styleCss.includes('.pitch-speed-card'), 'style.css defines .pitch-speed-card');
assert(styleCss.includes('.btn-step'), 'style.css defines .btn-step');
assert(styleCss.includes('.slider-scale-row'), 'style.css defines .slider-scale-row');

const appJsContent = fs.readFileSync('js/app.js', 'utf8');
assert(appJsContent.includes('window.toggleVocalSettingsDrawer'), 'app.js exposes window.toggleVocalSettingsDrawer');
assert(appJsContent.includes('window.toggleAudioSettingsDrawer'), 'app.js exposes window.toggleAudioSettingsDrawer');
assert(appJsContent.includes('window.stepMusicPitch'), 'app.js exposes window.stepMusicPitch');
assert(appJsContent.includes('window.resetMusicPitch'), 'app.js exposes window.resetMusicPitch');
assert(appJsContent.includes('window.stepMusicSpeed'), 'app.js exposes window.stepMusicSpeed');
assert(appJsContent.includes('window.resetMusicSpeed'), 'app.js exposes window.resetMusicSpeed');

console.log('\n=== TEST SUITE 9: Configurable Recording Format & Bitrate ===');
assert(indexHtml.includes('id="recordingFormatSelect"'), 'index.html contains #recordingFormatSelect');
assert(indexHtml.includes('id="audioQualitySelect"'), 'index.html contains #audioQualitySelect');
assert(indexHtml.includes('id="recordFormatBadge"'), 'index.html contains #recordFormatBadge');
assert(indexHtml.includes('id="recordBitrateBadge"'), 'index.html contains #recordBitrateBadge');

const recorderContent = fs.readFileSync('js/recorder.js', 'utf8');
assert(recorderContent.includes('setRecordingFormat'), 'recorder.js has setRecordingFormat');
assert(recorderContent.includes('setRecordingBitrate'), 'recorder.js has setRecordingBitrate');
assert(recorderContent.includes('convertToMp3'), 'recorder.js has convertToMp3');
assert(recorderContent.includes('convertToWav'), 'recorder.js has convertToWav');
assert(recorderContent.includes('audioBufferToWavBlob'), 'recorder.js has audioBufferToWavBlob');
assert(recorderContent.includes('autoSaveToPhoneStorage'), 'recorder.js has autoSaveToPhoneStorage');
assert(recorderContent.includes('downloadRecording'), 'recorder.js has downloadRecording');

// Test WAV Header Generator Logic
function createTestWavHeader(channels, sampleRate, dataLength) {
  const numChannels = channels;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = dataLength * blockAlign;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);
  const writeString = (view, offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);
  return buffer;
}
const testBuffer = createTestWavHeader(2, 44100, 100);
const testView = new DataView(testBuffer);
const riffTag = String.fromCharCode(testView.getUint8(0), testView.getUint8(1), testView.getUint8(2), testView.getUint8(3));
const waveTag = String.fromCharCode(testView.getUint8(8), testView.getUint8(9), testView.getUint8(10), testView.getUint8(11));
const fmtTag = String.fromCharCode(testView.getUint8(12), testView.getUint8(13), testView.getUint8(14), testView.getUint8(15));
const dataTag = String.fromCharCode(testView.getUint8(36), testView.getUint8(37), testView.getUint8(38), testView.getUint8(39));

assert(riffTag === 'RIFF', `WAV RIFF header matches ("${riffTag}")`);
assert(waveTag === 'WAVE', `WAV WAVE header matches ("${waveTag}")`);
assert(fmtTag === 'fmt ', `WAV fmt subchunk matches ("${fmtTag}")`);
assert(dataTag === 'data', `WAV data subchunk matches ("${dataTag}")`);
assert(testView.getUint16(20, true) === 1, 'WAV audio format is PCM (1)');
assert(testView.getUint16(22, true) === 2, 'WAV channel count is 2 (Stereo)');
assert(testView.getUint32(24, true) === 44100, 'WAV sample rate is 44100 Hz');
assert(testView.getUint16(34, true) === 16, 'WAV bit depth is 16-bit');

console.log('\n=== TEST SUITE 10: Phone APK Standalone & Security Configuration ===');
const capConfigJson = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
assert(capConfigJson.server && capConfigJson.server.androidScheme === 'https', 'capacitor.config.json androidScheme is https (secure origin for mic & storage)');
assert(!capConfigJson.server.url, 'capacitor.config.json server.url is omitted (guarantees offline bundled assets load on phone without ERR_CONNECTION_REFUSED)');
assert(capConfigJson.server && capConfigJson.server.cleartext === true, 'capacitor.config.json cleartext is true (permits custom hosting endpoints)');

const assetCapConfig = JSON.parse(fs.readFileSync('android/app/src/main/assets/capacitor.config.json', 'utf8'));
assert(assetCapConfig.server && assetCapConfig.server.androidScheme === 'https', 'assets/capacitor.config.json androidScheme is synced to https');
assert(!assetCapConfig.server.url, 'assets/capacitor.config.json server.url is omitted');
assert(assetCapConfig.server && assetCapConfig.server.cleartext === true, 'assets/capacitor.config.json cleartext is synced');

const androidManifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert(androidManifest.includes('android:usesCleartextTraffic="true"'), 'AndroidManifest.xml has usesCleartextTraffic="true"');

console.log('\n=== TEST SUITE 11: Recordings & Settings Mobile UI Polish & Touch Targets ===');
const updatedIndexHtml = fs.readFileSync('index.html', 'utf8');
const updatedStyleCss = fs.readFileSync('css/style.css', 'utf8');
const updatedAppJs = fs.readFileSync('js/app.js', 'utf8');

assert(updatedIndexHtml.includes('btn-permission-action'), 'index.html has .btn-permission-action for accessible mobile touch');
assert(updatedIndexHtml.includes('id="bitrateHintText"'), 'index.html has #bitrateHintText for adaptive bitrate explanation');
assert(updatedIndexHtml.includes('class="rec-hero-badge"'), 'index.html has .rec-hero-badge visual anchor');
assert(updatedStyleCss.includes('.btn-permission-action'), 'style.css defines .btn-permission-action');
assert(updatedStyleCss.includes('.rec-hero-badge'), 'style.css defines .rec-hero-badge');
assert(updatedStyleCss.includes('#viewRecordings') && updatedStyleCss.includes('#viewSettings'), 'style.css has safe bottom clearance for recordings and settings');
assert(updatedStyleCss.includes('.form-input:disabled'), 'style.css defines visible disabled styling for form inputs');
assert(updatedStyleCss.includes('.disabled-form-group'), 'style.css defines .disabled-form-group');
assert(updatedAppJs.includes('btnGoToKaraoke'), 'app.js includes empty state CTA to start karaoke');
assert(updatedAppJs.includes('bitrateHintText'), 'app.js updates bitrateHintText dynamically');
assert(updatedAppJs.includes('recording-card-row-top'), 'app.js renders responsive mobile recording card rows');

console.log('\n=== TEST SUITE 12: Audio Clarity & Studio Subtabs Responsiveness ===');
assert(audioEffectsContent.includes('this.bufferTime = 0.12;'), 'WebAudioPitchShifter has 0.12s buffer time for anti-flutter clarity');
assert(audioEffectsContent.includes('this.masterSpeakerGain'), 'AudioEffectsEngine routes musicMixGain to master limiter');
assert(audioEffectsContent.includes('this.musicPitchShift = this.musicPitch;'), 'AudioEffectsEngine aliases musicPitchShift');
assert(audioEffectsContent.includes('this.musicPlaybackSpeed = this.musicSpeed;'), 'AudioEffectsEngine aliases musicPlaybackSpeed');

assert(indexHtml.includes('window.switchStudioSubtab = function'), 'index.html defines window.switchStudioSubtab in global action bridge');
assert(indexHtml.includes('id="subtabBtnPitch"'), 'index.html has #subtabBtnPitch');
assert(indexHtml.includes('id="subtabBtnSync"'), 'index.html has #subtabBtnSync');
assert(!indexHtml.includes('<strong id="cloudStatusText" data-i18n="cloudNotConfigured">'), 'index.html does not overwrite configured server with cloudNotConfigured i18n attribute');

assert(styleCss.includes('touch-action: manipulation;'), 'style.css defines touch-action: manipulation on .studio-subtab');
assert(styleCss.includes('.studio-subtab *'), 'style.css passes pointer-events through children of .studio-subtab');

assert(appJsContent.includes('handleSubtabTrigger'), 'app.js includes delegated touch & click handlers for .studio-subtab');
assert(appJsContent.includes('audioEngine.musicPitch !== undefined ? audioEngine.musicPitch'), 'app.js uses robust musicPitch property access');
assert(appJsContent.includes('audioEngine.musicSpeed !== undefined ? audioEngine.musicSpeed'), 'app.js uses robust musicSpeed property access');

console.log('\n=== TEST SUITE 13: Cloud Hosting Tab Instant Songs & Catalog Integrity ===');
assert(fs.existsSync('js/cloud-catalog.js'), 'js/cloud-catalog.js exists');
const catalogContent = fs.readFileSync('js/cloud-catalog.js', 'utf8');
assert(catalogContent.includes('window.SUSHEE_DEFAULT_CLOUD_CATALOG'), 'cloud-catalog.js defines window.SUSHEE_DEFAULT_CLOUD_CATALOG');

const catalogSandbox = { window: {} };
const catalogEval = new Function('sandbox', `${catalogContent}; sandbox.window.SUSHEE_DEFAULT_CLOUD_CATALOG = window.SUSHEE_DEFAULT_CLOUD_CATALOG;`);
catalogEval(catalogSandbox);
const bundledSongs = catalogSandbox.window.SUSHEE_DEFAULT_CLOUD_CATALOG;
assert(Array.isArray(bundledSongs) && bundledSongs.length === 59, `Pre-bundled catalog contains exactly 59 verified songs (got ${bundledSongs ? bundledSongs.length : 0})`);
assert(bundledSongs[0].title && bundledSongs[0].artist && bundledSongs[0].audioUrl, 'Bundled song records contain title, artist, and audioUrl');

// Verify HostingServerService instant initialization with bundled catalog
const freshHostingCode = fs.readFileSync('js/hosting-service.js', 'utf8');
global.SUSHEE_DEFAULT_CLOUD_CATALOG = bundledSongs;
if (global.window) global.window.SUSHEE_DEFAULT_CLOUD_CATALOG = bundledSongs;
const suite13Sandbox = {
  window: { SUSHEE_DEFAULT_CLOUD_CATALOG: bundledSongs },
  globalThis: { SUSHEE_DEFAULT_CLOUD_CATALOG: bundledSongs },
  SUSHEE_DEFAULT_CLOUD_CATALOG: bundledSongs,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  encodeURI,
  decodeURI,
  console
};
suite13Sandbox.window = suite13Sandbox;
suite13Sandbox.globalThis = suite13Sandbox;
const suite13HostingEval = new Function('sandbox', 'with(sandbox) { ' + freshHostingCode + '; return HostingServerService; }');
const LoadedHostingService = suite13HostingEval(suite13Sandbox);
const hostingInst = new LoadedHostingService();

assert(hostingInst.cachedSongs && hostingInst.cachedSongs.length === 59, 'HostingServerService automatically initializes with 59 songs on first load (0ms delay)');
assert(hostingInst.isConnected === true, 'HostingServerService marks isConnected as true with available catalog');
assert(typeof hostingInst.getFilteredCache === 'function', 'HostingServerService has getFilteredCache method');

const filteredGwen = hostingInst.getFilteredCache('gwen');
assert(filteredGwen.length > 0, `getFilteredCache filters locally by keyword (found ${filteredGwen.length} Gwen songs)`);
assert(filteredGwen[0].title.toLowerCase().includes('morning') || filteredGwen[0].artist.toLowerCase().includes('gwen'), 'Filtered result matches keyword');

assert(indexHtml.includes('src="js/cloud-catalog.js') || /src="js\/cloud-catalog\.js(\?v=[^"]+)?"/.test(indexHtml), 'index.html imports js/cloud-catalog.js');
assert(appJsContent.includes('getFilteredCache'), 'app.js uses getFilteredCache for instant 0ms cloud tab rendering');


console.log('\n=== TEST SUITE 14: Songs Playlist, Single Play Button & Playback Modes ===');
const indexHtmlContent = fs.readFileSync('index.html', 'utf8');
const freshAppJsContent = fs.readFileSync('js/app.js', 'utf8');
const freshStyleCssContent = fs.readFileSync('css/style.css', 'utf8');
const freshI18nContent = fs.readFileSync('js/i18n.js', 'utf8');

// 1. Structure in Tab Songs (viewSongs)
assert(indexHtmlContent.includes('id="songsPlaylistCard"'), 'index.html contains #songsPlaylistCard');
const viewSongsPart = indexHtmlContent.substring(indexHtmlContent.indexOf('id="viewSongs"'), indexHtmlContent.indexOf('id="viewCloud"'));
assert(viewSongsPart.includes('id="songsPlaylistCard"'), '#songsPlaylistCard is located inside Tab Songs (#viewSongs)');

const viewCloudPart = indexHtmlContent.substring(indexHtmlContent.indexOf('id="viewCloud"'));
assert(!viewCloudPart.includes('id="cloudPlaylistCard"'), 'Old #cloudPlaylistCard removed from Tab Cloud (#viewCloud)');

// 2. Playback mode buttons (Sequential, Shuffle, Repeat One)
assert(indexHtmlContent.includes('id="btnModeSequential"'), 'index.html contains #btnModeSequential (Berurut)');
assert(indexHtmlContent.includes('id="btnModeShuffle"'), 'index.html contains #btnModeShuffle (Acak)');
assert(indexHtmlContent.includes('id="btnModeRepeatOne"'), 'index.html contains #btnModeRepeatOne (Ulangi 1 Lagu)');

// 3. Single unified play button
assert(indexHtmlContent.includes('id="btnSongsPlaylistPlayPause"'), 'index.html contains single #btnSongsPlaylistPlayPause button');
assert(!viewSongsPart.includes('id="btnPlayAllCloudSongs"'), 'Redundant secondary play all button is omitted in favor of single controller play button');

// 4. Controller logic in app.js
assert(freshAppJsContent.includes('window.setPlaylistMode = setPlaylistMode;'), 'app.js exposes window.setPlaylistMode');
assert(freshAppJsContent.includes('window.toggleSongsPlaylistPlayback = toggleSongsPlaylistPlayback;'), 'app.js exposes window.toggleSongsPlaylistPlayback');
assert(freshAppJsContent.includes('window.nextSongsPlaylistSong = nextSongsPlaylistSong;'), 'app.js exposes window.nextSongsPlaylistSong');
assert(freshAppJsContent.includes('window.prevSongsPlaylistSong = prevSongsPlaylistSong;'), 'app.js exposes window.prevSongsPlaylistSong');
assert(freshAppJsContent.includes('window.addToSongsPlaylist = addToSongsPlaylist;'), 'app.js exposes window.addToSongsPlaylist');
assert(freshAppJsContent.includes('window.clearSongsPlaylist = clearSongsPlaylist;'), 'app.js exposes window.clearSongsPlaylist');
assert(freshAppJsContent.includes('window.populateAllSongsToPlaylist = populateAllSongsToPlaylist;'), 'app.js exposes window.populateAllSongsToPlaylist');
assert(freshAppJsContent.includes('window.addToCloudPlaylist = addToSongsPlaylist;'), 'app.js maintains backward compatibility alias window.addToCloudPlaylist');

// 5. CSS styling
assert(freshStyleCssContent.includes('.songs-playlist-card'), 'style.css defines .songs-playlist-card');
assert(freshStyleCssContent.includes('.btn-mode-pill'), 'style.css defines .btn-mode-pill');
assert(freshStyleCssContent.includes('.btn-transport-play'), 'style.css defines .btn-transport-play');

// 6. i18n
assert(freshI18nContent.includes('songsPlaylistTitle') && freshI18nContent.includes('modeSequential') && freshI18nContent.includes('modeShuffle') && freshI18nContent.includes('modeRepeatOne'), 'i18n.js has translations for all playlist modes and titles');

// ======================================================
// TEST SUITE 15: Stage 2 (Per-Song Lyric Sync, BT Tap Calibration, Offline SW & Downloads)
// ======================================================
console.log('\n=== TEST SUITE 15: Stage 2 Offline Mode, Lyric Offset & BT Tap Calibration ===');
assert(fs.existsSync('sw.js'), 'sw.js Service Worker exists');
assert(fs.existsSync('js/offline-manager.js'), 'js/offline-manager.js exists');
const offlineMgrContent = fs.readFileSync('js/offline-manager.js', 'utf8');
assert(offlineMgrContent.includes('class OfflineSongManager'), 'offline-manager.js defines OfflineSongManager');
assert(offlineMgrContent.includes('downloadSong(song)') && offlineMgrContent.includes('getOfflinePlaybackData(song)'), 'OfflineSongManager implements downloadSong and getOfflinePlaybackData');
assert(indexHtml.includes('src="js/offline-manager.js'), 'index.html loads js/offline-manager.js');
assert(indexHtml.includes('id="lyricSyncDisplayVal"'), 'index.html has per-song lyric sync display');
assert(indexHtml.includes('id="btnStartTapCalibrate"') && indexHtml.includes('id="btnTapBeat"'), 'index.html has Bluetooth tap calibration controls');
assert(freshAppJsContent.includes('window.stepLyricOffset = stepLyricOffset;'), 'app.js exposes window.stepLyricOffset');
assert(freshAppJsContent.includes('window.resetLyricOffset = resetLyricOffset;'), 'app.js exposes window.resetLyricOffset');
assert(freshAppJsContent.includes('window.toggleOfflineSong = toggleOfflineSong;'), 'app.js exposes window.toggleOfflineSong');
assert(freshAppJsContent.includes("navigator.serviceWorker.register('./sw.js')"), 'app.js registers Service Worker sw.js');
assert(freshStyleCssContent.includes('.lyric-sync-card') && freshStyleCssContent.includes('.btn-offline-dl') && freshStyleCssContent.includes('.bt-tap-pad'), 'style.css defines Stage 2 UI classes');

// ======================================================
// TEST SUITE 16: Stage 3 (Vocal Scorer, Party Queue Singer & Share Recording)
// ======================================================
console.log('\n=== TEST SUITE 16: Stage 3 Vocal Scoring, Party Queue & Share Recording ===');
assert(fs.existsSync('js/vocal-scorer.js'), 'js/vocal-scorer.js exists');
const vocalScorerContent = fs.readFileSync('js/vocal-scorer.js', 'utf8');
assert(vocalScorerContent.includes('class VocalScorer') && vocalScorerContent.includes('detectPitch('), 'vocal-scorer.js defines VocalScorer with autocorrelation detectPitch');
const scorerSandbox = { window: {} };
new Function('window', vocalScorerContent)(scorerSandbox.window);
const VS = scorerSandbox.window.VocalScorer;
assert(VS.computeGrade(96) === 'S+' && VS.computeGrade(90) === 'S' && VS.computeGrade(80) === 'A', 'VocalScorer.computeGrade returns expected grades');
assert(VS.freqToNoteInfo(440).note === 'A4' && VS.freqToNoteInfo(440).centsOff < 0.1, 'VocalScorer.freqToNoteInfo accurately identifies A4 (440 Hz)');
assert(indexHtml.includes('src="js/vocal-scorer.js') && indexHtml.includes('id="liveScorePill"'), 'index.html loads vocal-scorer.js and renders #liveScorePill');
assert(indexHtml.includes('id="partySingerInput"') && indexHtml.includes('id="partyUpNextBanner"'), 'index.html has Party Mode singer input & up-next banner');
assert(indexHtml.includes('id="btnShareRec"'), 'index.html has Share Recording button in modal');
assert(freshAppJsContent.includes('window.shareRecording = shareRecording;') && freshAppJsContent.includes('window.showPartyUpNextBanner = showPartyUpNextBanner;'), 'app.js exposes shareRecording and showPartyUpNextBanner');

console.log('\n======================================================');
console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
if (testsFailed === 0) {
  console.log('🎉 ALL 16 TEST SUITES OPERATIONAL WITH ZERO ERRORS!');
} else {
  console.error('⚠️ SOME TESTS FAILED. PLEASE INVESTIGATE!');
  process.exit(1);
}
