/**
 * SUSHEE Karaoke - Hybrid In-App Auto-Updater (PHP Hosting version.json + GitHub Releases fallback)
 */
class AutoUpdater {
  constructor(options = {}) {
    this.hostingVersionUrls = options.hostingVersionUrls || [
      options.hostingVersionUrl || 'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/version.json',
      'https://abzrtsushee.co-id.id/SUSHEE%20Karaoke/SONGS/version.json'
    ];
    this.githubLatestUrl = options.githubLatestUrl || 'https://api.github.com/repos/abzrt/SUSHEE-Karaoke/releases/latest';
    this.fallbackVersionName = options.versionName || '1.2.4';
    this.fallbackVersionCode = options.versionCode || 12;
    this.latestInfo = null;
  }

  getCurrentVersion() {
    let versionName = this.fallbackVersionName;
    let versionCode = this.fallbackVersionCode;
    try {
      if (typeof window !== 'undefined' && window.AndroidStorage) {
        if (typeof window.AndroidStorage.getAppVersionName === 'function') {
          const nativeName = window.AndroidStorage.getAppVersionName();
          if (nativeName) versionName = nativeName;
        }
        if (typeof window.AndroidStorage.getAppVersionCode === 'function') {
          const nativeCode = Number(window.AndroidStorage.getAppVersionCode());
          if (!isNaN(nativeCode) && nativeCode > 0) versionCode = nativeCode;
        }
      }
    } catch (e) {}
    return { versionName, versionCode };
  }

  static compareVersions(vA, vB) {
    const clean = (v) => String(v || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const a = clean(vA);
    const b = clean(vB);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const diff = (a[i] || 0) - (b[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  async _fetchJsonWithTimeout(url, timeoutMs = 6000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      if (timer) clearTimeout(timer);
      return null;
    }
  }

  async _checkHosting() {
    for (const baseUrl of this.hostingVersionUrls) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const data = await this._fetchJsonWithTimeout(`${baseUrl}${sep}t=${Date.now()}`, 5500);
      if (data && data.versionName && data.apkUrl) {
        return {
          versionName: String(data.versionName).replace(/^v/i, ''),
          versionCode: parseInt(data.versionCode, 10) || 0,
          downloadUrl: data.apkUrl,
          releaseNotes: data.releaseNotes || 'Perbaikan performa dan fitur terbaru SUSHEE Karaoke.',
          source: 'PHP Hosting'
        };
      }
    }
    return null;
  }

  async _checkGitHub() {
    const data = await this._fetchJsonWithTimeout(this.githubLatestUrl, 6000);
    if (!data || !data.tag_name) return null;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const apkAsset = assets.find(a => a && a.name && a.name.toLowerCase().endsWith('.apk') && a.browser_download_url);
    const downloadUrl = apkAsset ? apkAsset.browser_download_url : data.html_url;
    if (!downloadUrl) return null;
    return {
      versionName: String(data.tag_name).replace(/^v/i, ''),
      versionCode: 0,
      downloadUrl,
      releaseNotes: (data.body || 'Pembaruan terbaru tersedia di GitHub Releases.').trim(),
      source: 'GitHub Releases'
    };
  }

  isNewer(remote, current) {
    if (!remote) return false;
    if (remote.versionCode > 0 && current.versionCode > 0) {
      if (remote.versionCode > current.versionCode) return true;
      if (remote.versionCode < current.versionCode) return false;
    }
    return AutoUpdater.compareVersions(remote.versionName, current.versionName) > 0;
  }

  async checkForUpdate() {
    const current = this.getCurrentVersion();
    // 1. Try PHP Hosting version.json first
    let remote = await this._checkHosting();
    if (remote && this.isNewer(remote, current)) {
      this.latestInfo = { ...remote, hasUpdate: true, currentVersion: current.versionName };
      return this.latestInfo;
    }
    // 2. Fallback to GitHub Releases
    const ghRemote = await this._checkGitHub();
    if (ghRemote && this.isNewer(ghRemote, current)) {
      this.latestInfo = { ...ghRemote, hasUpdate: true, currentVersion: current.versionName };
      return this.latestInfo;
    }
    this.latestInfo = {
      hasUpdate: false,
      reachable: Boolean(remote || ghRemote),
      currentVersion: current.versionName,
      latestVersion: (remote || ghRemote || current).versionName,
      source: remote ? 'PHP Hosting' : (ghRemote ? 'GitHub Releases' : 'Tidak Terjangkau')
    };
    return this.latestInfo;
  }

  startDownloadAndInstall(downloadUrl) {
    if (!downloadUrl) return false;
    if (typeof window !== 'undefined' && window.AndroidStorage && typeof window.AndroidStorage.downloadAndInstallApk === 'function') {
      window.AndroidStorage.downloadAndInstallApk(downloadUrl);
      return true;
    }
    // Web browser fallback
    if (typeof window !== 'undefined') {
      window.open(downloadUrl, '_blank', 'noopener');
    }
    return true;
  }
}

window.AutoUpdater = AutoUpdater;
