/**
 * SUSHEE Karaoke - Tap-to-Sync LRC Lyric Creator & Exporter
 */
class LrcEditor {
  constructor() {
    this.lines = [];
    this.stamped = [];
    this.currentIndex = 0;
  }

  static formatTimestamp(sec) {
    const safe = Math.max(0, Number(sec) || 0);
    const mins = Math.floor(safe / 60);
    const rem = safe - mins * 60;
    const wholeSec = Math.floor(rem);
    const cs = Math.floor((rem - wholeSec) * 100);
    return `[${String(mins).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
  }

  loadPlainText(rawText) {
    const cleaned = (rawText || '')
      .split(/\r?\n/)
      .map(l => l.replace(/^\[[^\]]+\]\s*/g, '').trim())
      .filter(Boolean);
    this.lines = cleaned;
    this.stamped = [];
    this.currentIndex = 0;
    return this.lines.length;
  }

  stampNext(currentTimeSec) {
    if (this.currentIndex >= this.lines.length) return null;
    const text = this.lines[this.currentIndex];
    const entry = {
      time: Math.max(0, Number(currentTimeSec) || 0),
      tag: LrcEditor.formatTimestamp(currentTimeSec),
      text
    };
    this.stamped.push(entry);
    this.currentIndex++;
    return entry;
  }

  undoLast() {
    if (this.stamped.length === 0) return false;
    this.stamped.pop();
    this.currentIndex = Math.max(0, this.currentIndex - 1);
    return true;
  }

  buildLrcText(title = '', artist = '') {
    const header = [];
    if (title) header.push(`[ti:${title}]`);
    if (artist) header.push(`[ar:${artist}]`);
    header.push('[by:SUSHEE Karaoke Tap-Sync]');
    const body = this.stamped.map(item => `${item.tag} ${item.text}`);
    return [...header, ...body].join('\n');
  }

  isComplete() {
    return this.lines.length > 0 && this.currentIndex >= this.lines.length;
  }

  downloadLrc(filename, lrcText) {
    if (typeof document === 'undefined' || !lrcText) return;
    const blob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.lrc') ? filename : `${filename}.lrc`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  }
}

window.LrcEditor = LrcEditor;
