// lib/cad/io/pending-open.ts
//
// trv-full-support — hand a file from the shared file viewer to Starr
// CAD ("Open in Starr CAD" on a .TRV preview).
//
// The viewer already holds a URL it may fetch the file from. Putting
// that URL (often a signed storage URL) in the CAD page's query string
// would leave it in browser history, so the viewer parks `{ url, name }`
// in sessionStorage and navigates to `/admin/cad?open=file`. CADLayout
// consumes the entry once, fetches the bytes, decodes them
// (trv-encoding) and dispatches `cad:openFileContents`, which MenuBar
// runs through the same open/import path as File → Open. Mirrors the
// RECON hand-off (`starr-cad-pending-recon`), but per-tab.

export const PENDING_OPEN_KEY = 'starr-cad-pending-open';
/** The query flag that tells CAD to look for a pending file. */
export const PENDING_OPEN_PARAM = 'open';
/** An entry older than this is ignored (a signed URL will have expired). */
export const PENDING_OPEN_MAX_AGE_MS = 10 * 60 * 1000;

export interface PendingCadOpen {
  url: string;
  name: string;
  at: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionStore(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Park a file for CAD to open. Returns the CAD URL to navigate to, or
 *  null when session storage is unavailable. */
export function stashPendingCadOpen(file: { url: string; name: string }, store: StorageLike | null = sessionStore(), now = Date.now()): string | null {
  if (!store) return null;
  try {
    store.setItem(PENDING_OPEN_KEY, JSON.stringify({ url: file.url, name: file.name, at: now }));
  } catch {
    return null;
  }
  return `/admin/cad?${PENDING_OPEN_PARAM}=file`;
}

/** Take (and remove) the parked file, if there is a fresh, well-formed one. */
export function consumePendingCadOpen(store: StorageLike | null = sessionStore(), now = Date.now()): PendingCadOpen | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(PENDING_OPEN_KEY);
    if (raw !== null) store.removeItem(PENDING_OPEN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingCadOpen>;
    if (typeof v.url !== 'string' || typeof v.name !== 'string' || typeof v.at !== 'number') return null;
    if (now - v.at > PENDING_OPEN_MAX_AGE_MS || now < v.at - 60_000) return null;
    // Same-origin paths and http(s) URLs only — never javascript:/data:.
    if (!/^(https?:\/\/|\/(?!\/))/i.test(v.url)) return null;
    return { url: v.url, name: v.name, at: v.at };
  } catch {
    return null;
  }
}
