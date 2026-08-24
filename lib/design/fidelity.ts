// lib/design/fidelity.ts — has this element been checked against the real page?
//
// Phase F5 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"I don't want it so that we build everything out in the editor, like it, and then set it
// to active, only to find out that it built everything weirdly in a way that did not represent the
// actual planned page."*
//
// ── WHY THIS IS IN THE UI AND NOT ONLY IN A TEST ────────────────────────────────────────────────
//
// The gate stops a KNOWN difference from being ignored. It cannot stop the state the owner actually
// described, which is quieter: reaching for an element, liking it on the canvas, and having no way
// to tell whether anyone ever compared it to the page it stands for. "Not checked" and "checked and
// fine" look identical on a canvas.
//
// So the record is read here too, and the palette says which of the three an element is. An unknown
// is marked as unknown rather than left to look like a pass — the whole point is that absence of a
// complaint is not evidence.

import record from './fidelity.generated.json';

export type FidelityStatus = 'verified' | 'differs' | 'not-seen' | 'unmeasured';

export interface FidelityNote {
  status: FidelityStatus;
  /** The route the comparison was made against, when there was one. */
  route: string | null;
  /** One line for a tooltip — says what is known, not what it is called. */
  summary: string;
  /** What differs, when something does. */
  diffs: Array<{ what: string; editor: unknown; page: unknown }>;
}

interface RecordEntry {
  signature?: string;
  route?: string | null;
  status?: string;
  diffs?: Array<{ what: string; editor: unknown; page: unknown }>;
}

const ENTRIES = (record as { entries?: Record<string, RecordEntry> }).entries ?? {};
export const MEASURED_AT: string | null = (record as { measuredAt?: string }).measuredAt ?? null;

export function fidelityOf(entryId: string): FidelityNote {
  const hit = ENTRIES[entryId];
  if (!hit) {
    return {
      status: 'unmeasured',
      route: null,
      summary: 'Never compared to a real page — nothing knows whether this matches.',
      diffs: [],
    };
  }
  const diffs = hit.diffs ?? [];
  if (hit.status === 'verified') {
    return {
      status: 'verified',
      route: hit.route ?? null,
      summary: `Matches the real element on ${hit.route ?? 'a live page'} — style and size.`,
      diffs: [],
    };
  }
  if (hit.status === 'differs') {
    return {
      status: 'differs',
      route: hit.route ?? null,
      summary: `Differs from ${hit.route ?? 'the live page'}: `
        + diffs.map((d) => `${d.what} ${d.editor} vs ${d.page}`).join(', '),
      diffs,
    };
  }
  return {
    status: 'not-seen',
    route: null,
    // Not a failure and not a pass. An error banner, a toast or a skeleton may be perfectly correct
    // and simply not on screen while a crawler walks the admin — saying "unverified" is honest,
    // saying "broken" would not be.
    summary: 'No admin route rendered this while the check ran, so it is unverified rather than wrong.',
    diffs: [],
  };
}

/** A one-word badge. Short because it sits on a palette card next to a 12px label. */
export const FIDELITY_BADGE: Record<FidelityStatus, { mark: string; label: string }> = {
  verified: { mark: '✓', label: 'Matches the real page' },
  differs: { mark: '!', label: 'Differs from the real page' },
  'not-seen': { mark: '?', label: 'Not seen on any page yet' },
  unmeasured: { mark: '?', label: 'Never measured' },
};
