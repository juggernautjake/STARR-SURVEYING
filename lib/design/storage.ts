// lib/design/storage.ts — name it, save it, open it later.
//
// Owner: *"I need to be able to name the design and save it and be able to open it and work on it
// more in the future."*
//
// ── WHY localStorage FIRST ──────────────────────────────────────────────────────────────────────
//
// The database table (seed 609) is designed and will hold these; this ships first because the owner
// needs to open the page and place things tonight rather than wait for a seed to be applied. The
// document shape is identical either way, so moving to the server is a write path, not a rewrite —
// `listDesigns` / `loadDesign` / `saveDesign` are the only four functions the rest of the studio
// knows about, and they keep their signatures.
//
// Two properties matter more than the storage medium:
//
//   · AUTOSAVE. A closed tab must never be a lost afternoon. Every change writes a draft under its
//     own key, separate from the last explicit save, so "save" still means something.
//   · A LIST WITH NAMES. A design nobody can find again is a design nobody made.

import type { DesignDocument } from './document';

const INDEX_KEY = 'starr.design.index';
const DOC_PREFIX = 'starr.design.doc.';
const DRAFT_PREFIX = 'starr.design.draft.';

export interface DesignSummary {
  id: string;
  name: string;
  route: string | null;
  updatedAt: string;
  version: number;
  /** Element counts per view, so the list can say "12 / 9" rather than making you open it. */
  counts: { desktop: number; mobile: number };
  // ── THE LIFECYCLE, WHEN THE ROW CAME FROM THE SERVER ─────────────────────────────────────────
  //
  // Optional, and the reason is the merge in `client.ts`: the list a caller receives is the
  // server's designs plus any that exist ONLY in this browser and have never been uploaded. A
  // local-only draft has no status, is not locked and belongs to no theme family — it does not yet
  // exist as far as the lifecycle is concerned. Marking these optional says that out loud instead
  // of typing a browser draft as though the server had answered for it.
  status?: string;
  locked?: boolean;
  themeGroup?: string | null;
  themeId?: string | null;
  ownerEmail?: string | null;
  variantOf?: string | null;
}

function canStore(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Private windows and locked-down browsers throw on ACCESS, not on use.
    return false;
  }
}

function readJson<T>(key: string): T | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (!canStore()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota, or a browser refusing to store. The caller shows this rather than silently losing work.
    return false;
  }
}

export function listDesigns(): DesignSummary[] {
  const index = readJson<DesignSummary[]>(INDEX_KEY) ?? [];
  return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDesign(id: string): DesignDocument | null {
  return readJson<DesignDocument>(DOC_PREFIX + id);
}

/** The unsaved draft for a design, if the tab closed mid-edit. */
export function loadDraft(id: string): DesignDocument | null {
  return readJson<DesignDocument>(DRAFT_PREFIX + id);
}

export function saveDraft(doc: DesignDocument): void {
  writeJson(DRAFT_PREFIX + doc.id, doc);
}

export function clearDraft(id: string): void {
  if (!canStore()) return;
  try { window.localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* nothing to clear */ }
}

function summarise(doc: DesignDocument): DesignSummary {
  return {
    id: doc.id,
    name: doc.name,
    route: doc.route,
    updatedAt: doc.updatedAt,
    version: doc.version,
    counts: {
      desktop: doc.views.desktop.elements.length,
      mobile: doc.views.mobile.elements.length,
    },
  };
}

/** An explicit save: bumps the version, updates the index, and clears the draft. */
export function saveDesign(doc: DesignDocument, now: string): { ok: boolean; doc: DesignDocument } {
  const next: DesignDocument = { ...doc, updatedAt: now, version: doc.version + 1 };
  const ok = writeJson(DOC_PREFIX + next.id, next);
  if (ok) {
    const index = listDesigns().filter((d) => d.id !== next.id);
    writeJson(INDEX_KEY, [summarise(next), ...index]);
    clearDraft(next.id);
  }
  return { ok, doc: next };
}

export function deleteDesign(id: string): void {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(DOC_PREFIX + id);
    window.localStorage.removeItem(DRAFT_PREFIX + id);
    writeJson(INDEX_KEY, listDesigns().filter((d) => d.id !== id));
  } catch {
    /* already gone */
  }
}

export function renameDesign(id: string, name: string, now: string): DesignDocument | null {
  const doc = loadDesign(id);
  if (!doc) return null;
  const next = { ...doc, name, updatedAt: now };
  saveDesign(next, now);
  return next;
}

/** Duplicate a design as a variant of it — "Jobs list — A" becomes the parent of "Jobs list — B". */
export function duplicateDesign(id: string, newId: string, name: string, now: string): DesignDocument | null {
  const doc = loadDesign(id);
  if (!doc) return null;
  const copy: DesignDocument = {
    ...doc,
    id: newId,
    name,
    variantOf: doc.variantOf ?? doc.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  saveDesign(copy, now);
  return copy;
}
