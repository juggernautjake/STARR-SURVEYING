// app/admin/components/FloatingMessenger.tsx — Floating messenger widget
// Full in-panel chat: browse conversations, search users, create new DM/group,
// send/receive messages with timestamps and sender names.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
// Slice MX1 — "Open in /admin/messages →" header link.
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
// Slice MX3 — draggable panel via the shared useDraggable hook.
import { useDraggable } from '@/lib/admin/use-draggable';
// Slice MX5 — highlight + snippet helpers for the cross-conversation search.
import { highlightSegments, snippetAroundMatch } from '@/lib/admin/messenger-search';
// messenger-notify-fix-2026-06-18 — surface send errors via the global toast
// system so the user knows when an API call failed (the previous silent
// catch made the messenger feel "stuck") and pop a "💬 New message from
// …" toast when the unread count rises between polls.
import { useToast } from '@/app/admin/components/Toast';

const MESSENGER_PANEL_WIDTH = 640;
const MESSENGER_PANEL_HEIGHT = 600;
const MESSENGER_DRAG_STORAGE_KEY = 'admin/messenger/panel-position';
// employee-pond Slice E9b — cross-surface recipient continuity.
import {
  readActiveRecipient,
  saveActiveRecipient,
} from '@/lib/employee-pond/messenger-recipient';
import RichMessageInput, { type RichMessageInputHandle } from '@/app/admin/components/messaging/RichMessageInput';
import MessageBody from '@/app/admin/components/messaging/MessageBody';
import { htmlToPlainText } from '@/lib/messages/rich-text';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { emitConversationRead } from '@/lib/messages/read-sync';

interface Conversation {
  id: string;
  title: string | null;
  type: string;
  last_message_at: string;
  last_message_preview: string | null;
  participants: { user_email: string; role: string }[];
}

// messenger-smoothing-2026-06-18 — exported so vitest can lock the
// optimistic-merge contract via the pure helpers below.
export interface Message {
  id: string;
  sender_email: string;
  content: string;
  message_type: string;
  created_at: string;
  attachments: unknown[];
}

interface Contact {
  email: string;
  name: string;
  is_admin: boolean;
}

type PanelView = 'list' | 'chat' | 'new' | 'search';

const QUICK_EMOJIS = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '❤️', '💯', '✅', '❌'];

function displayName(email: string): string {
  return email.split('@')[0]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** messenger-smoothing-2026-06-18 — merge a fresh server response with
 *  any optimistic messages already in local state. Pure + exported.
 *
 *  Rules:
 *    1. If the server array is identical (same ids in the same order)
 *       to what `prev` already shows, return `prev` so React skips the
 *       re-render entirely.
 *    2. Otherwise build the merged list as server-messages first, then
 *       any optimistic rows whose content + sender don't already match
 *       a server row (so the optimistic dissolves into the real row
 *       once the server confirms).
 */
export function mergeServerWithOptimistic(
  prev: Message[],
  server: Message[],
): Message[] {
  const sameIds =
    prev.length === server.length
    && prev.every((m, i) => m.id === server[i]?.id);
  if (sameIds) return prev;

  const optimisticOnly = prev.filter((m) => m.id.startsWith('optimistic:'));
  const survivors = optimisticOnly.filter((opt) =>
    !server.some(
      (s) => s.sender_email === opt.sender_email && s.content === opt.content,
    ),
  );
  return [...server, ...survivors];
}

/** messenger-smoothing-2026-06-18 — local-only message id for the
 *  optimistic insert so we can dedupe + replace once the server
 *  confirms. Pure. */
export function makeOptimisticId(): string {
  return `optimistic:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** messenger-smoothing-pass2-2026-06-18 — pure dedupe helpers used by
 *  the polled refresh so identical responses skip the setState call.
 *  React then sees the same reference and stops re-rendering the
 *  affected subtree entirely. */
export function sameConversationSnapshot(
  prev: ReadonlyArray<{ id: string; last_message_at?: string; last_message_preview?: string | null }>,
  next: ReadonlyArray<{ id: string; last_message_at?: string; last_message_preview?: string | null }>,
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id
      || (a.last_message_at ?? '') !== (b.last_message_at ?? '')
      || (a.last_message_preview ?? '') !== (b.last_message_preview ?? '')
    ) {
      return false;
    }
  }
  return true;
}

export function sameCountMap(
  prev: Record<string, number>,
  next: Record<string, number>,
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const k of prevKeys) {
    if (prev[k] !== next[k]) return false;
  }
  return true;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FloatingMessenger() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userEmail = session?.user?.email;
  const { addToast } = useToast();
  // messenger-notify-fix-2026-06-18 — track the previously-seen unread
  // count so we can pop a toast when it grows between polls. Initialised
  // lazily to 0 + only fires after the FIRST successful fetch (so we
  // don't toast existing unread on mount).
  const prevUnreadRef = useRef<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  // Slice MX3 — draggable panel. Persists position to
  // localStorage so the user keeps their preferred spot across
  // page loads. Default placement is the bottom-right corner
  // above the FAB pill (matches MX1's CSS contract).
  const drag = useDraggable({
    storageKey: MESSENGER_DRAG_STORAGE_KEY,
    width: MESSENGER_PANEL_WIDTH,
    height: MESSENGER_PANEL_HEIGHT,
    enabled: isOpen,
    defaultPlacement: ({ w, h }) => ({
      x: Math.max(0, w - MESSENGER_PANEL_WIDTH - 24),
      y: Math.max(0, h - MESSENGER_PANEL_HEIGHT - 88),
    }),
  });
  const [view, setView] = useState<PanelView>('list');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composeEmpty, setComposeEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Search / new conversation
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [convSearch, setConvSearch] = useState('');
  // Slice MX5 — remember the active message-search query so we
  // can highlight the matches + show "Results for 'foo'" copy.
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ content: string; sender_email: string; created_at: string; conversation_id: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const richRef = useRef<RichMessageInputHandle>(null);
  // The recipient-continuity auto-jump must run AT MOST ONCE per open, otherwise
  // it fights the back button (back → view:'list' → effect re-opens the saved
  // conversation). Reset when the panel closes.
  const didAutoJumpRef = useRef(false);

  // Fetch conversations
  // messenger-smoothing-pass2-2026-06-18 — skip the setState call when
  // the server response is the same shape as what we already render.
  // Without this every 15-second poll re-renders the entire sidebar
  // (each <button> row was being remounted because every conv object
  // was a brand-new reference) which the user perceived as a flicker.
  const fetchConversations = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/admin/messages/conversations?archived=false');
      if (res.ok) {
        const data = await res.json();
        const next: Conversation[] = data.conversations || [];
        setConversations((prev) => sameConversationSnapshot(prev, next) ? prev : next);
      }
    } catch { /* silent */ }
  }, [userEmail]);

  // Fetch unread counts
  // messenger-smoothing-pass2-2026-06-18 — guard the setState calls
  // behind a deep-ish equality check so identical poll responses don't
  // re-render the FAB badge or the per-row unread pills.
  const fetchUnread = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/admin/messages/read');
      if (res.ok) {
        const data = await res.json();
        const nextTotal = data.unread_count || 0;
        const nextByConv = (data.unread_by_conversation || {}) as Record<string, number>;
        setUnreadCounts((prev) => sameCountMap(prev, nextByConv) ? prev : nextByConv);
        setTotalUnread((prev) => prev === nextTotal ? prev : nextTotal);
        // messenger-notify-fix-2026-06-18 — when the unread total grows
        // between polls AND the messenger is closed, surface a toast so
        // the recipient sees an in-app cue (matches the "users are
        // notified whenever they receive them" spec). The first
        // successful poll just seeds the baseline so existing unread on
        // mount doesn't trigger a stale toast.
        const prev = prevUnreadRef.current;
        if (prev !== null && nextTotal > prev && !isOpen) {
          const delta = nextTotal - prev;
          addToast(
            delta === 1 ? '💬 New message' : `💬 ${delta} new messages`,
            'info',
          );
        }
        prevUnreadRef.current = nextTotal;
      }
    } catch { /* silent */ }
  }, [userEmail, isOpen, addToast]);

  // Fetch messages for a conversation.
  // messenger-smoothing-2026-06-18:
  //   - `showSkeleton` only flips the loading state on a real
  //     conversation-switch fetch; polled refreshes don't toggle it
  //     (the "blip" the user complained about was this skeleton
  //     replacing the rendered list every 15s).
  //   - When the server response has the same message ids in the same
  //     order as the current state, skip the setState call entirely so
  //     React doesn't re-render or scroll-jump on every poll.
  //   - Optimistic rows kept in local state (id starting with
  //     `optimistic:`) survive the merge if the server hasn't echoed
  //     them yet; once a server message arrives with matching sender +
  //     content, the optimistic is dropped.
  const fetchMessages = useCallback(async (
    convId: string,
    options: { showSkeleton?: boolean } = {},
  ) => {
    const showSkeleton = options.showSkeleton !== false;
    if (showSkeleton) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/messages/send?conversation_id=${convId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const serverMessages: Message[] = data.messages || [];
        setMessages((prev) => mergeServerWithOptimistic(prev, serverMessages));
        fetch('/api/admin/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId }),
        }).then(() => emitConversationRead(convId)).catch(() => {});
      }
    } catch { /* silent */ }
    if (showSkeleton) setLoadingMessages(false);
  }, []);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch { /* silent */ }
  }, []);

  // Search messages
  const searchMessages = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/messages/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch { /* silent */ }
    setSearching(false);
  }, []);

  // Initial load + polling
  // messenger-smoothing-2026-06-18 — polled refreshes pass
  // `showSkeleton: false` to fetchMessages so the chat history doesn't
  // flicker every 15s; the merge helper short-circuits the setState
  // call when nothing changed.
  useEffect(() => {
    fetchConversations();
    fetchUnread();
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnread();
      if (activeConv) fetchMessages(activeConv.id, { showSkeleton: false });
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchUnread, activeConv, fetchMessages]);

  // Scroll to bottom when the message count grows.
  // Scroll behavior: when a conversation FIRST loads, jump straight to the
  // bottom INSTANTLY (before paint) so it opens showing the latest messages with
  // no top→bottom animation. Only a genuinely new message in the already-open
  // thread scrolls smoothly. A polled refresh that keeps the same messages
  // doesn't scroll at all.
  const lastMessageCountRef = useRef<number>(0);
  const scrolledConvRef = useRef<string | null>(null);
  useIsomorphicLayoutEffect(() => {
    const convId = activeConv?.id ?? null;
    if (!convId || messages.length === 0) { lastMessageCountRef.current = messages.length; return; }
    const isInitial = scrolledConvRef.current !== convId;
    if (isInitial) {
      scrolledConvRef.current = convId;
      messagesEndRef.current?.scrollIntoView({ block: 'end' }); // instant, no animation
    } else if (messages.length > lastMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, activeConv?.id]);

  // employee-pond Slice E9b — persist the active recipient whenever
  // a direct conversation is opened so the dedicated /admin/messages
  // page can pick up the same recipient. Group conversations don't
  // have a single recipient, so we clear the store in that case.
  useEffect(() => {
    if (!activeConv) return;
    if (activeConv.type !== 'direct') return;
    if (!userEmail) return;
    const other = (activeConv.participants || [])
      .map((p) => p.user_email)
      .find((email) => email && email.toLowerCase() !== userEmail.toLowerCase());
    if (other) saveActiveRecipient(other);
  }, [activeConv, userEmail]);

  // employee-pond Slice E9b — hydrate continuity when the widget
  // opens. If the user already had a recipient in flight on
  // /admin/messages or in the pond, jump straight to that
  // conversation when they pop the widget. Idempotent across opens
  // — we only auto-jump when the user hasn't already landed on a
  // chat view.
  useEffect(() => {
    // Reset the one-shot when the panel closes so the next open can auto-jump.
    if (!isOpen) { didAutoJumpRef.current = false; return; }
    if (didAutoJumpRef.current) return;        // only ever auto-jump once per open
    if (conversations.length === 0) return;    // wait until conversations load
    didAutoJumpRef.current = true;             // decide exactly once, now
    if (view === 'chat' && activeConv) return; // user already landed on a chat
    const saved = readActiveRecipient();
    if (!saved) return;
    const targetEmail = saved.toLowerCase();
    const existing = conversations.find((c) => {
      if (c.type !== 'direct') return false;
      const others = (c.participants || []).map((p) => p.user_email.toLowerCase());
      return others.includes(targetEmail);
    });
    if (existing) {
      setActiveConv(existing);
      setView('chat');
      fetchMessages(existing.id);
    }
  }, [isOpen, conversations, view, activeConv, fetchMessages]);

  // employee-pond Slice E9 — external open-with-recipient hook. The
  // employee-pond dialogue dispatches `employee-pond:open-messenger`
  // with `{ email }`; we open the widget and either jump to an
  // existing direct conv with that email or POST a new one. Listens
  // once on mount; cleans up on unmount. The dependency on
  // `conversations` ensures we always work with the latest snapshot
  // when deciding whether to reuse vs create.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<{ email?: string }>).detail;
      const targetEmail = detail?.email?.trim().toLowerCase();
      if (!targetEmail) return;
      if (!userEmail) return;
      setIsOpen(true);
      // Reuse the most recent direct conversation involving the
      // target email if one exists; otherwise create one.
      const existing = conversations.find((c) => {
        if (c.type !== 'direct') return false;
        const others = (c.participants || []).map((p) => p.user_email.toLowerCase());
        return others.includes(targetEmail);
      });
      if (existing) {
        setActiveConv(existing);
        setView('chat');
        fetchMessages(existing.id);
        return;
      }
      try {
        const res = await fetch('/api/admin/messages/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'direct',
            title: null,
            participant_emails: [targetEmail],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const conv = data.conversation;
          conv.participants = [
            { user_email: targetEmail, role: 'member' },
            { user_email: userEmail, role: 'owner' },
          ];
          setActiveConv(conv);
          setView('chat');
          fetchMessages(conv.id);
          fetchConversations();
        }
      } catch { /* silent */ }
    };
    window.addEventListener('employee-pond:open-messenger', handler);
    return () =>
      window.removeEventListener('employee-pond:open-messenger', handler);
  }, [conversations, userEmail, fetchMessages, fetchConversations]);

  // Open a conversation
  function openConversation(conv: Conversation) {
    setMessages([]);          // clean slate so the new thread opens at its bottom
    setActiveConv(conv);
    setView('chat');
    fetchMessages(conv.id);
  }

  // Send message
  // messenger-smoothing-2026-06-18 — the row now appears in the chat
  // history instantly (optimistic insert) and the input clears the same
  // tick. The server confirm runs in the background; once it returns we
  // silently refetch (no skeleton) and the merge dedupes the optimistic
  // row against the server-acked one.
  async function handleSend() {
    // Sanitized HTML — a formatted paste keeps its formatting end-to-end.
    const content = richRef.current?.getHtml() ?? '';
    if (htmlToPlainText(content).trim() === '' || !activeConv || !userEmail) return;
    const optimisticMsg: Message = {
      id: makeOptimisticId(),
      sender_email: userEmail,
      content,
      message_type: 'text',
      created_at: new Date().toISOString(),
      attachments: [],
    };
    // Optimistic insert + clear the input + collapse the emoji picker
    // BEFORE the network round-trip so the chat reads as instant.
    setMessages((prev) => [...prev, optimisticMsg]);
    richRef.current?.clear();
    setComposeEmpty(true);
    setShowEmoji(false);
    setSending(true);
    try {
      const res = await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConv.id, content, message_type: 'text' }),
      });
      if (res.ok) {
        // Silent refetch so the optimistic row dissolves into the
        // server-acked row + the merge helper avoids re-render churn.
        fetchMessages(activeConv.id, { showSkeleton: false });
        fetchConversations();
      } else {
        // messenger-notify-fix-2026-06-18 — surface a real error instead
        // of silently swallowing the failure. Parses the API's `{ error }`
        // payload when present; falls back to the HTTP status.
        let detail = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error && typeof data.error === 'string') detail = data.error;
        } catch { /* response wasn't JSON, keep the status */ }
        addToast(`Couldn't send message — ${detail}`, 'error');
        // Roll the optimistic message back + restore the draft so the user can retry.
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        richRef.current?.setHtml(content);
        setComposeEmpty(false);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'network error';
      addToast(`Couldn't send message — ${detail}`, 'error');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      richRef.current?.setHtml(content);
      setComposeEmpty(false);
    }
    setSending(false);
  }

  // Start new conversation
  async function startConversation() {
    if (selectedContacts.length === 0) return;
    const type = selectedContacts.length === 1 ? 'direct' : 'group';
    const title = type === 'group' ? (groupTitle.trim() || selectedContacts.map(c => c.name).join(', ')) : null;
    try {
      const res = await fetch('/api/admin/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, participant_emails: selectedContacts.map(c => c.email) }),
      });
      if (res.ok) {
        const data = await res.json();
        const conv = data.conversation;
        conv.participants = selectedContacts.map(c => ({ user_email: c.email, role: 'member' }));
        if (userEmail) conv.participants.push({ user_email: userEmail, role: 'owner' });
        setActiveConv(conv);
        setView('chat');
        setSelectedContacts([]);
        setGroupTitle('');
        setContactSearch('');
        fetchMessages(conv.id);
        fetchConversations();
      }
    } catch { /* silent */ }
  }

  // Toggle contact selection
  function toggleContact(c: Contact) {
    setSelectedContacts(prev =>
      prev.find(s => s.email === c.email)
        ? prev.filter(s => s.email !== c.email)
        : [...prev, c]
    );
  }

  // Get display name for conversation
  function getConvName(c: Conversation): string {
    if (c.title) return c.title;
    if (c.type === 'direct') {
      const other = c.participants?.find(p => p.user_email !== userEmail);
      return other ? displayName(other.user_email) : 'Direct Message';
    }
    const others = c.participants?.filter(p => p.user_email !== userEmail) || [];
    return others.map(p => displayName(p.user_email)).join(', ') || 'Group';
  }

  // Every participant's display name (incl. you) — shown in the header tooltip so
  // a group chat's full membership is one hover away even when the title is
  // truncated to the first couple of names.
  function getMemberNames(c: Conversation): string {
    return (c.participants || [])
      .map(p => p.user_email === userEmail ? 'You' : displayName(p.user_email))
      .join(', ');
  }

  // Filter conversations
  const filteredConvs = convSearch
    ? conversations.filter(c => getConvName(c).toLowerCase().includes(convSearch.toLowerCase()))
    : conversations;

  // Filter contacts
  const filteredContacts = contactSearch
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.email.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts;

  // Don't render on login or full messages page.
  //
  // Slice fab-modal-fix-2026-06-17 — user reported the Messages FAB
  // button "isn't even there anymore". Root cause: the old
  // `pathname.startsWith('/admin/messages')` exit hid the FAB on
  // every /admin/messages/* sub-route (/admin/messages/contacts,
  // /admin/messages/[id], etc.), but the user expects to keep quick
  // access to the floating messenger while browsing those sub-
  // pages. Now we only hide on the canonical /admin/messages
  // landing where the full messenger UI is already on screen.
  if (pathname === '/admin/login' || !userEmail) return null;
  if (pathname === '/admin/messages') return null;

  return (
    <>
      {/* FAB button */}
      {!isOpen && (
        <div className="messenger-fab-wrap">
          <span className="messenger-fab-tooltip">Messages</span>
          <button
            className="messenger-fab"
            onClick={() => { setIsOpen(true); setView('list'); fetchConversations(); fetchUnread(); }}
            aria-label="Open messages"
          >
            <MessageSquare size={22} strokeWidth={2} aria-hidden="true" />
            {totalUnread > 0 && (
              <span className="messenger-fab__badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
            )}
          </button>
        </div>
      )}

      {/* Panel — Slice fab-modal-fix-2026-06-17 — portaled to
          <body> with an explicit backdrop overlay so the user sees
          a clear dimmed-page state even when the rest of the panel
          CSS hasn't loaded yet. The defensive inline styles on the
          backdrop + panel guarantee the modal is visible even if a
          downstream CSS regression hides the .messenger-panel
          class. Click the backdrop to close. */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="messenger-overlay"
          data-testid="messenger-overlay"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9000,
            background: 'rgba(15, 23, 42, 0.32)',
          }}
        >
        <div
          className="messenger-panel"
          data-testid="messenger-panel"
          onClick={(e) => e.stopPropagation()}
          // Slice MX1 — defensive inline styles must match the
          // updated CSS contract: the panel sits ABOVE the FAB pill
          // (bottom: 5.5rem ≈ 88px clears the 56px FAB + a 32px
          // breathing gap) and 1.5rem off the right edge so the
          // shadow doesn't get clipped.
          //
          // Slice MX3 — once the drag hook has hydrated (mounted),
          // switch from the bottom-right anchor to absolute
          // left/top so the panel can be moved. Sized inline so
          // the hook clamps against the right dimensions.
          style={drag.mounted ? {
            position: 'fixed',
            left: drag.position.x,
            top: drag.position.y,
            width: MESSENGER_PANEL_WIDTH,
            height: MESSENGER_PANEL_HEIGHT,
            zIndex: 9001,
            background: '#FFFFFF',
          } : {
            position: 'fixed',
            bottom: '5.5rem',
            right: '1.5rem',
            zIndex: 9001,
            background: '#FFFFFF',
          }}>
          {/* Header — drag handle. Anything with
              `data-no-drag` (close, "Open in messages", back
              button, search input, etc.) swallows the drag. */}
          <div
            className="messenger-panel__header"
            data-testid="messenger-panel-drag-handle"
            style={{ touchAction: 'none', cursor: drag.mounted ? 'move' : undefined }}
            onPointerDown={drag.handlers.onPointerDown}
            onPointerMove={drag.handlers.onPointerMove}
            onPointerUp={drag.handlers.onPointerUp}
            onPointerCancel={drag.handlers.onPointerCancel}
          >
            {view === 'chat' && activeConv ? (
              <>
                <button data-no-drag className="messenger-panel__back" onClick={() => { setView('list'); setActiveConv(null); setMessages([]); }}>
                  &#8592;
                </button>
                <div className="messenger-panel__conv-titlewrap" data-no-drag>
                  <span className="messenger-panel__conv-title" title={getMemberNames(activeConv)}>
                    {getConvName(activeConv)}
                  </span>
                  <span className="messenger-panel__members-tip" role="tooltip">
                    <strong>{activeConv.type === 'group' ? 'Members' : 'Conversation'}</strong>
                    <span>{getMemberNames(activeConv)}</span>
                  </span>
                </div>
              </>
            ) : view === 'new' ? (
              <>
                <button data-no-drag className="messenger-panel__back" onClick={() => { setView('list'); setSelectedContacts([]); setContactSearch(''); }}>
                  &#8592;
                </button>
                <span className="messenger-panel__conv-title">New Conversation</span>
              </>
            ) : view === 'search' ? (
              <>
                <button data-no-drag className="messenger-panel__back" onClick={() => { setView('list'); setConvSearch(''); setSearchResults([]); }}>
                  &#8592;
                </button>
                <span className="messenger-panel__conv-title">Search Messages</span>
              </>
            ) : (
              <span className="messenger-panel__title">Messages</span>
            )}
            {/* Slice MX1 — "Open in /admin/messages →" route to the
                full-page messenger per the user's spec ("There also
                needs to be a button that takes us to the main
                messaging page"). The button closes the popup before
                navigating so the dedicated page isn't fighting an
                already-open modal. */}
            <Link
              href={view === 'chat' && activeConv ? `/admin/messages?conversation=${encodeURIComponent(activeConv.id)}` : '/admin/messages'}
              className="messenger-panel__open-full"
              data-testid="messenger-open-full"
              onClick={() => { setIsOpen(false); }}
              title="Open in the full messages page"
            >
              Open in messages →
            </Link>
            <button data-no-drag className="messenger-panel__close" onClick={() => { setIsOpen(false); setView('list'); setActiveConv(null); }}>&#10005;</button>
          </div>

          {/* Single-pane: the conversation list fills the whole modal in `list`
              view; opening a chat (or new/search) swaps the entire body to that
              view with a back-arrow in the header. The list + chat are never
              shown side-by-side. */}
          <div className="messenger-panel__body" data-testid="messenger-panel-body">
          {view === 'list' && (
          <aside className="messenger-panel__sidebar" data-testid="messenger-panel-sidebar">
              <div className="messenger-panel__actions">
                <input
                  className="messenger-panel__search"
                  placeholder="Search conversations..."
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                />
                <button className="messenger-panel__action-btn" onClick={() => { setView('search'); fetchContacts(); }} title="Search messages">
                  🔍
                </button>
                <button className="messenger-panel__action-btn" onClick={() => { setView('new'); fetchContacts(); }} title="New conversation">
                  ✏️
                </button>
              </div>

              <div className="messenger-panel__list">
                {filteredConvs.length === 0 ? (
                  <div className="messenger-panel__empty">
                    <span>💬</span>
                    <p>{convSearch ? 'No matching conversations' : 'No conversations yet'}</p>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setView('new'); fetchContacts(); }}>
                      Start a Chat
                    </button>
                  </div>
                ) : (
                  filteredConvs.map(c => {
                    const unread = unreadCounts[c.id] || 0;
                    return (
                      <button
                        key={c.id}
                        className={`messenger-panel__conv ${unread > 0 ? 'messenger-panel__conv--unread' : ''}`}
                        onClick={() => openConversation(c)}
                      >
                        <div className="messenger-panel__conv-avatar">
                          {c.type === 'group' ? '👥' : '💬'}
                        </div>
                        <div className="messenger-panel__conv-info">
                          <div className="messenger-panel__conv-name">{getConvName(c)}</div>
                          <div className="messenger-panel__conv-preview">
                            {c.last_message_preview?.slice(0, 50) || 'No messages yet'}
                          </div>
                        </div>
                        <div className="messenger-panel__conv-meta">
                          {c.last_message_at && (
                            <span className="messenger-panel__conv-time">
                              {formatTime(c.last_message_at)}
                            </span>
                          )}
                          {unread > 0 && <span className="messenger-panel__conv-badge">{unread}</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
          </aside>
          )}

          {/* Main pane — only rendered for chat / new / search (the list view is
              the full-width sidebar above). Fills the whole modal. */}
          {view !== 'list' && (
          <section className="messenger-panel__main" data-testid="messenger-panel-main">

          {/* === NEW CONVERSATION VIEW === */}
          {view === 'new' && (
            <div className="messenger-panel__new">
              {selectedContacts.length > 0 && (
                <div className="messenger-panel__selected">
                  {selectedContacts.map(c => (
                    <span key={c.email} className="messenger-panel__chip">
                      {c.name}
                      <button onClick={() => toggleContact(c)}>&#10005;</button>
                    </span>
                  ))}
                </div>
              )}

              {selectedContacts.length > 1 && (
                <input
                  className="messenger-panel__group-title"
                  placeholder="Group name (optional)"
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                />
              )}

              <input
                className="messenger-panel__contact-search"
                placeholder="Search people..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                autoFocus
              />

              <div className="messenger-panel__contact-list">
                {filteredContacts.map(c => {
                  const isSelected = selectedContacts.some(s => s.email === c.email);
                  return (
                    <button
                      key={c.email}
                      className={`messenger-panel__contact ${isSelected ? 'messenger-panel__contact--selected' : ''}`}
                      onClick={() => toggleContact(c)}
                    >
                      <div className="messenger-panel__contact-avatar">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="messenger-panel__contact-info">
                        <span className="messenger-panel__contact-name">{c.name}</span>
                        <span className="messenger-panel__contact-email">{c.email}</span>
                      </div>
                      {c.is_admin && <span className="messenger-panel__contact-badge">Admin</span>}
                      <span className="messenger-panel__contact-check">{isSelected ? '✓' : ''}</span>
                    </button>
                  );
                })}
                {filteredContacts.length === 0 && (
                  <p className="messenger-panel__no-results">No contacts found</p>
                )}
              </div>

              {selectedContacts.length > 0 && (
                <button className="messenger-panel__start-btn" onClick={startConversation}>
                  Start Chat with {selectedContacts.length} {selectedContacts.length === 1 ? 'person' : 'people'}
                </button>
              )}
            </div>
          )}

          {/* === SEARCH VIEW === */}
          {view === 'search' && (
            <div className="messenger-panel__search-view" data-testid="messenger-panel-search-view">
              <input
                className="messenger-panel__contact-search"
                placeholder="Search messages..."
                autoFocus
                value={msgSearchQuery}
                onChange={e => {
                  const q = e.target.value;
                  setMsgSearchQuery(q);
                  if (q.length >= 2) searchMessages(q);
                  else setSearchResults([]);
                }}
              />
              {/* Slice MX5 — results header so the user sees the
                  result count + the query they're searching for,
                  matching the dedicated /admin/messages page. */}
              {msgSearchQuery.trim().length >= 2 && !searching && searchResults.length > 0 && (
                <div
                  className="messenger-panel__search-summary"
                  data-testid="messenger-panel-search-summary"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', color: '#6B7280' }}
                >
                  {searchResults.length} match{searchResults.length === 1 ? '' : 'es'} for
                  {' '}
                  <strong>&ldquo;{msgSearchQuery.trim()}&rdquo;</strong>
                </div>
              )}
              <div className="messenger-panel__search-results">
                {searching && <p className="messenger-panel__loading">Searching...</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="messenger-panel__no-results">
                    {msgSearchQuery.trim().length >= 2
                      ? `No messages match "${msgSearchQuery.trim()}".`
                      : 'Type at least 2 characters to search across every conversation.'}
                  </p>
                )}
                {searchResults.map((r, i) => {
                  const conv = conversations.find(c => c.id === r.conversation_id);
                  const snippet = snippetAroundMatch(r.content, msgSearchQuery, 120);
                  const segments = highlightSegments(snippet, msgSearchQuery);
                  return (
                    <button
                      key={i}
                      className="messenger-panel__search-result"
                      data-testid="messenger-panel-search-result"
                      onClick={() => {
                        if (conv) openConversation(conv);
                      }}
                    >
                      <span className="messenger-panel__search-sender">
                        {displayName(r.sender_email)}
                        {conv && (
                          <span style={{ color: '#6B7280', fontWeight: 400 }}>
                            {' '}· {getConvName(conv)}
                          </span>
                        )}
                      </span>
                      <span className="messenger-panel__search-content">
                        {segments.map((seg, j) => (
                          seg.match
                            ? <mark key={j} style={{ background: '#FEF3C7', padding: '0 1px', borderRadius: '2px' }}>{seg.text}</mark>
                            : <span key={j}>{seg.text}</span>
                        ))}
                      </span>
                      <span className="messenger-panel__search-time">{formatTime(r.created_at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* === CHAT VIEW === */}
          {view === 'chat' && activeConv && (
            <>
              <div className="messenger-panel__messages">
                {loadingMessages ? (
                  <p className="messenger-panel__loading">Loading...</p>
                ) : messages.length === 0 ? (
                  <p className="messenger-panel__loading">No messages yet. Say hello!</p>
                ) : (
                  messages.map((m, i) => {
                    const isOwn = m.sender_email === userEmail;
                    const prevMsg = i > 0 ? messages[i - 1] : null;
                    const showSender = !isOwn && (!prevMsg || prevMsg.sender_email !== m.sender_email);
                    const showDate = !prevMsg || new Date(m.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="messenger-panel__date-divider">
                            <span>{new Date(m.created_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          </div>
                        )}
                        {/* messenger-smoothing-2026-06-18 — optimistic
                            rows get a faded opacity + a "Sending…" hint
                            so the surveyor sees their message instantly
                            AND knows it's still in flight. The bubble
                            replaces itself with the server-acked one
                            without a layout shift once fetchMessages
                            merges. */}
                        <div
                          className={`messenger-panel__msg ${isOwn ? 'messenger-panel__msg--own' : ''}`}
                          data-pending={m.id.startsWith('optimistic:') ? 'true' : undefined}
                          style={m.id.startsWith('optimistic:') ? { opacity: 0.6 } : undefined}
                        >
                          {showSender && (
                            <span className="messenger-panel__msg-sender">
                              {displayName(m.sender_email)}
                            </span>
                          )}
                          <div className={`messenger-panel__msg-bubble ${isOwn ? 'messenger-panel__msg-bubble--own' : ''}`}>
                            <MessageBody content={m.content} />
                          </div>
                          {/* messenger-smoothing-pass2-2026-06-18 —
                              keep the time label the same width whether
                              the row is optimistic or server-acked so
                              the bubble doesn't reflow when the confirm
                              arrives. The clock-face shows on both;
                              optimistic adds a small ⏳ chip after it. */}
                          <span className="messenger-panel__msg-time">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {m.id.startsWith('optimistic:') && (
                              <span aria-label="Sending" title="Sending…" style={{ marginLeft: 4 }}>⏳</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="messenger-panel__compose">
                <div style={{ position: 'relative' }}>
                  <button className="messenger-panel__tool" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">😊</button>
                  {showEmoji && (
                    <div className="messenger-panel__emoji-picker">
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => { richRef.current?.insertText(e); setComposeEmpty(false); setShowEmoji(false); }}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <RichMessageInput
                  ref={richRef}
                  className="messenger-panel__input"
                  placeholder="Type a message…"
                  onEnter={handleSend}
                  onChange={setComposeEmpty}
                />
                <button
                  className="messenger-panel__send"
                  onClick={handleSend}
                  disabled={sending || composeEmpty}
                >
                  &#10148;
                </button>
              </div>
            </>
          )}
          </section>
          )}{/* /.messenger-panel__main */}
          </div>{/* /.messenger-panel__body */}
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}
