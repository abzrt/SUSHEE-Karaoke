/**
 * LRC (Synchronized Lyrics) Parser & Manager
 * Parses standard .lrc files with timestamps [mm:ss.xx] and metadata tags
 */

class LrcParser {
  constructor() {
    this.metadata = {};
    this.lines = []; // Array of { time: seconds, text: string }
    this.offset = 0; // ms offset from [offset:+/-xxx]
  }

  parse(lrcText) {
    this.metadata = {};
    this.lines = [];
    this.offset = 0;

    if (!lrcText || typeof lrcText !== 'string') {
      return this;
    }

    const rawLines = lrcText.split(/\r?\n/);
    const timeTagRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    const metaTagRegex = /\[([a-zA-Z]+):([^\]]*)\]/;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Check metadata tags like [ti:Title], [ar:Artist], [offset:500]
      const metaMatch = trimmed.match(metaTagRegex);
      if (metaMatch && !timeTagRegex.test(trimmed)) {
        const key = metaMatch[1].toLowerCase();
        const val = metaMatch[2].trim();
        this.metadata[key] = val;
        if (key === 'offset') {
          this.offset = parseInt(val, 10) || 0;
        }
        continue;
      }

      // Check time tags (could be multiple on one line)
      let match;
      const timestamps = [];
      timeTagRegex.lastIndex = 0;

      while ((match = timeTagRegex.exec(trimmed)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        let millis = 0;
        if (match[3]) {
          const frac = match[3];
          millis = frac.length === 3 ? parseInt(frac, 10) : parseInt(frac.padEnd(3, '0'), 10);
        }
        const totalSeconds = minutes * 60 + seconds + millis / 1000;
        timestamps.push(totalSeconds);
      }

      // Extract lyric text (remove all [xx:xx.xx] tags) and parse optional Enhanced LRC <mm:ss.xx> word tags
      const rawContent = trimmed.replace(timeTagRegex, '').trim();
      const wordTagRegex = /<(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?>/g;
      let cleanText = rawContent;
      let parsedWords = null;

      if (wordTagRegex.test(rawContent)) {
        wordTagRegex.lastIndex = 0;
        const segments = [];
        let lastIdx = 0;
        let lastTime = null;
        let wm;
        while ((wm = wordTagRegex.exec(rawContent)) !== null) {
          if (lastTime !== null) {
            const seg = rawContent.slice(lastIdx, wm.index).trim();
            if (seg) segments.push({ text: seg, start: lastTime });
          }
          const mins = parseInt(wm[1], 10);
          const secs = parseInt(wm[2], 10);
          let ms = 0;
          if (wm[3]) ms = wm[3].length === 3 ? parseInt(wm[3], 10) : parseInt(wm[3].padEnd(3, '0'), 10);
          lastTime = Math.max(0, mins * 60 + secs + ms / 1000 + (this.offset / 1000));
          lastIdx = wordTagRegex.lastIndex;
        }
        if (lastTime !== null) {
          const tail = rawContent.slice(lastIdx).trim();
          if (tail) segments.push({ text: tail, start: lastTime });
        }
        if (segments.length > 0) {
          parsedWords = segments;
          cleanText = segments.map(s => s.text).join(' ');
        }
      }

      for (const time of timestamps) {
        this.lines.push({
          time: Math.max(0, time + (this.offset / 1000)),
          text: cleanText,
          words: parsedWords ? parsedWords.map(w => ({ ...w })) : null
        });
      }
    }

    // Sort lines chronologically
    this.lines.sort((a, b) => a.time - b.time);

    // Build smooth word-by-word timings for every line (exact for Enhanced LRC, syllable-weighted for standard LRC)
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const next = this.lines[i + 1];
      const rawGap = next ? Math.max(0.5, next.time - line.time) : 4.0;

      if (!line.text) {
        line.words = [];
        continue;
      }

      if (line.words && line.words.length > 0) {
        for (let j = 0; j < line.words.length; j++) {
          const w = line.words[j];
          const nw = line.words[j + 1];
          w.end = nw ? Math.max(w.start + 0.08, nw.start) : Math.max(w.start + 0.35, line.time + Math.min(rawGap, 6.0));
        }
      } else {
        const tokens = line.text.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
          line.words = [];
          continue;
        }
        // Syllable/vowel-cluster & punctuation weights for natural singing cadence
        const weights = tokens.map(tok => {
          const vowels = (tok.toLowerCase().match(/[aeiouy]+/g) || []).length;
          const base = Math.max(1, vowels) * 0.7 + Math.min(tok.length, 10) * 0.14;
          const pause = /[,;:.!?]$/.test(tok) ? 0.55 : 0;
          return base + pause;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
        // Natural singing window: don't stretch a short phrase across a 15s instrumental solo
        const naturalCap = Math.max(1.2, tokens.length * 0.55 + 0.65);
        const singDur = Math.min(rawGap * 0.94, naturalCap);

        let cursor = line.time;
        line.words = tokens.map((tok, j) => {
          const dur = Math.max(0.12, (weights[j] / totalWeight) * singDur);
          const start = cursor;
          const end = start + dur;
          cursor = end;
          return { text: tok, start, end };
        });
      }
    }

    return this;
  }

  /**
   * Find index of active line for given timestamp
   * @param {number} currentTime in seconds
   * @returns {number} index of current line or -1
   */
  getCurrentIndex(currentTime) {
    if (!this.lines.length) return -1;
    if (currentTime < this.lines[0].time) return -1;

    let low = 0;
    let high = this.lines.length - 1;
    let activeIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.lines[mid].time <= currentTime) {
        activeIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return activeIdx;
  }

  static getSampleLrc() {
    return '';
  }
}

window.LrcParser = LrcParser;
