// app/admin/messages/page.tsx — Full Messages Inbox with inline conversation view
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface Conversation {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'announcement';
  last_message_at: string;
  last_message_preview: string | null;
  is_archived: boolean;
  participants: { user_email: string; role: string }[];
}

interface Message {
  id: string;
  sender_email: string;
  content: string;
  message_type: string;
  created_at: string;
  is_edited: boolean;
  attachments: unknown[];
}

interface Contact {
  email: string;
  name: string;
  is_admin: boolean;
}

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

const QUICK_EMOJIS = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '❤️', '💯', '✅', '❌'];

export default function MessagesInboxPage() {
  const { data: session } = useSession();
  const { reportPageError } = usePageError('MessagesInboxPage');
  const userEmail = session?.user?.email || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');

  // Active conversation
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // New conversation & search
  const [showNewConv, setShowNewConv] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ content: string; sender_email: string; created_at: string; conversation_id: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const archived = filter === 'archived';
      const res = await fetch(`/api/admin/messages/conversations?archived=${archived}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load conversations' });
    }
    setLoading(false);
  }, [filter, reportPageError]);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages/read');
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data.unread_by_conversation || {});
        setTotalUnread(data.unread_count || 0);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load unread counts' });
    }
  }, [reportPageError]);

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

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/messages/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (session?.user) { loadConversations(); loadUnread(); fetchContacts(); }
  }, [session, loadConversations, loadUnread, fetchContacts]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadUnread();
      loadConversations();
      if (activeConv) fetchMessages(activeConv.id);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadUnread, loadConversations, activeConv, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setShowNewConv(false);
    fetchMessages(conv.id);
  }

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
        loadConversations();
      }
    } catch { /* silent */ }
    setSending(false);
  }

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
        conv.participants.push({ user_email: userEmail, role: 'owner' });
        setActiveConv(conv);
        setShowNewConv(false);
        setSelectedContacts([]);
        setGroupTitle('');
        setContactSearch('');
        fetchMessages(conv.id);
        loadConversations();
      }
    } catch { /* silent */ }
  }

  function toggleContact(c: Contact) {
    setSelectedContacts(prev =>
      prev.find(s => s.email === c.email)
        ? prev.filter(s => s.email !== c.email)
        : [...prev, c]
    );
  }

  function getConvName(c: Conversation): string {
    if (c.title) return c.title;
    if (c.type === 'direct') {
      const other = c.participants?.find(p => p.user_email !== userEmail);
      return other ? displayName(other.user_email) : 'Direct Message';
    }
    const others = c.participants?.filter(p => p.user_email !== userEmail) || [];
    return others.map(p => displayName(p.user_email)).join(', ') || 'Group';
  }

  async function searchMessages(q: string) {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/admin/messages/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch { /* silent */ }
  }

  if (!session?.user) return null;

  const filteredConversations = (() => {
    let list = filter === 'unread'
      ? conversations.filter(c => (unreadCounts[c.id] || 0) > 0)
      : conversations;
    if (convSearch) {
      list = list.filter(c => getConvName(c).toLowerCase().includes(convSearch.toLowerCase()));
    }
    return list;
  })();

  const filteredContacts = contactSearch
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.email.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts;

  return (
    <div className="msg-page">
      {/* Sidebar — conversation list */}
      <div className="msg-page__sidebar">
        <div className="msg-page__sidebar-header">
          <h2 className="msg-page__sidebar-title">Messages {totalUnread > 0 && <span className="msg-page__unread-badge">{totalUnread}</span>}</h2>
          <button className="msg-page__new-btn" onClick={() => { setShowNewConv(true); setActiveConv(null); }} title="New conversation">
            ✏️
          </button>
        </div>

        {/* Filters */}
        <div className="msg-page__filters">
          {(['all', 'unread', 'archived'] as const).map(f => (
            <button key={f} className={`msg-page__filter ${filter === f ? 'msg-page__filter--active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'unread' && totalUnread > 0 && `(${totalUnread})`}
            </button>
          ))}
        </div>

        {/* Search conversations */}
        <div className="msg-page__search-bar">
          <input
            className="msg-page__search-input"
            placeholder="Search conversations..."
            value={convSearch}
            onChange={e => setConvSearch(e.target.value)}
          />
        </div>

        {/* Conversation list */}
        <div className="msg-page__conv-list">
          {loading ? (
            <p className="msg-page__empty-text">Loading...</p>
          ) : filteredConversations.length === 0 ? (
            <div className="msg-page__empty">
              <span>💬</span>
              <p>{convSearch ? 'No matching conversations' : 'No conversations yet'}</p>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setShowNewConv(true)}>
                Start a Chat
              </button>
            </div>
          ) : (
            filteredConversations.map(c => {
              const unread = unreadCounts[c.id] || 0;
              const isActive = activeConv?.id === c.id;
              return (
                <button
                  key={c.id}
                  className={`msg-page__conv-item ${unread > 0 ? 'msg-page__conv-item--unread' : ''} ${isActive ? 'msg-page__conv-item--active' : ''}`}
                  onClick={() => openConversation(c)}
                >
                  <div className="msg-page__conv-avatar">
                    {c.type === 'group' ? '👥' : displayName(getConvName(c)).charAt(0)}
                  </div>
                  <div className="msg-page__conv-body">
                    <div className="msg-page__conv-name">{getConvName(c)}</div>
                    <div className="msg-page__conv-preview">
                      {c.last_message_preview?.slice(0, 60) || 'No messages yet'}
                    </div>
                  </div>
                  <div className="msg-page__conv-meta">
                    {c.last_message_at && <span className="msg-page__conv-time">{formatTime(c.last_message_at)}</span>}
                    {unread > 0 && <span className="msg-page__conv-badge">{unread}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="msg-page__main">
        {/* New conversation panel */}
        {showNewConv && (
          <div className="msg-page__new-conv">
            <div className="msg-page__new-header">
              <h3>New Conversation</h3>
              <button className="msg-page__new-close" onClick={() => { setShowNewConv(false); setSelectedContacts([]); setContactSearch(''); }}>&#10005;</button>
            </div>

            {selectedContacts.length > 0 && (
              <div className="msg-page__selected-chips">
                {selectedContacts.map(c => (
                  <span key={c.email} className="msg-page__chip">
                    {c.name} <button onClick={() => toggleContact(c)}>&#10005;</button>
                  </span>
                ))}
              </div>
            )}

            {selectedContacts.length > 1 && (
              <input className="msg-page__group-input" placeholder="Group name (optional)" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} />
            )}

            <input className="msg-page__contact-search" placeholder="Search people by name or email..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} autoFocus />

            <div className="msg-page__contact-grid">
              {filteredContacts.map(c => {
                const isSelected = selectedContacts.some(s => s.email === c.email);
                return (
                  <button key={c.email} className={`msg-page__contact-card ${isSelected ? 'msg-page__contact-card--selected' : ''}`} onClick={() => toggleContact(c)}>
                    <div className="msg-page__contact-avatar">{c.name.charAt(0).toUpperCase()}</div>
                    <div className="msg-page__contact-name">{c.name}</div>
                    <div className="msg-page__contact-email">{c.email}</div>
                    {c.is_admin && <span className="msg-page__admin-tag">Admin</span>}
                    {isSelected && <span className="msg-page__check">✓</span>}
                  </button>
                );
              })}
            </div>

            {selectedContacts.length > 0 && (
              <button className="msg-page__start-btn" onClick={startConversation}>
                Start Chat with {selectedContacts.length} {selectedContacts.length === 1 ? 'person' : 'people'}
              </button>
            )}
          </div>
        )}

        {/* Active conversation */}
        {activeConv && !showNewConv && (
          <div className="msg-page__thread">
            {/* Thread header */}
            <div className="msg-page__thread-header">
              <div className="msg-page__thread-info">
                <h3 className="msg-page__thread-name">{getConvName(activeConv)}</h3>
                <span className="msg-page__thread-members">
                  {activeConv.participants?.length || 0} member{(activeConv.participants?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="msg-page__thread-actions">
                <input
                  className="msg-page__msg-search"
                  placeholder="Search in conversation..."
                  value={msgSearch}
                  onChange={e => { setMsgSearch(e.target.value); if (e.target.value.length >= 2) searchMessages(e.target.value); else setSearchResults([]); }}
                />
              </div>
            </div>

            {/* Search results overlay */}
            {msgSearch && searchResults.length > 0 && (
              <div className="msg-page__search-overlay">
                {searchResults.filter(r => r.conversation_id === activeConv.id).map((r, i) => (
                  <div key={i} className="msg-page__search-hit">
                    <strong>{displayName(r.sender_email)}</strong>: {r.content.slice(0, 100)}
                    <span className="msg-page__search-hit-time">{formatTime(r.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="msg-page__messages">
              {loadingMessages ? (
                <p className="msg-page__empty-text">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="msg-page__empty-text">No messages yet. Say hello!</p>
              ) : (
                messages.map((m, i) => {
                  const isOwn = m.sender_email === userEmail;
                  const prevMsg = i > 0 ? messages[i - 1] : null;
                  const showSender = !isOwn && (!prevMsg || prevMsg.sender_email !== m.sender_email);
                  const showDate = !prevMsg || new Date(m.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                  return (
                    <div key={m.id}>
                      {showDate && (
                        <div className="msg-page__date-divider">
                          <span>{new Date(m.created_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                        </div>
                      )}
                      <div className={`msg-page__msg ${isOwn ? 'msg-page__msg--own' : ''}`}>
                        {showSender && <span className="msg-page__msg-sender">{displayName(m.sender_email)}</span>}
                        <div className={`msg-page__msg-bubble ${isOwn ? 'msg-page__msg-bubble--own' : ''}`}>
                          {m.content}
                          {m.is_edited && <span className="msg-page__msg-edited">(edited)</span>}
                        </div>
                        <span className="msg-page__msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="msg-page__compose">
              <div style={{ position: 'relative' }}>
                <button className="msg-page__tool-btn" onClick={() => setShowEmoji(!showEmoji)}>😊</button>
                {showEmoji && (
                  <div className="msg-page__emoji-grid">
                    {QUICK_EMOJIS.map(e => (
                      <button key={e} onClick={() => { setNewMessage(p => p + e); setShowEmoji(false); inputRef.current?.focus(); }}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                className="msg-page__compose-input"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..."
              />
              <button className="msg-page__send-btn" onClick={handleSend} disabled={sending || !newMessage.trim()}>
                Send
              </button>
            </div>
          </div>
        )}

        {/* Empty state when no conversation selected */}
        {!activeConv && !showNewConv && (
          <div className="msg-page__empty-state">
            <span className="msg-page__empty-icon">💬</span>
            <h3>Select a conversation</h3>
            <p>Choose a conversation from the sidebar or start a new one.</p>
            <button className="admin-btn admin-btn--primary" onClick={() => setShowNewConv(true)}>
              Start New Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
