/**
 * font.js — text layout helpers with first-class Arabic support.
 * Canvas fillText handles Arabic shaping natively in browsers; this module
 * adds RTL detection, word wrapping, right-alignment for RTL, number
 * formatting and damage-number helpers.
 */

const RTL_RANGES = [
  [0x0590, 0x05FF], // Hebrew
  [0x0600, 0x06FF], // Arabic
  [0x0750, 0x077F], // Arabic Supplement
  [0x08A0, 0x08FF], // Arabic Extended-A
  [0xFB50, 0xFDFF], // Arabic Presentation Forms-A
  [0xFE70, 0xFEFF], // Arabic Presentation Forms-B
];

export function isRTLChar(ch) {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  for (const [lo, hi] of RTL_RANGES) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

/** Heuristic: does this string read right-to-left? */
export function isRTL(text) {
  if (!text) return false;
  let rtl = 0;
  let ltr = 0;
  for (const ch of text) {
    if (isRTLChar(ch)) rtl += 1;
    else if (/[A-Za-z]/.test(ch)) ltr += 1;
  }
  return rtl > ltr;
}

/** Direction of a localized string pair. */
export function directionOf(text) {
  return isRTL(text) ? 'rtl' : 'ltr';
}

/**
 * Greedy word wrap. Returns an array of lines. Splits on whitespace and
 * breaks very long words by character.
 */
export function wrapText(text, maxWidth, measure) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth || !line) {
      if (measure(word) > maxWidth && !line) {
        // Break an oversized word by characters.
        let chunk = '';
        for (const ch of word) {
          if (measure(chunk + ch) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk) line = chunk;
        continue;
      }
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lay out wrapped lines with RTL alignment. Returns { lines, x } for each
 * line so the caller can draw at aligned positions.
 */
export function layoutParagraph(text, box, measure, opts = {}) {
  const rtl = opts.rtl ?? isRTL(text);
  const lines = wrapText(text, box.width, measure);
  return lines.map((line) => {
    const w = measure(line);
    let x = box.x;
    const align = opts.align ?? (rtl ? 'right' : 'left');
    if (align === 'center') x = box.x + (box.width - w) / 2;
    else if (align === 'right' || (rtl && align !== 'left')) x = box.x + box.width - w;
    return { text: line, x, y: box.y, width: w, rtl };
  });
}

/** Compact integer formatting: 1234 -> 1.2k, 1234567 -> 1.2M. */
export function formatNumber(n) {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (Math.abs(num) >= 1e4) return `${(num / 1e3).toFixed(1)}k`;
  return String(Math.round(num));
}

/** Gold with thousands separator. */
export function formatGold(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** MM:SS duration. */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Full HH:MM:SS. */
export function formatTimeLong(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((v) => String(v).padStart(2, '0')).join(':');
}

/** Percent 0..1 -> "42%". */
export function formatPercent(fraction, digits = 0) {
  return `${(Number(fraction) * 100).toFixed(digits)}%`;
}

/** Signed stat display: +8 / -3. */
export function formatStat(value, suffix = '') {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}

/** Damage floaters: crits in gold with "!" suffix. */
export function formatDamage(amount, crit = false) {
  return crit ? `${Math.round(amount)}!` : String(Math.round(amount));
}

/**
 * Join two localized parts respecting RTL (used for "Item Name ×3" etc.).
 */
export function joinLocalized(parts, separator = ' ') {
  const text = parts.filter(Boolean).join(separator);
  return text;
}

/**
 * Visual order pass for strings with embedded numbers/Latin — browsers do the
 * real bidi; this is only for canvas measurement approximations.
 */
export function estimateWidth(text, size) {
  let w = 0;
  for (const ch of text) {
    if (isRTLChar(ch)) w += size * 0.62;
    else if (/[iIl1.,:'|!\[\]()]/.test(ch)) w += size * 0.32;
    else if (/[MW@%]/.test(ch)) w += size * 0.92;
    else if (ch === ' ') w += size * 0.34;
    else w += size * 0.58;
  }
  return w;
}

/** Auto-fit text size so `text` fits in `maxWidth`. */
export function fitSize(text, maxWidth, preferred = 8, min = 5, measure = null) {
  let size = preferred;
  while (size > min) {
    const w = measure ? measure(text, size) : estimateWidth(text, size);
    if (w <= maxWidth) break;
    size -= 1;
  }
  return size;
}

export const FONT_STACK = '"Courier New", "Noto Sans Arabic", "Segoe UI", monospace';
export const FONT_STACK_AR = '"Noto Sans Arabic", "Segoe UI", "Tahoma", "Arial", sans-serif';
