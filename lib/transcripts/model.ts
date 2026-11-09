// lib/transcripts/model.ts — a video's words with their times, and searching them.
//
// Owner, 2026-11-09: "I want to transcribe videos and have time stamps for the words … there needs
// to be a way to search the transcript for key words. Mainly the videos are for identifying
// materials for buildings, fence types, where power poles sit and how they connect to each other and
// buildings, where utilities and features and improvements are, and other anomalies. We need to be
// able to search the transcript for each instance of a word/phrase."
//
// Pure: no fetching, no React. The speech-to-text call is lib/transcripts/elevenlabs.ts; the panel is
// app/admin/components/media/TranscriptPanel.tsx. Tested in __tests__/files/transcripts.test.ts.

/** One spoken word: its text as shown (punctuated), and when it starts and ends, in seconds. */
export interface TranscriptWord {
  w: string;
  s: number;
  e: number;
  /** 0–1, the recogniser's confidence. */
  c?: number;
}

export interface Transcript {
  words: TranscriptWord[];
  text: string;
  duration: number | null;
}

/** A search hit: `count` words starting at word `index`. */
export interface TranscriptHit {
  index: number;
  count: number;
  start: number;
  end: number;
}

/**
 * Words the recogniser is told to listen for (ElevenLabs Scribe `keyterms`). Field talk is full of
 * terms a general model mishears — "guy wire" as "guy wear", "T-post" as "tea post". Each must be at
 * most 50 characters and 5 words; past 100 terms every request bills a 20-second minimum, so the list
 * stays well short of that.
 */
export const SURVEY_KEYTERMS = [
  'chain link', 'barbed wire', 'T-post', 'pipe fence', 'privacy fence', 'wrought iron', 'pipe rail',
  'cattle guard', 'power pole', 'utility pole', 'guy wire', 'overhead line', 'service drop',
  'transformer', 'meter base', 'electric meter', 'gas meter', 'water meter', 'pedestal',
  'fire hydrant', 'manhole', 'culvert', 'septic', 'cleanout', 'easement', 'encroachment',
  'iron rod', 'capped iron rod', 'rebar', 'monument', 'fence corner', 'property corner',
  'right-of-way', 'concrete slab', 'carport', 'brick veneer', 'metal building', 'eave', 'overhang',
];

/** Lower case, letters and digits only (keeps inner apostrophes and hyphens' halves together):
 *  "Pole," → "pole", "T-post" → "tpost", "don't" → "dont". */
export function normalizeToken(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

/** A query as the tokens it must match, in order. "chain-link fence" and "chain link fence" are the
 *  same search; so are "T post" and "T-post" (see searchTranscript). */
export function queryTokens(q: string): string[] {
  return q.split(/[\s\-–—/]+/).map(normalizeToken).filter(Boolean);
}

/**
 * Every place the phrase occurs, in order. A phrase matches consecutive words, ignoring case and
 * punctuation. Hyphenated or run-together forms match the spaced form either way round: "chain
 * link" finds "chain-link" (one recognised word) and "T-post" finds "T post" (two). The last query
 * token may be the start of a word, so "pole" finds "poles" and "fenc" finds "fence" — a search box
 * that answers while you type.
 */
export function searchTranscript(words: TranscriptWord[], query: string): TranscriptHit[] {
  const q = queryTokens(query);
  if (q.length === 0) return [];
  const joined = q.join('');
  const norm = words.map((w) => normalizeToken(w.w));
  const hits: TranscriptHit[] = [];
  for (let i = 0; i < norm.length; i++) {
    // Walk forward from word i, consuming the joined query character run; each word must be wholly
    // inside it, except the last, which only has to start with what is left.
    let rest = joined;
    let j = i;
    while (j < norm.length && rest.length > 0) {
      const t = norm[j];
      if (!t) { j++; continue; }
      if (rest.startsWith(t)) { rest = rest.slice(t.length); j++; continue; }
      if (t.startsWith(rest)) { rest = ''; j++; break; }
      break;
    }
    if (rest.length === 0 && j > i && norm[i]) {
      // Word boundaries must line up with the query's own at the start: "pole" must not match the
      // tail of "tadpole" — guaranteed, since matching begins at a word's first character.
      hits.push({ index: i, count: j - i, start: words[i].s, end: words[j - 1].e });
      i = j - 1; // no overlapping hits
    }
  }
  return hits;
}

/** The index of the word being spoken at time t (the last word that has started), or -1. */
export function activeWordIndex(words: TranscriptWord[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].s <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** The words around a hit, for the list of results: `before` words, the hit, `after` words. */
export function hitContext(words: TranscriptWord[], hit: TranscriptHit, before = 6, after = 8): { lead: string; match: string; tail: string } {
  const text = (a: number, b: number) => words.slice(Math.max(0, a), Math.max(0, b)).map((w) => w.w).join(' ');
  return {
    lead: (hit.index - before > 0 ? '… ' : '') + text(hit.index - before, hit.index),
    match: text(hit.index, hit.index + hit.count),
    tail: text(hit.index + hit.count, hit.index + hit.count + after) + (hit.index + hit.count + after < words.length ? ' …' : ''),
  };
}

/** Lines for reading: a new one after a pause of `gap` seconds or at a sentence end past `max` words. */
export function transcriptLines(words: TranscriptWord[], gap = 1.2, max = 28): Array<{ from: number; to: number; start: number }> {
  const lines: Array<{ from: number; to: number; start: number }> = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    const pause = next ? next.s - words[i].e : Infinity;
    const sentenceEnd = /[.?!]$/.test(words[i].w);
    if (pause >= gap || (i - from + 1 >= max && sentenceEnd) || i - from + 1 >= max * 2) {
      lines.push({ from, to: i + 1, start: words[from].s });
      from = i + 1;
    }
  }
  return lines;
}

/** ElevenLabs Scribe's response → our shape. Only `type: "word"` items are words (the others are
 *  the spaces between them and tagged sounds); confidence is the word's log-probability, exponentiated.
 *  Throws if it is not a transcript. */
export function parseScribe(json: unknown): Transcript {
  const j = json as {
    text?: string;
    audio_duration_secs?: number;
    words?: Array<{ text?: string; type?: string; start?: number | null; end?: number | null; logprob?: number }>;
  };
  if (!j || !Array.isArray(j.words)) throw new Error('The transcription service returned no words.');
  const words: TranscriptWord[] = j.words
    .filter((w) => (w.type ?? 'word') === 'word' && typeof w.start === 'number' && typeof w.end === 'number' && (w.text ?? '').trim())
    .map((w) => ({
      w: String(w.text).trim(),
      s: Math.round((w.start as number) * 1000) / 1000,
      e: Math.round((w.end as number) * 1000) / 1000,
      ...(typeof w.logprob === 'number' ? { c: Math.round(Math.min(1, Math.exp(w.logprob)) * 1000) / 1000 } : {}),
    }));
  const duration = typeof j.audio_duration_secs === 'number' ? j.audio_duration_secs : null;
  return { words, text: (j.text ?? words.map((w) => w.w).join(' ')).trim(), duration };
}
