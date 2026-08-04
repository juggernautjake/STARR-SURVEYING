// lib/cad/render/text-layout.ts — CAD_AUDIT Slice S11.
//
// Layout rules for the paper-space "survey information" furniture: the title block, signature block,
// legend, standard notes, certification, scale bar and north arrow. These are drawn on the sheet
// rather than in the world, and both rules here exist because that distinction was not held.
//
// ── 1. WRAPPING BREAKS LINES, NOT WORDS ─────────────────────────────────────────────────────────
// The standard-notes block wrapped by slicing every N characters:
//
//     for (let s = 0; s < text.length; s += charsPerLine) lines.push(text.slice(s, s + charsPerLine));
//
// which put "Texas State Plan / e Coordinate System", "as note / d on the plat", "shown on this p /
// lat" and "Profess / ional Surveyors" on a plat. On a recorded survey document that is not a
// cosmetic defect — the notes carry the basis of bearing and the monument description, and a
// hyphenless mid-word break is the kind of thing that gets a plat sent back.
//
// ── 2. A LEGIBILITY FLOOR MUST NOT OUTLIVE ITS BOX ──────────────────────────────────────────────
// Every label in the title block was sized as `Math.max(boxHeight * k, N)` with N in SCREEN PIXELS.
// The intent is right — keep small lettering readable. But the floor never stopped applying, so as
// the sheet shrank with zoom the boxes kept shrinking and the text did not. At 8% zoom the sheet was
// a thumbnail with "SURVEY FIRM", "GRAPHIC SCALE", "Untitled Drawing" and the north arrow's "N"
// rendered at full size on top of one another, spilling far outside the paper.
//
// The rule that fixes it: **text on the sheet is always proportional to the sheet.** A floor may
// raise a size only while the result still belongs to its box; once the natural size falls below
// legibility the honest thing is to draw nothing, because lettering that has stopped scaling is
// telling the reader it is somewhere it is not. Suppressing it is also cheaper — each PIXI.Text
// allocates its own canvas texture, and a thumbnail sheet does not need forty of them.

/**
 * Wrap `text` to at most `maxChars` per line, breaking between words.
 *
 * A word longer than the line is hard-broken rather than allowed to overflow — a 60-character
 * unbroken token is nearly always a URL, a bearing string or a stamped monument id, and letting it
 * run past the block's edge looks like a rendering fault rather than a long word.
 *
 * `maxChars` is a character budget rather than a measured width because the callers approximate
 * glyph width as a fraction of font size. That approximation is unchanged here; this function fixes
 * *where* the breaks land, not how the budget is computed.
 */
export function wrapTextToWidth(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const out: string[] = [];
  // Collapse runs of whitespace — a note pasted from a PDF carries newlines and double spaces that
  // would otherwise become empty lines in the middle of the block.
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  let cur = '';
  for (const word of words) {
    if (cur === '') {
      cur = word;
    } else if (cur.length + 1 + word.length <= limit) {
      cur = `${cur} ${word}`;
    } else {
      out.push(cur);
      cur = word;
    }
    // The current line can only exceed the limit when a single word did it, since every other path
    // checks first. Hard-break the overflow and carry the tail.
    while (cur.length > limit) {
      out.push(cur.slice(0, limit));
      cur = cur.slice(limit);
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

/**
 * Below this, paper-space lettering is not legible on screen, and a floor that keeps it at this size
 * makes it overflow the box it belongs to. 4.5 px is where lowercase Arial stops resolving on a
 * standard display; the exact value matters less than that the rule exists.
 */
export const TB_MIN_LEGIBLE_PX = 4.5;

/**
 * The size to draw sheet furniture text at, or `null` to draw nothing.
 *
 * Callers pass the size the element's own geometry implies — `boxHeight * k`, with no floor. This
 * returns it unchanged when it is legible and `null` when it is not, which is what keeps lettering
 * proportional to the sheet at every zoom.
 */
export function sheetTextSize(naturalPx: number): number | null {
  if (!Number.isFinite(naturalPx) || naturalPx < TB_MIN_LEGIBLE_PX) return null;
  return naturalPx;
}
