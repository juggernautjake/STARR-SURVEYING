// lib/messages/read-sync.ts
// Cross-surface "message read" sync. When a conversation is marked read on ANY
// surface (the popup messenger, the /admin/messages page), we fire a window
// event so other surfaces on the same page (the Messages hub widget, the
// notification bell, the messenger FAB badge) can reset their unread state
// instantly — no page reload. Same-window only by design; cross-tab staleness
// is caught by each surface's existing visibility/poll refresh.

export const MESSAGES_READ_EVENT = 'messages:read';

export interface MessagesReadDetail {
  conversationId: string;
}

/** Fire-and-forget: announce that `conversationId` was just read. */
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
}
