// lib/design/lifecycle.ts — what a design's status means, and what it lets you do.
//
// Phase S of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"we will have the active version, the alternative versions that are inactive but
// considered complete and functional, and then the drafts that are still being worked on"*, and
// *"we should never be able to change the default page for any page itself, but we should be able
// to clone it and change the clone."*
//
// ── ONE DEFINITION, READ BY EVERYTHING ──────────────────────────────────────────────────────────
//
// The API, the editor, the page list and the tests all ask the same questions — can this be edited,
// can it be deleted, what happens if I activate it — and if each answered for itself they would
// eventually disagree. A UI that offers a Save button the server will reject is worse than one that
// offers nothing, because it looks like the save worked until you reload.
//
// So the rules live here as data, and every surface reads them.

export type DesignStatus = 'default' | 'active' | 'alternative' | 'draft' | 'archived';

export interface StatusRule {
  id: DesignStatus;
  label: string;
  /** One line, shown next to the control that sets it. Says the CONSEQUENCE, not the name again. */
  meaning: string;
  /** Can its elements be changed? */
  editable: boolean;
  /** Can it be deleted outright? */
  deletable: boolean;
  /** At most one per route? */
  singular: boolean;
  /** Which statuses this one can be moved to directly. */
  canBecome: DesignStatus[];
  /** The colour role the chip wears. Names a token role, not a hex. */
  tone: 'accent' | 'success' | 'info' | 'muted' | 'warning';
}

export const STATUS_RULES: Record<DesignStatus, StatusRule> = {
  default: {
    id: 'default',
    label: 'Default',
    // Not "the original" — the word that matters is TRACE. It was measured from the running page,
    // which is the only reason it can be trusted as a baseline.
    meaning: 'Traced from the page as it is served today. Read-only — clone it to make changes.',
    editable: false,
    deletable: false,
    singular: true,
    // A default can only ever be re-traced or retired; it is never promoted, because promoting the
    // record of what exists to the specification of what should exist says nothing.
    canBecome: ['archived'],
    tone: 'muted',
  },
  active: {
    id: 'active',
    label: 'Active',
    meaning: 'The design of record for this page. Its linked themes are offered in settings.',
    editable: true,
    deletable: false,
    singular: true,
    canBecome: ['alternative', 'draft', 'archived'],
    tone: 'success',
  },
  alternative: {
    id: 'alternative',
    label: 'Alternative',
    meaning: 'Finished and usable, but not the current record. Activate it to swap.',
    editable: true,
    deletable: true,
    singular: false,
    canBecome: ['active', 'draft', 'archived'],
    tone: 'info',
  },
  draft: {
    id: 'draft',
    label: 'Draft',
    meaning: 'Still being built. Not offered anywhere until it is promoted.',
    editable: true,
    deletable: true,
    singular: false,
    canBecome: ['alternative', 'active', 'archived'],
    tone: 'accent',
  },
  archived: {
    id: 'archived',
    label: 'Archived',
    meaning: 'Kept for history, out of the way. Nothing reads it.',
    editable: false,
    deletable: true,
    singular: false,
    canBecome: ['draft'],
    tone: 'warning',
  },
};

export const STATUS_ORDER: DesignStatus[] = ['active', 'default', 'alternative', 'draft', 'archived'];

export function statusRule(status: string | null | undefined): StatusRule {
  return STATUS_RULES[(status ?? 'draft') as DesignStatus] ?? STATUS_RULES.draft;
}

export function isEditable(design: { status?: string | null; locked?: boolean | null }): boolean {
  if (design.locked) return false;
  return statusRule(design.status).editable;
}

/** Why a save is being refused, in words a person can act on. Null when it is allowed. */
export function refuseEditReason(design: { status?: string | null; locked?: boolean | null }): string | null {
  if (design.locked || design.status === 'default') {
    return 'This is the default — a trace of the page as it is actually served, so it stays exactly '
      + 'as the page is. Clone it and edit the clone.';
  }
  if (design.status === 'archived') {
    return 'This design is archived. Move it back to draft to work on it again.';
  }
  return null;
}

export function canTransition(from: string | null | undefined, to: DesignStatus): boolean {
  return statusRule(from).canBecome.includes(to);
}

/**
 * What activating this design does to the rest of the route.
 *
 * Returned rather than performed, so the UI can SAY it before the click. "Activate" quietly
 * demoting the design somebody else was treating as current is the kind of surprise that makes
 * people stop trusting a tool.
 */
export function activationEffect(
  target: { id: string; name: string },
  currentActive: { id: string; name: string } | null,
): { demotes: string | null; summary: string } {
  if (!currentActive || currentActive.id === target.id) {
    return { demotes: null, summary: `“${target.name}” becomes the design of record for this page.` };
  }
  return {
    demotes: currentActive.id,
    summary: `“${target.name}” becomes the design of record. “${currentActive.name}” becomes an `
      + 'alternative — nothing is lost, and you can swap back.',
  };
}

/** The name a clone gets. Readable, and it says what it came from. */
export function cloneName(source: { name: string; status?: string | null }, existingNames: string[]): string {
  const base = source.status === 'default' ? `${source.name} — my version` : `${source.name} copy`;
  if (!existingNames.includes(base)) return base;
  // "copy 2" rather than "copy copy": the second copy of a thing is the second copy of the thing.
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base} ${n}`;
    if (!existingNames.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now().toString(36)}`;
}
