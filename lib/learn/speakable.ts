// lib/learn/speakable.ts
//
// Narration normalizer: turn AI-tutor / study Markdown (LaTeX math, GFM tables,
// units, symbols, and lone variables) into a clean SPOKEN string for TTS.
//
// Why this exists: neural TTS (ElevenLabs premium + the browser voice) reads
// *prose* well but mangles everything else — it swallows single-letter
// variables ("n" → a clipped /n/ instead of "en"), reads "ft"/"in" literally,
// races through columns of numbers, and speaks raw LaTeX / table pipes as
// gibberish. ElevenLabs has no SSML `say-as`, and number normalization is off
// by default on Turbo v2.5, so the durable fix is to normalize the text
// OURSELVES before synthesis (the industry-standard "text normalization" pass).
//
// Design — two channels: the DISPLAY channel stays exact (KaTeX, real tables);
// this builds a separate NARRATION channel. Tables/charts are never read
// cell-by-cell — each gets a stable reference label ("figure 1A") plus a
// one-line caption of what it shows, and the numbers stay on screen.
//
// Pacing uses plain punctuation (commas/periods), never SSML <break> tags, so
// the exact same string is safe for BOTH the premium voice and the browser
// SpeechSynthesis fallback (which would read "<break>" aloud).
//
// Pure + deterministic (no Date/Math.random) so it's unit-testable and the
// figure labels it emits line up with what lib/learn/study-markdown.ts renders.

import { replaceMathSpans } from './math';

export interface SpeakableOptions {
  /**
   * Figure group for this message — the number half of a figure label. The Nth
   * table/figure in the message becomes `${figureGroup}${A..Z}` (1 → 1A, 1B…).
   * Pass the SAME value to renderStudyMarkdown for this message so the spoken
   * label equals the on-screen badge. Defaults to 1.
   */
  figureGroup?: number;
}

export interface SpokenFigure {
  label: string;            // "1A"
  caption: string | null;   // model-supplied one-liner, or null when absent
  kind: string;             // "table" | "chart" | "spreadsheet" | "diagram"
}

export interface SpeakableResult {
  text: string;
  figures: SpokenFigure[];
}

/** A → Z, then AA, AB… (rarely needed — a reply almost never has >26 figures). */
export function figureLetter(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// ── Figure captions ──────────────────────────────────────────────────────────
// The tutor is prompted to follow each table with a caption line, e.g.
//   *Figure: how positional error grows with distance*
// We also accept "Chart:", "Spreadsheet:", "Diagram:", "Table:" and a leading
// blockquote/emphasis. The keyword picks the spoken noun.
const CAPTION_RE =
  /^\s*(?:[>*_]+\s*)?(figure|fig\.?|caption|chart|table|spreadsheet|diagram)\b\s*\d*\s*[:.\-–—]\s*(.+?)[*_\s]*$/i;

function captionNoun(keyword: string): string {
  const k = keyword.toLowerCase();
  if (k.startsWith('chart')) return 'chart';
  if (k.startsWith('spreadsheet')) return 'spreadsheet';
  if (k.startsWith('diagram')) return 'diagram';
  return 'table';
}

const isTableRow = (l: string): boolean => l.includes('|');
const isSepRow = (l: string): boolean => l.includes('|') && /-/.test(l) && /^[\s|:-]+$/.test(l);

/**
 * Replace GFM pipe tables (and any fenced code) with a short spoken reference
 * and collect the figures. Operates on the raw markdown line array so the pipes
 * and dense numbers never reach the voice.
 */
function extractFigures(md: string, figureGroup: number): { text: string; figures: SpokenFigure[] } {
  const lines = md.split('\n');
  const out: string[] = [];
  const figures: SpokenFigure[] = [];
  let figIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A table = a pipe row immediately followed by a separator row.
    if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && lines[j].trim() !== '') j++;

      const label = `${figureGroup}${figureLetter(figIdx)}`;
      figIdx++;

      // Caption may sit on the line just after the table, or just before it.
      let caption: string | null = null;
      let noun = 'table';
      const after = lines[j]?.trim() ? lines[j] : lines[j + 1];
      const mAfter = after ? CAPTION_RE.exec(after) : null;
      if (mAfter && mAfter[2].trim()) {
        caption = mAfter[2].trim();
        noun = captionNoun(mAfter[1]);
        // consume the caption line so it isn't spoken twice
        const idx = lines[j]?.trim() ? j : j + 1;
        lines[idx] = '';
      } else {
        // look back at the last non-empty emitted line
        for (let k = out.length - 1; k >= 0 && k >= out.length - 2; k--) {
          const mBefore = out[k].trim() ? CAPTION_RE.exec(out[k]) : null;
          if (mBefore && mBefore[2].trim()) {
            caption = mBefore[2].trim();
            noun = captionNoun(mBefore[1]);
            out[k] = '';
            break;
          }
        }
      }

      figures.push({ label, caption, kind: noun });
      out.push(
        caption
          ? `See ${noun} ${figureGroup} ${figureLetter(figIdx - 1)}, which shows ${caption}.`
          : `See the ${noun} labeled figure ${figureGroup} ${figureLetter(figIdx - 1)} on screen.`,
      );
      i = j - 1;
      continue;
    }

    out.push(line);
  }

  return { text: out.join('\n'), figures };
}

// ── LaTeX → spoken math ──────────────────────────────────────────────────────
const MATH_COMMANDS: Record<string, string> = {
  // operators
  times: ' times ', cdot: ' times ', div: ' divided by ', pm: ' plus or minus ',
  mp: ' minus or plus ', approx: ' approximately ', neq: ' not equal to ',
  leq: ' less than or equal to ', le: ' less than or equal to ',
  geq: ' greater than or equal to ', ge: ' greater than or equal to ',
  ne: ' not equal to ', equiv: ' equivalent to ', propto: ' proportional to ', sim: ' about ',
  sum: ' the sum of ', prod: ' the product of ', int: ' the integral of ',
  infty: ' infinity ', partial: ' partial ', nabla: ' del ', angle: ' angle ',
  cong: ' congruent to ', perp: ' perpendicular to ', parallel: ' parallel to ',
  circ: ' degrees ', prime: ' prime ', degree: ' degrees ',
  // trig / functions read fine as words
  sin: ' sine ', cos: ' cosine ', tan: ' tangent ', log: ' log ', ln: ' natural log ',
  // greek (phonetic spellings so the voice says them right)
  alpha: ' alpha ', beta: ' beta ', gamma: ' gamma ', Gamma: ' gamma ',
  delta: ' delta ', Delta: ' delta ', epsilon: ' epsilon ', varepsilon: ' epsilon ',
  zeta: ' zeta ', eta: ' ay-ta ', theta: ' theta ', Theta: ' theta ', vartheta: ' theta ',
  iota: ' iota ', kappa: ' kappa ', lambda: ' lambda ', Lambda: ' lambda ',
  mu: ' mew ', nu: ' new ', xi: ' zai ', Xi: ' zai ', pi: ' pie ', Pi: ' pie ',
  rho: ' roe ', sigma: ' sigma ', Sigma: ' the sum of ', tau: ' tau ',
  upsilon: ' upsilon ', phi: ' fie ', Phi: ' fie ', varphi: ' fie ', chi: ' kai ',
  psi: ' sigh ', Psi: ' sigh ', omega: ' omega ', Omega: ' omega ',
};

/** Convert a bare LaTeX string into words. Best-effort; degrades gracefully. */
export function latexToSpeech(latex: string): string {
  let s = ` ${latex} `;

  // Text wrappers → their content.
  const unwrap = /\\(?:text|mathrm|mathit|mathbf|operatorname|mathsf)\s*\{([^{}]*)\}/g;
  for (let n = 0; n < 4 && unwrap.test(s); n++) s = s.replace(unwrap, ' $1 ');

  // Fractions, roots, accents — inner groups first, so repeat until stable.
  for (let n = 0; n < 8; n++) {
    const before = s;
    s = s
      .replace(/\\sqrt\s*\[\s*([^\]]*?)\s*\]\s*\{([^{}]*)\}/g, ' $1 root of ($2) ')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, ' square root of ($1) ')
      .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' ($1) over ($2) ')
      .replace(/\\tfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' ($1) over ($2) ')
      .replace(/\\(?:bar|overline)\s*\{([^{}]*)\}/g, ' $1 bar ')
      .replace(/\\hat\s*\{([^{}]*)\}/g, ' $1 hat ')
      .replace(/\\vec\s*\{([^{}]*)\}/g, ' vector $1 ');
    if (s === before) break;
  }

  // Superscripts / subscripts.
  s = s
    .replace(/\^\s*\\?circ/g, ' degrees ')
    .replace(/\^\s*\{?\s*2\s*\}?/g, ' squared ')
    .replace(/\^\s*\{?\s*3\s*\}?/g, ' cubed ')
    .replace(/\^\s*\{([^{}]+)\}/g, ' to the power ($1) ')
    .replace(/\^\s*([A-Za-z0-9])/g, ' to the power $1 ')
    .replace(/_\s*\{([^{}]+)\}/g, ' sub ($1) ')
    .replace(/_\s*([A-Za-z0-9])/g, ' sub $1 ');

  // Commands (operators + greek). Unknown \foo → dropped.
  s = s.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => MATH_COMMANDS[name] ?? ' ');

  // Spacing/grouping cruft and bare relational/arithmetic symbols.
  s = s
    .replace(/\\[,;:!> ]/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s*=\s*/g, ' equals ')
    .replace(/\s*\\?\\times\s*/g, ' times ')
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/(^|[\s(])-\s*(?=[\d.a-zA-Z(])/g, '$1 minus ')
    .replace(/\s*\\?\\cdot\s*/g, ' times ')
    .replace(/\s*<\s*/g, ' less than ')
    .replace(/\s*>\s*/g, ' greater than ')
    .replace(/\s*\\?%\s*/g, ' percent ')
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ` ${s} `;
}

// ── Unicode symbols + surveying units ────────────────────────────────────────
const UNICODE: Array<[RegExp, string]> = [
  [/≈/g, ' approximately '], [/≤/g, ' less than or equal to '], [/≥/g, ' greater than or equal to '],
  [/≠/g, ' not equal to '], [/±/g, ' plus or minus '], [/×/g, ' times '], [/÷/g, ' divided by '],
  [/√/g, ' square root of '], [/∑/g, ' the sum of '], [/∏/g, ' the product of '], [/∫/g, ' the integral of '],
  [/[Σ]/g, ' the sum of '], [/[Δ]/g, ' delta '], [/[θ]/g, ' theta '], [/[π]/g, ' pie '], [/[µμ]/g, ' micro '],
  [/[α]/g, ' alpha '], [/[β]/g, ' beta '], [/[γ]/g, ' gamma '], [/[λ]/g, ' lambda '], [/[σ]/g, ' sigma '],
  [/[ρ]/g, ' roe '], [/[φ]/g, ' fie '], [/[ω]/g, ' omega '], [/[Ω]/g, ' ohms '],
  [/∞/g, ' infinity '], [/∝/g, ' proportional to '], [/≅/g, ' congruent to '], [/→/g, ' to '],
  [/½/g, ' one half '], [/¼/g, ' one quarter '], [/¾/g, ' three quarters '], [/·/g, ' times '],
];

/** Expand surveying units, with singular/plural chosen by the leading number. */
function expandUnits(text: string): string {
  const plural = (num: string, one: string, many: string) =>
    /^0*1(\.0+)?$/.test(num.trim()) ? one : many;

  return text
    // square area first (before generic ft)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*(?:ft\s*(?:²|\^?2|2)|sq\.?\s*ft|square\s+feet)/gi, '$1 square feet')
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*(?:ac|acres?)\b/gi, (_m, n) => `${n} ${plural(n, 'acre', 'acres')}`)
    // linear units
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*ft\b\.?/gi, (_m, n) => `${n} ${plural(n, 'foot', 'feet')}`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*yd\b\.?/gi, (_m, n) => `${n} ${plural(n, 'yard', 'yards')}`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*mi\b\.?/gi, (_m, n) => `${n} ${plural(n, 'mile', 'miles')}`)
    // inches: only when clearly a unit (number then "in", not the English word "in")
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*in\b\.?(?!\s+(?:the|a|an|this|that|order|front|fact|part|place|time|which|his|her|their|our|your|addition|general|between|which|each)\b)/gi,
      (_m, n) => `${n} ${plural(n, 'inch', 'inches')}`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*ppm\b/gi, '$1 parts per million')
    // standalone unit words with no number
    .replace(/\bft²\b|\bsq\.?\s*ft\b/gi, 'square feet');
}

/** Degrees-minutes-seconds → words (surveying angles), before the ° fallback. */
function expandAngles(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*[′']\s*(\d+(?:\.\d+)?)\s*[″"]/g,
      '$1 degrees $2 minutes $3 seconds')
    .replace(/(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*[′']/g, '$1 degrees $2 minutes')
    .replace(/(\d+(?:\.\d+)?)\s*°/g, '$1 degrees')
    .replace(/°/g, ' degrees ')
    // bearings: N 45 E → north 45 east (quadrant bearings)
    .replace(/\bN\s+(\d[\d.]*\s*(?:degrees|minutes|seconds|\s)*)\s*E\b/g, 'north $1 east')
    .replace(/\bN\s+(\d[\d.]*\s*(?:degrees|minutes|seconds|\s)*)\s*W\b/g, 'north $1 west')
    .replace(/\bS\s+(\d[\d.]*\s*(?:degrees|minutes|seconds|\s)*)\s*E\b/g, 'south $1 east')
    .replace(/\bS\s+(\d[\d.]*\s*(?:degrees|minutes|seconds|\s)*)\s*W\b/g, 'south $1 west');
}

// ── Single-letter variable enunciation (the "n → en" fix) ───────────────────
// Spoken letter names. a/i/o are omitted (real English words / low value); the
// voice already says "a"/"I" fine and respelling them would corrupt prose.
const LETTER_SOUND: Record<string, string> = {
  b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'eff', g: 'gee', h: 'aitch', j: 'jay',
  k: 'kay', l: 'ell', m: 'em', n: 'en', p: 'pee', q: 'cue', r: 'arr', s: 'ess',
  t: 'tee', u: 'you', v: 'vee', w: 'double-you', x: 'ex', y: 'why', z: 'zee',
};

function enunciateLoneLetters(text: string): string {
  // A single letter not touching other letters/digits/apostrophes → its name.
  return text.replace(/(?<![A-Za-z0-9'’])([A-Za-z])(?![A-Za-z0-9'’])/g, (m, ch: string) => {
    const sound = LETTER_SOUND[ch.toLowerCase()];
    return sound ? sound : m;
  });
}

// ── Prose cleanup ────────────────────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code shown on screen) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                    // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                  // links → text
    .replace(/^#{1,6}\s+/gm, '')                              // headings
    .replace(/^\s*>\s?/gm, '')                                // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '')                            // bullets
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1').replace(/(?<!\w)_(.*?)_(?!\w)/g, '$1')
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, ' ');
}

const DIGIT_WORD: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
};
const speakDigits = (s: string): string => s.split('').map((d) => DIGIT_WORD[d] ?? d).join(' ');

function normalizeNumbersAndSymbols(text: string): string {
  let s = text;
  for (const [re, rep] of UNICODE) s = s.replace(re, rep);
  s = s
    .replace(/\be\.g\.\s*/gi, 'for example, ')
    .replace(/\bi\.e\.\s*/gi, 'that is, ')
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\betc\.\b/gi, 'etcetera')
    .replace(/\bapprox\.\b/gi, 'approximately')
    // comparison / equals operators written as bare ASCII in prose (e.g. the
    // tutor writes "a = b" without $…$). Math spans are already handled in
    // latexToSpeech; this catches the plain-text ones the voice would otherwise
    // read as a raw "=" glyph. Compound forms first, then a lone "=".
    .replace(/\s*>=\s*/g, ' greater than or equal to ')
    .replace(/\s*<=\s*/g, ' less than or equal to ')
    .replace(/\s*!=\s*/g, ' not equal to ')
    .replace(/\s*=+\s*/g, ' equals ')
    // ² ³ that slipped through (e.g. "x²")
    .replace(/²/g, ' squared ').replace(/³/g, ' cubed ')
    // ranges between numbers → "to"
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 to $2')
    // ratios a:b → a to b
    .replace(/(\d)\s*:\s*(\d)/g, '$1 to $2')
    // currency $5 → 5 dollars
    .replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars')
    // negative sign directly before a number
    .replace(/(^|[\s(])[-−]\s*(?=\d)/g, '$1negative ')
    // decimals: read the integer part as a normal number but speak the
    // fractional digits ONE AT A TIME, so runs of zeros survive intact —
    // "0.000025" → "0 point zero zero zero zero two five" (not a mangled
    // "point 000025" the voice trips over). Handles a leading-dot form too.
    .replace(/(\d[\d,]*)\.(\d+)/g, (_m, intPart: string, frac: string) => `${intPart} point ${speakDigits(frac)}`)
    .replace(/(^|[^\w.])\.(\d+)/g, (_m, pre: string, frac: string) => `${pre}zero point ${speakDigits(frac)}`)
    // stray percent / ampersand
    .replace(/%/g, ' percent ').replace(/\s&\s/g, ' and ');
  return s;
}

/**
 * Turn study Markdown into a clean spoken string (+ the figures it referenced).
 */
export function toSpeakable(markdown: string, opts: SpeakableOptions = {}): SpeakableResult {
  if (!markdown || !markdown.trim()) return { text: '', figures: [] };
  const figureGroup = opts.figureGroup ?? 1;

  // 1) tables/charts → reference sentences (drops the dense grids)
  const { text: noTables, figures } = extractFigures(markdown.replace(/\r\n?/g, '\n'), figureGroup);

  // 2) LaTeX math → words (reuses the same span-finder as the KaTeX renderer,
  //    incl. its currency guard so "$5" is left for the currency rule below)
  let s = replaceMathSpans(noTables, (latex) => latexToSpeech(latex));

  // 3) prose cleanup, then domain expansion
  s = stripMarkdown(s);
  s = expandAngles(s);
  s = expandUnits(s);
  s = normalizeNumbersAndSymbols(s);

  // 4) lone-variable enunciation (after everything else so "n squared" → "en …")
  s = enunciateLoneLetters(s);

  // 5) safety net: strip any leftover math/table glyphs and tidy whitespace
  s = s
    .replace(/[\\{}$|~^]/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .trim();

  return { text: s, figures };
}

/** Convenience: just the spoken string. */
export function speakableText(markdown: string, opts?: SpeakableOptions): string {
  return toSpeakable(markdown, opts).text;
}
