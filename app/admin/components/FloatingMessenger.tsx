// app/admin/components/FloatingMessenger.tsx — Floating messenger widget
// Full in-panel chat: browse conversations, search users, create new DM/group,
// send/receive messages with timestamps and sender names.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
// employee-pond Slice E9b — cross-surface recipient continuity.
import {
  readActiveRecipient,
  saveActiveRecipient,
} from '@/lib/employee-pond/messenger-recipient';

interface Conversation {
  id: string;
  title: string | null;
  type: string;
  last_message_at: string;
  last_message_preview: string | null;
  participants: { user_email: string; role: string }[];
}

interface Message {
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

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<PanelView>('list');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Search / new conversation
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ content: string; sender_email: string; created_at: string; conversation_id: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/admin/messages/conversations?archived=false');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch { /* silent */ }
  }, [userEmail]);

  // Fetch unread counts
  const fetchUnread = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/admin/messages/read');
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data.unread_by_conversation || {});
        setTotalUnread(data.unread_count || 0);
      }
    } catch { /* silent */ }
  }, [userEmail]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/messages/send?conversation_id=${convId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        fetch('/api/admin/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId }),
        });
      }
    } catch { /* silent */ }
    setLoadingMessages(false);
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
  useEffect(() => {
    fetchConversations();
    fetchUnread();
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnread();
      if (activeConv) fetchMessages(activeConv.id);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchUnread, activeConv, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    if (!isOpen) return;
    if (view === 'chat' && activeConv) return; // already on a chat
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
    setActiveConv(conv);
    setView('chat');
    fetchMessages(conv.id);
  }

  // Send message
  async function handleSend() {
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConv.id, content: newMessage.trim(), message_type: 'text' }),
      });
      if (res.ok) {
        setNewMessage('');
        setShowEmoji(false);
        fetchMessages(activeConv.id);
        fetchConversations();
      }
    } catch { /* silent */ }
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
            💬
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
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            zIndex: 9001,
            background: '#FFFFFF',
          }}>
          {/* Header */}
          <div className="messenger-panel__header">
            {view === 'chat' && activeConv ? (
              <>
                <button className="messenger-panel__back" onClick={() => { setView('list'); setActiveConv(null); setMessages([]); }}>
                  &#8592;
                </button>
                <span className="messenger-panel__conv-title">{getConvName(activeConv)}</span>
              </>
            ) : view === 'new' ? (
              <>
                <button className="messenger-panel__back" onClick={() => { setView('list'); setSelectedContacts([]); setContactSearch(''); }}>
                  &#8592;
                </button>
                <span className="messenger-panel__conv-title">New Conversation</span>
              </>
            ) : view === 'search' ? (
              <>
                <button className="messenger-panel__back" onClick={() => { setView('list'); setConvSearch(''); setSearchResults([]); }}>
                  &#8592;
                </button>
                <span className="messenger-panel__conv-title">Search Messages</span>
              </>
            ) : (
              <span className="messenger-panel__title">Messages</span>
            )}
            <button className="messenger-panel__close" onClick={() => { setIsOpen(false); setView('list'); setActiveConv(null); }}>&#10005;</button>
          </div>

          {/* === LIST VIEW === */}
          {view === 'list' && (
            <>
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
            </>
          )}

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
            <div className="messenger-panel__search-view">
              <input
                className="messenger-panel__contact-search"
                placeholder="Search messages..."
                autoFocus
                onChange={e => {
                  const q = e.target.value;
                  if (q.length >= 2) searchMessages(q);
                  else setSearchResults([]);
                }}
              />
              <div className="messenger-panel__search-results">
                {searching && <p className="messenger-panel__loading">Searching...</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="messenger-panel__no-results">Type to search messages across all conversations</p>
                )}
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    className="messenger-panel__search-result"
                    onClick={() => {
                      const conv = conversations.find(c => c.id === r.conversation_id);
                      if (conv) openConversation(conv);
                    }}
                  >
                    <span className="messenger-panel__search-sender">{displayName(r.sender_email)}</span>
                    <span className="messenger-panel__search-content">{r.content.slice(0, 80)}</span>
                    <span className="messenger-panel__search-time">{formatTime(r.created_at)}</span>
                  </button>
                ))}
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
                        <div className={`messenger-panel__msg ${isOwn ? 'messenger-panel__msg--own' : ''}`}>
                          {showSender && (
                            <span className="messenger-panel__msg-sender">
                              {displayName(m.sender_email)}
                            </span>
                          )}
                          <div className={`messenger-panel__msg-bubble ${isOwn ? 'messenger-panel__msg-bubble--own' : ''}`}>
                            {m.content}
                          </div>
                          <span className="messenger-panel__msg-time">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                        <button key={e} onClick={() => { setNewMessage(p => p + e); setShowEmoji(false); inputRef.current?.focus(); }}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  className="messenger-panel__input"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message..."
                />
                <button
                  className="messenger-panel__send"
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                >
                  &#10148;
                </button>
              </div>
            </>
          )}
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}
