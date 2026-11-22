/**
 * SUSHEE Karaoke - Recording Share Manager (Stage 4 Modularization)
 * Shares recorded audio via Web Share API (with file attachment when supported) and falls back to download.
 */
class ShareManager {
  static async shareRecording(rec, { recorder = null, showToast = null } = {}) {
    if (!rec) return { shared: false, mode: 'none' };
    const safeTitle = (rec.title || 'SUSHEE Karaoke').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'SUSHEE_Karaoke';
    const ext = (rec.mimeType && rec.mimeType.includes('wav')) ? 'wav' : 'mp3';
    const fileName = `${safeTitle}.${ext}`;
    const shareText = `🎤 Dengarkan rekaman karaoke "${rec.title}" (${rec.artist || 'SUSHEE'}) yang direkam di SUSHEE Karaoke!`;

    try {
      let blob = rec.blob || null;
      if (!blob && rec.url) {
        const resp = await fetch(rec.url);
        blob = await resp.blob();
      }
      if (blob && typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share) {
        const file = new File([blob], fileName, { type: blob.type || (ext === 'wav' ? 'audio/wav' : 'audio/mpeg') });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title: rec.title || 'SUSHEE Karaoke', text: shareText, files: [file] });
          if (showToast) showToast('✅ Rekaman berhasil dibagikan!', 'success');
          return { shared: true, mode: 'file' };
        }
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: rec.title || 'SUSHEE Karaoke', text: shareText });
        return { shared: true, mode: 'text' };
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return { shared: false, mode: 'cancelled' };
      console.warn('Web Share fallback triggered:', err);
    }

    if (recorder && typeof recorder.downloadRecording === 'function') {
      recorder.downloadRecording(rec);
      if (showToast) showToast('📤 File diunduh — siap dibagikan ke WhatsApp/IG!', 'info');
      return { shared: true, mode: 'download_fallback' };
    }
    return { shared: false, mode: 'unsupported' };
  }
}

window.ShareManager = ShareManager;
