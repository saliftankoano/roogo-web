// Subtitles from a voice-over. The speech-to-text hears the SPOKEN form
// ("cinq cent mille francs CFA", "Waga"), while the subtitles must show the
// script's own text ("500 000 FCFA", "Ouaga"). So we keep the script's words
// and borrow only the timing from the speech-to-text, by aligning the two.

export type SttWord = { text: string; start: number; end: number };
export type TimedWord = { text: string; start: number; end: number };
export type Cue = { start: number; end: number; text: string };

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[b.length] / Math.max(a.length, b.length);
}

const MATCH_THRESHOLD = 0.62;

/** Gives every script word a start and end time. */
export function alignScriptToWords(script: string, words: ReadonlyArray<SttWord>): TimedWord[] {
  const tokens = script.split(/\s+/).filter(Boolean);
  if (!tokens.length || !words.length) return [];

  const a = tokens.map(norm);
  const b = words.map((w) => norm(w.text));
  const n = a.length;
  const m = b.length;

  // Needleman-Wunsch style alignment on normalized words.
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    score[i][0] = -i;
    back[i][0] = 1; // up
  }
  for (let j = 1; j <= m; j += 1) {
    score[0][j] = -j;
    back[0][j] = 2; // left
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const sim = similarity(a[i - 1], b[j - 1]);
      const diag = score[i - 1][j - 1] + (sim >= MATCH_THRESHOLD ? 2 * sim : -1);
      const up = score[i - 1][j] - 1;
      const left = score[i][j - 1] - 1;
      if (diag >= up && diag >= left) {
        score[i][j] = diag;
        back[i][j] = 0;
      } else if (up >= left) {
        score[i][j] = up;
        back[i][j] = 1;
      } else {
        score[i][j] = left;
        back[i][j] = 2;
      }
    }
  }

  const matchOf: Array<number | null> = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = i === 0 ? 2 : j === 0 ? 1 : back[i][j];
    if (step === 0) {
      if (similarity(a[i - 1], b[j - 1]) >= MATCH_THRESHOLD) matchOf[i - 1] = j - 1;
      i -= 1;
      j -= 1;
    } else if (step === 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const startOf: Array<number | null> = matchOf.map((k) => (k === null ? null : words[k].start));
  const endOf: Array<number | null> = matchOf.map((k) => (k === null ? null : words[k].end));
  const first = words[0].start;
  const last = words[m - 1].end;

  // Fill unmatched words by spreading time across each gap, weighted by length.
  let idx = 0;
  while (idx < n) {
    if (startOf[idx] !== null) {
      idx += 1;
      continue;
    }
    let end = idx;
    while (end < n && startOf[end] === null) end += 1;
    const gapStart = idx === 0 ? first : (endOf[idx - 1] as number);
    const gapEnd = end === n ? last : (startOf[end] as number);
    const weights = tokens.slice(idx, end).map((t) => Math.max(1, t.length));
    const total = weights.reduce((x, y) => x + y, 0);
    let cursor = gapStart;
    for (let k = idx; k < end; k += 1) {
      const span = Math.max(0, gapEnd - gapStart) * (weights[k - idx] / total);
      startOf[k] = cursor;
      endOf[k] = cursor + span;
      cursor += span;
    }
    idx = end;
  }

  return tokens.map((text, k) => ({
    text,
    start: startOf[k] as number,
    end: Math.max(endOf[k] as number, startOf[k] as number),
  }));
}

const STOPWORDS = new Set([
  "a", "à", "au", "aux", "de", "du", "des", "d", "le", "la", "les", "l", "un", "une",
  "et", "ou", "en", "dans", "sur", "pour", "par", "avec", "sans", "que", "qui", "ce", "se", "ne",
]);

function isStopword(token: string): boolean {
  return STOPWORDS.has(norm(token.replace(/['’].*$/, "")));
}

export function buildCues(
  words: ReadonlyArray<TimedWord>,
  options: { maxChars?: number; maxSeconds?: number; minSeconds?: number } = {},
): Cue[] {
  const maxChars = options.maxChars ?? 42;
  const maxSeconds = options.maxSeconds ?? 5.5;
  const minSeconds = options.minSeconds ?? 1.0;
  const cues: Cue[] = [];
  let current: TimedWord[] = [];

  const emit = (group: TimedWord[]) => {
    if (!group.length) return;
    cues.push({
      start: group[0].start,
      end: group[group.length - 1].end,
      text: group.map((w) => w.text).join(" "),
    });
  };

  // When a cue is full, cut it at a natural pause if there is one, and never
  // leave a small function word ("à", "de", "un"...) dangling at the end.
  const cutPoint = (group: TimedWord[]): number => {
    let cut = group.length;
    for (let i = group.length - 2; i >= Math.floor(group.length / 2); i -= 1) {
      if (/[,;:]$/.test(group[i].text)) {
        cut = i + 1;
        break;
      }
    }
    while (cut > 1 && cut === group.length && isStopword(group[cut - 1].text)) cut -= 1;
    return cut;
  };

  for (const word of words) {
    const text = current.map((w) => w.text).join(" ");
    const tooLong = text.length + 1 + word.text.length > maxChars;
    const tooSlow = current.length > 0 && word.end - current[0].start > maxSeconds;
    if (current.length && (tooLong || tooSlow)) {
      const cut = cutPoint(current);
      emit(current.slice(0, cut));
      current = current.slice(cut);
    }
    current.push(word);
    if (/[.!?…]$/.test(word.text)) {
      emit(current);
      current = [];
    }
  }
  emit(current);

  // A tiny trailing cue (one or two words, under a second) joins the one before it.
  const merged: Cue[] = [];
  for (const cue of cues) {
    const previous = merged[merged.length - 1];
    const small = cue.text.split(" ").length <= 2 && cue.end - cue.start < 1.2;
    if (previous && small && previous.text.length + 1 + cue.text.length <= maxChars + 6) {
      previous.text += ` ${cue.text}`;
      previous.end = cue.end;
    } else {
      merged.push({ ...cue });
    }
  }

  // Keep every cue on screen long enough, without running into the next one.
  for (let k = 0; k < merged.length; k += 1) {
    const next = merged[k + 1];
    const limit = next ? next.start : merged[k].end + minSeconds;
    if (merged[k].end - merged[k].start < minSeconds) {
      merged[k].end = Math.min(merged[k].start + minSeconds, limit);
    }
    if (next && merged[k].end > next.start) merged[k].end = next.start;
  }
  return merged;
}

function clock(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (v: number, l = 2) => String(v).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms === 1000 ? 999 : ms, 3)}`;
}

function twoLines(text: string): string {
  if (text.length <= 30) return text;
  const middle = Math.floor(text.length / 2);
  let split = -1;
  for (let d = 0; d < text.length; d += 1) {
    if (text[middle + d] === " ") {
      split = middle + d;
      break;
    }
    if (text[middle - d] === " ") {
      split = middle - d;
      break;
    }
  }
  return split < 0 ? text : `${text.slice(0, split)}\n${text.slice(split + 1)}`;
}

export function toSrt(cues: ReadonlyArray<Cue>): string {
  return cues
    .map((cue, index) => `${index + 1}\n${clock(cue.start)} --> ${clock(cue.end)}\n${twoLines(cue.text)}\n`)
    .join("\n");
}
