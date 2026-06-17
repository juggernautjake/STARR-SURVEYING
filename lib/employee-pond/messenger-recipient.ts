// lib/employee-pond/messenger-recipient.ts
//
// employee-pond Slice E9b — shared recipient store. The
// FloatingMessenger widget, the dedicated /admin/messages page,
// (and E9c's email composer once it lands) all read + write this
// store so a recipient picked in one surface follows the user to
// the next surface.
//
// Backed by localStorage so it survives a tab refresh + a full
// navigation. A short TTL (1 hour) ages out stale recipients so
// returning to the page tomorrow doesn't auto-load yesterday's
// conversation.

const STORAGE_KEY = 'admin/messages/active-recipient';
const TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SavedRecipient {
  /** Lowercased email address. */
  email: string;
  /** Wall-clock time the value was written. */
  savedAt: number;
}

/** Pure helper — decides whether a SavedRecipient is still fresh.
 *  Source-locked so the TTL behavior is testable without touching
 *  localStorage. */
export function isRecipientFresh(
  saved: SavedRecipient | null,
  now: number = Date.now(),
): saved is SavedRecipient {
  if (!saved) return false;
  if (typeof saved.email !== 'string' || saved.email.length === 0) return false;
  if (typeof saved.savedAt !== 'number') return false;
  if (now - saved.savedAt > TTL_MS) return false;
  return true;
}

/** Normalize an email the same way every callsite needs to — trim
 *  + lowercase. Exported because the FloatingMessenger event
 *  handler uses the same normalization. */
export function normalizeRecipientEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Persist the active recipient. Safe to call from server
 *  (no-op when localStorage is missing). */
export function saveActiveRecipient(email: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeRecipientEmail(email);
  try {
    if (normalized.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: SavedRecipient = { email: normalized, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private-mode browsers throw on localStorage; ignore. */
  }
}

/** Read + freshness-check the active recipient. Returns the email
 *  when fresh, null otherwise. */
export function readActiveRecipient(now: number = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: SavedRecipient | null;
  try {
    parsed = JSON.parse(raw) as SavedRecipient;
  } catch {
    return null;
  }
  if (!isRecipientFresh(parsed, now)) return null;
  return parsed.email;
}

/** Drop the saved recipient (e.g. when the user explicitly closes a
 *  conversation). */
export function clearActiveRecipient(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const MESSENGER_RECIPIENT_STORAGE_KEY = STORAGE_KEY;
export const MESSENGER_RECIPIENT_TTL_MS = TTL_MS;
