// lib/files/labels.ts — naming a file, and tagging it.
//
// Owner, 2026-08-22: *"I also want it so that I can label files and videos and pictures. I need to
// be able to name them and write notes for them too."*
//
// ── WHY A LABEL IS NOT A RENAME ─────────────────────────────────────────────────────────────────
//
// `file_name` is load-bearing in three places that have nothing to do with what a file is called on
// screen: the storage key is derived from it (`jobFileStoragePath`), the download's filename comes
// from it, and it is the name the crew member's phone gave the file — which is what they will
// search for when they cannot find it. Overwriting it to get a nicer list is how a file becomes
// unfindable by the person who took it.
//
// So `label` is a display layer. `displayName()` in `lib/jobs/file-storage.ts` prefers it; nothing
// else changes. Clearing the label restores the uploaded name rather than leaving a blank row.
//
// Pure. No I/O. Tested in `__tests__/files/labels.test.ts`.

/** A label longer than this is a note, and there is now somewhere to put notes. */
export const MAX_LABEL_LENGTH = 120;

/** Long enough for "topographic control point", short enough that it is still a tag. */
export const MAX_TAG_LENGTH = 32;

/**
 * More than this on one file is not filtering any more, it is a second description.
 *
 * A cap exists at all because tags are free text: without one, a paste accident writes four hundred
 * single-character tags into a GIN index and every tag picker on the job becomes unusable.
 */
export const MAX_TAGS_PER_FILE = 12;

/**
 * C0 controls plus DEL.
 *
 * Built with `new RegExp` from a plain-ASCII string rather than written as a regex literal. The
 * literal form of this class either embeds raw control bytes in the source — which makes this file
 * binary to `git diff` and `grep`, as it briefly did — or needs escapes that the shells and editors
 * in this chain each rewrite slightly differently. A constructed pattern survives all of them.
 */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

export interface LabelCheck {
  ok: boolean;
  /** The value to store — `null` means "clear it and fall back to the uploaded name". */
  value?: string | null;
  error?: string;
}

/**
 * Validate a display name.
 *
 * Whitespace-only is treated as CLEARING rather than as an error, because that is what a person
 * emptying the box means. Returning an error there would leave them unable to undo a rename.
 */
export function checkLabel(raw: unknown): LabelCheck {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'A name must be text.' };

  // Control characters — including the newlines a paste from a PDF brings along — would render as
  // a one-line name with invisible holes in it, and break the viewer's title bar.
  const cleaned = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { ok: true, value: null };
  if (cleaned.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `A name must be ${MAX_LABEL_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: cleaned };
}

/**
 * Fold one tag to its canonical form, or `null` if nothing survives.
 *
 * Lower-cased because "Monument", "monument" and "MONUMENT" are one tag to everybody except a
 * database — and a filter that shows two of the three is worse than no filter. Spaces are kept
 * (a tag is a phrase, not an identifier) but collapsed, so "access  road" and "access road" match.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .toLowerCase()
    .replace(CONTROL_CHARS, ' ')
    // Anything that is not a letter, digit, space, hyphen or underscore becomes a space. Commas in
    // particular: people type "monument, access" into one box and mean two tags, and `parseTags`
    // below splits on commas before ever reaching here — this is the second line of defence.
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  // Trimmed again after slicing: cutting at the cap can leave a trailing space, and " monument"
  // and "monument " must not be two rows in the tag facet list.
  return cleaned.slice(0, MAX_TAG_LENGTH).trim() || null;
}

/**
 * Turn whatever the client sent into the stored tag array.
 *
 * Accepts an array (the chip editor) or a string (a typed "a, b, c"), because both are real inputs
 * and making the caller normalise first is how the two paths drift.
 *
 * Order is preserved and duplicates drop the LATER copy, so the list reads the way the person
 * typed it rather than re-sorting under their cursor while they edit.
 */
export function parseTags(raw: unknown): string[] {
  const parts: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = normalizeTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_FILE) break;
  }
  return out;
}

/**
 * Every distinct tag in use across a set of files, with how often — the tag filter's source.
 *
 * Sorted by count and then alphabetically, so the words this job actually uses come first and the
 * order is stable between renders (a filter bar that reshuffles when a file is added is a filter
 * bar people stop trusting).
 */
export function tagFacets(files: Array<{ tags?: string[] | null }>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    // De-duped per file, so a row that somehow stored the same tag twice cannot inflate the count.
    for (const tag of new Set(file.tags ?? [])) {
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Does this file match the active tag filter?
 *
 * AND, not OR: selecting "monument" and "before" means the photos that are both, which is the
 * question somebody narrowing a list of four hundred photos is asking. OR would widen the list they
 * are trying to shrink.
 */
export function matchesTags(file: { tags?: string[] | null }, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const have = new Set(file.tags ?? []);
  return selected.every((tag) => have.has(tag));
}
