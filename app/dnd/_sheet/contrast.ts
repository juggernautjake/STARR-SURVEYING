// contrast.ts — derive legible ALTERNATES for a palette token instead of hand-picking one value that
// has to survive every backdrop.
//
// WHY THIS EXISTS. A skin (hextech / donata / rangor / streamer) and a colour theme (Noxus, Void Prophet,
// …) are independent axes: `themeVariantsFor` offers the five universal themes to every skin except
// streamer, so a donata-skinned character can wear Noxus grounds. That means no single literal for a
// token like `--danger` can be correct — the same value has to read as TEXT on the theme's panels AND
// carry a readable LABEL when it is used as a FILL. Those two demands pull in opposite directions:
//
//     #c8413f   as text on hextech panel-3  3.06  (fails)   white label on it as a fill  4.90  (passes)
//     #e77a79   as text on hextech panel-3  5.32  (passes)  white label on it as a fill  2.82  (fails)
//
// Every value that fixes one breaks the other. So we stop looking for one value and emit three:
//
//     --danger       the identity colour — fills, borders, bars. Unchanged; it is the design.
//     --danger-ink   the same hue, walked away from the grounds until it clears AA as TEXT.
//     --danger-on    the label to paint ON a `--danger` fill — white or the palette's dark, whichever wins.
//
// Because all three are derived from whatever theme is actually in play, a mix-and-match combination
// nobody tried is still legible — the alternate is computed from that combination's own grounds.
//
// The 4.5 target is WCAG 1.4.3 for body text. Non-text uses (borders, the codex HP bar) keep `--danger`
// and only need 3:1, which every value here clears comfortably.

/** WCAG 1.4.3 normal-text threshold. Large text needs only 3:1, but these tokens paint 12px error text
 *  (`.tp-err`), so the stricter bar is the one that matters. */
export const AA_TEXT = 4.5;

export type Rgb = [number, number, number];

/** '#abc' | '#aabbcc' → [r,g,b]. Returns null for rgba()/var()/named values, which callers skip. */
export function parseHex(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(c: Rgb): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance (sRGB). */
export function luminance(c: Rgb): number {
  const f = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

/** WCAG contrast ratio, 1..21. Order-independent. */
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Composite `fg` at `alpha` over opaque `bg` — how a translucent tint actually reaches the eye.
 *  Needed because `.btn.danger` paints its label on a tint of ITSELF, which is a harder backdrop
 *  than the bare panel and is where the naive single-value fix fails. */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as Rgb;
}

export function rgbToHsl(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255] as Rgb;
}

/** Worst (lowest) contrast of `c` against every backdrop it may land on. */
export function worstContrast(c: Rgb, backdrops: Rgb[]): number {
  return backdrops.reduce((w, b) => Math.min(w, contrast(c, b)), Infinity);
}

/**
 * The TEXT alternate: `value` walked along lightness — away from the backdrops — until it clears
 * `target` against ALL of them. Hue and saturation are held, so the alternate still reads as the
 * designer's colour rather than a different one.
 *
 * Direction is chosen from the backdrops themselves, which is what makes this work for light and dark
 * skins with the same code: on dark grounds it lightens (#c8413f → a salmon that reads on navy), on
 * pale grounds it darkens (#e5344f → a deep crimson that reads on near-white).
 *
 * Returns `value` unchanged when it already clears — a theme that was designed correctly is not
 * "corrected" into something else. Donata (#ad1f3d) and rangor (#8d3225) both pass through untouched.
 */
export function legibleText(value: string, backdrops: Rgb[], target = AA_TEXT): string {
  const rgb = parseHex(value);
  if (!rgb || backdrops.length === 0) return value;
  if (worstContrast(rgb, backdrops) >= target) return value;

  // Mean backdrop luminance decides which way is "away". 0.18 is the midpoint of the perceptual
  // range rather than of the 0..1 scale — a 0.5 threshold would misclassify mid-tone panels.
  const meanL = backdrops.reduce((sum, b) => sum + luminance(b), 0) / backdrops.length;
  const dir = meanL < 0.18 ? 1 : -1;
  const [h, s, l0] = rgbToHsl(rgb);

  for (let step = 1; step <= 100; step++) {
    const l = l0 + dir * step;
    if (l < 0 || l > 100) break;
    // Test the ROUNDED colour, not the float. `hslToRgb` returns fractional channels and `toHex`
    // rounds them, so checking the float and returning the rounded value can ship a colour that
    // misses the bar by the rounding — streamerBlue's violet did exactly that, clearing 4.50 as a
    // float and measuring 4.48 once written as #006992.
    const c = parseHex(toHex(hslToRgb(h, s, l)))!;
    if (worstContrast(c, backdrops) >= target) return toHex(c);
  }
  // Unreachable for any real palette (white/black clear 4.5 on anything a sheet uses as a ground),
  // but a token is never left illegible: fall back to the extreme in the direction we were walking.
  return dir > 0 ? '#ffffff' : '#000000';
}

/**
 * The LABEL alternate: what to paint ON a solid `fill` of this token. Picks whichever candidate has
 * the most contrast with the fill, preferring on-palette darks over pure black.
 *
 * This is what lets `.skin-donata .btn.danger` keep `background: var(--danger)` while staying readable
 * no matter which theme's danger lands there — the hardcoded `color: #fff` was correct only for the
 * values donata shipped with, and silently wrong the moment a hextech theme was selected.
 */
export function labelOn(fill: string, palette: { void?: string; ink?: string } = {}): string {
  const bg = parseHex(fill);
  if (!bg) return '#ffffff';
  const candidates = ['#ffffff', palette.void, palette.ink, '#0a0a0a'].filter(
    (v): v is string => typeof v === 'string' && parseHex(v) !== null,
  );
  let best = '#ffffff';
  let bestRatio = 0;
  for (const cand of candidates) {
    const r = contrast(parseHex(cand)!, bg);
    if (r > bestRatio) {
      bestRatio = r;
      best = cand;
    }
  }
  return best;
}
