// lib/messages/read-sync.ts
//
// Cross-surface "message read" sync. Four surfaces can mark a conversation read — the popup
// messenger, the /admin/messages list, a single conversation page, and the notification bell — and
// N3's requirement is that reading on any one of them settles the others *without a reload*: the
// bell's red bubble, the messenger FAB badge, the Hub messages widget, and the home-screen app-icon
// badge.
//
// ── WHY AN EVENT AND NOT A SERVER PUSH ────────────────────────────────────────────────────────────
//
// The bell already polls every 15s (paused while the tab is hidden, with a catch-up on
// `visibilitychange`). That is fine for *arrival* — a new message can take a few seconds to show. It
// is not fine for *departure*: the user just tapped the thing, so a badge that lingers up to 15s
// reads as broken. The read is a local action, so the local surfaces can settle immediately without a
// websocket. A second **device** still waits for its own poll or a push; that is a different problem
// and is not what this module claims to solve.
//
// ── SAME-TAB *AND* CROSS-TAB, WHICH NEEDS BOTH TRANSPORTS ─────────────────────────────────────────
//
// This originally documented itself as "same-window only by design", leaning on each surface's poll
// to catch cross-tab staleness. That is a weak answer for the app-icon badge specifically: the badge
// is one per installed app, not one per tab, so a stale count in a second tab keeps re-asserting a
// badge the user has already cleared. `BroadcastChannel` fixes it in a few lines.
//
// **Both transports are required, and the reason is easy to get wrong:** `BroadcastChannel` delivers
// to every *other* context on the origin but NOT to the one that called `postMessage`. So a
// broadcast-only implementation would update every tab except the one the user is looking at. The
// `window` CustomEvent covers the calling tab; the channel covers the rest.

export const MESSAGES_READ_EVENT = 'messages:read';

/** Origin-scoped channel name. Only used when the browser supports BroadcastChannel. */
const CHANNEL = 'starr:messages-read';

export interface MessagesReadDetail {
  conversationId: string;
}

/**
 * Fire-and-forget: announce that `conversationId` was just read.
 *
 * Safe to call before or after the server round-trip. Callers currently fire it after a successful
 * POST, which is the right order — announcing a read that then fails to persist would clear a badge
 * that the next poll brings straight back, which looks worse than a slightly late clear.
 */
export function emitConversationRead(conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  try {
    window.dispatchEvent(
      new CustomEvent<MessagesReadDetail>(MESSAGES_READ_EVENT, {
        detail: { conversationId },
      }),
    );
  } catch {
    /* CustomEvent unsupported (very old browser) — ignore. */
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ conversationId } satisfies MessagesReadDetail);
      // Closing immediately is correct for a one-shot post: the message is already queued for
      // delivery, and leaving channels open on every read would leak one per call.
      ch.close();
    }
  } catch {
    /* Some privacy modes throw on construction — the same-tab event still fired. */
  }
}

/**
 * Subscribe to "a conversation was read", from this tab or any other tab on this origin.
 *
 * Returns an unsubscribe function; call it from a `useEffect` cleanup. Handlers must tolerate being
 * called more than once for the same logical read — two surfaces in one tab can each mark the same
 * conversation — so the handler should be idempotent (refetching a count is).
 */
export function subscribeConversationRead(
  handler: (detail: MessagesReadDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onWindow = (e: Event) => {
    const detail = (e as CustomEvent<MessagesReadDetail>).detail;
    if (detail?.conversationId) handler(detail);
  };
  window.addEventListener(MESSAGES_READ_EVENT, onWindow);

  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (e: MessageEvent<MessagesReadDetail>) => {
        if (e.data?.conversationId) handler(e.data);
      };
    }
  } catch {
    /* No cross-tab sync in this browser; the same-tab listener above still works. */
  }

  return () => {
    window.removeEventListener(MESSAGES_READ_EVENT, onWindow);
    try { ch?.close(); } catch { /* already closed */ }
  };
}
