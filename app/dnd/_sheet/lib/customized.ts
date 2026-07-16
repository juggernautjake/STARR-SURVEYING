// app/dnd/_sheet/lib/customized.ts — the ✎ "this has been hand-customized" signal (Slice 20).
//
// The user's ask, verbatim: "If the stats are edited, then there should be some kind of marker
// showing that the thing has been customized." So the signal is simply "was this element edited away
// from what it was" — set when an in-place editor saves a real change. (The richer "differs from the
// OFFICIAL version, with a revert-to-official" needs a per-system content catalog to diff against and
// is its own slice; this is the honest, buildable core the request named.)
//
// ✎ is deliberately NOT the ★ (Slice 13): ★ = something is modifying this right now; ✎ = this differs
// from how it came. A hand-edited spell nothing is buffing has ✎ and no ★; a vanilla score under a
// magic belt has ★ and no ✎. Same element can carry both.

/** Did the draft change anything meaningful vs the original? Compares every field EXCEPT the marker
 *  itself, so re-opening an editor and saving without edits does not flip the flag on. */
export function elementChanged<T extends { customized?: boolean }>(original: T, draft: T): boolean {
  const strip = (o: T): string => {
    const clone = { ...o } as Record<string, unknown>
    delete clone.customized
    return JSON.stringify(clone)
  }
  return strip(original) !== strip(draft)
}

/** The `customized` value to persist after an edit: true once it has been touched (or was already),
 *  so the mark reflects "this has been hand-customized" and does not silently clear itself. */
export function nextCustomized<T extends { customized?: boolean }>(original: T, draft: T): boolean {
  return original.customized === true || elementChanged(original, draft)
}
