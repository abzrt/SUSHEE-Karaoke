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

      // Extract lyric text (remove all [xx:xx.xx] tags)
      const text = trimmed.replace(timeTagRegex, '').trim();

      for (const time of timestamps) {
        this.lines.push({
          time: Math.max(0, time + (this.offset / 1000)),
          text: text
        });
      }
    }

    // Sort lines chronologically
    this.lines.sort((a, b) => a.time - b.time);
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
}

window.LrcParser = LrcParser;
