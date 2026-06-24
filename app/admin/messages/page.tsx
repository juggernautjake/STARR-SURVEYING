// app/admin/messages/page.tsx — Full Messages Inbox with inline conversation view
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SquarePen, MessageSquare, Users, Check, Smile, Paperclip, FileText, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';
// employee-pond Slice E9b — cross-surface recipient continuity.
import {
  readActiveRecipient,
  saveActiveRecipient,
} from '@/lib/employee-pond/messenger-recipient';

interface Conversation {
  id: string;
  title: string | null;
  type: 'direct' | 'group' | 'announcement';
  last_message_at: string;
  last_message_preview: string | null;
  is_archived: boolean;
  participants: { user_email: string; role: string }[];
}

interface Attachment {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string | null;
}

interface ReadReceipt {
  message_id: string;
  user_email: string;
  read_at: string;
}

interface Message {
  id: string;
  sender_email: string;
  content: string;
  message_type: string;
  created_at: string;
  is_edited: boolean;
  attachments: Attachment[];
  read_receipts?: ReadReceipt[];
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

  // M3 — attachments staged for the next send + upload progress.
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // M4 — auto-grow the compose box up to a cap so multi-line messages are
  // comfortable on phones without an external lib.
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

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

  // M2 — Near-real-time refresh without a full Supabase Realtime stack.
  // The active thread polls fast (4s) so messages feel live; the unread
  // count + conversation list poll slower (15s). Polling pauses while the
  // tab is hidden (no battery/network burn in a pocket) and fires an
  // immediate catch-up refresh the moment the tab becomes visible again.
  // Rationale for not using Supabase Realtime here: no browser realtime
  // client / RLS / publication exists in this app yet, and a websocket
  // path is untestable in the ux-harness — this visibility-aware poll
  // delivers the responsive feel the mobile build needs today. True
  // Realtime is tracked as a follow-up below.
  useEffect(() => {
    let fastTick = 0;
    const refreshAll = () => {
      loadUnread();
      loadConversations();
      if (activeConv) fetchMessages(activeConv.id);
    };
    const interval = setInterval(() => {
      if (document.hidden) return;
      // Active thread refreshes every fast tick (4s); the heavier
      // unread+list refresh runs once every ~16s (every 4th tick).
      if (activeConv) fetchMessages(activeConv.id);
      fastTick = (fastTick + 1) % 4;
      if (fastTick === 0) { loadUnread(); loadConversations(); }
    }, 4000);
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadUnread, loadConversations, activeConv, fetchMessages]);

  // employee-pond Slice E9b — write the active recipient through to
  // localStorage every time the user opens a direct conversation so
  // the FloatingMessenger widget + future surfaces can pick up the
  // same recipient. Group convs clear the saved value.
  const userEmailLower = session?.user?.email?.toLowerCase();
  useEffect(() => {
    if (!activeConv || activeConv.type !== 'direct') return;
    if (!userEmailLower) return;
    const other = (activeConv.participants || [])
      .map((p) => p.user_email)
      .find((email) => email && email.toLowerCase() !== userEmailLower);
    if (other) saveActiveRecipient(other);
  }, [activeConv, userEmailLower]);

  // employee-pond Slice E9b — hydrate continuity on mount. If the
  // user just jumped here from the FloatingMessenger widget (or
  // the pond's DM button), pre-select the conversation with the
  // saved recipient so they don't lose context.
  const continuityHydratedRef = useRef<boolean>(false);
  useEffect(() => {
    if (continuityHydratedRef.current) return;
    if (conversations.length === 0) return;
    const saved = readActiveRecipient();
    if (!saved) return;
    const target = saved.toLowerCase();
    const existing = conversations.find((c) => {
      if (c.type !== 'direct') return false;
      const others = (c.participants || []).map((p) => p.user_email.toLowerCase());
      return others.includes(target);
    });
    if (existing) {
      setActiveConv(existing);
      fetchMessages(existing.id);
    }
    continuityHydratedRef.current = true;
  }, [conversations, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setShowNewConv(false);
    fetchMessages(conv.id);
  }

  // M3 — read a File as a base64 data URL for the attachments upload route.
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function handleAttachFiles(files: FileList | null) {
    if (!files || files.length === 0 || !activeConv) return;
    setAttachError(null);
    setUploadingAttachment(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch('/api/admin/messages/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: activeConv.id, dataUrl, name: file.name }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.attachment) setPendingAttachments(prev => [...prev, data.attachment]);
        } else {
          const data = await res.json().catch(() => ({}));
          setAttachError(data.error || 'Upload failed');
        }
      }
    } catch {
      setAttachError('Upload failed');
    }
    setUploadingAttachment(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    const text = newMessage.trim();
    if ((!text && pendingAttachments.length === 0) || !activeConv) return;
    setSending(true);
    try {
      // Attachment-only messages still need non-empty content (API requires it),
      // so fall back to a paperclip + the first file name as the body.
      const content = text || `📎 ${pendingAttachments.map(a => a.name).join(', ')}`;
      const hasImage = pendingAttachments.some(a => a.type.startsWith('image/'));
      const message_type = pendingAttachments.length > 0 ? (hasImage ? 'image' : 'file') : 'text';
      const res = await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConv.id, content, message_type, attachments: pendingAttachments }),
      });
      if (res.ok) {
        setNewMessage('');
        setShowEmoji(false);
        setPendingAttachments([]);
        if (inputRef.current) inputRef.current.style.height = 'auto';
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
    <div className={`msg-page${activeConv || showNewConv ? ' msg-page--detail' : ''}`}>
      {/* Sidebar — conversation list */}
      <div className="msg-page__sidebar">
        <div className="msg-page__sidebar-header">
          <h2 className="msg-page__sidebar-title">Messages {totalUnread > 0 && <span className="msg-page__unread-badge">{totalUnread}</span>}</h2>
          <button className="msg-page__new-btn" onClick={() => { setShowNewConv(true); setActiveConv(null); }} title="New conversation">
            <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
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
              <span><MessageSquare size={16} strokeWidth={1.75} /></span>
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
                    {c.type === 'group' ? <Users size={16} strokeWidth={1.75} /> : displayName(getConvName(c)).charAt(0)}
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
                    {isSelected && <span className="msg-page__check"><Check size={13} strokeWidth={3} /></span>}
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
              <button
                type="button"
                className="msg-page__back"
                onClick={() => setActiveConv(null)}
                aria-label="Back to conversations"
              >
                ‹
              </button>
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
                  // M4 — "Seen" appears only under the last own message, and only
                  // once someone else has read it (iMessage-style, uncluttered).
                  const isLastOwn = isOwn && !messages.slice(i + 1).some(n => n.sender_email === userEmail);
                  const seenByOthers = (m.read_receipts || []).some(r => r.user_email !== userEmail);

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
                          {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                            <div className="msg-page__attachments">
                              {m.attachments.map((a, ai) => (
                                a.type?.startsWith('image/') && a.url ? (
                                  <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer" className="msg-page__attach-img-link">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt={a.name} className="msg-page__attach-img" />
                                  </a>
                                ) : (
                                  <a key={ai} href={a.url || '#'} target="_blank" rel="noopener noreferrer" className="msg-page__attach-file">
                                    <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                                    <span className="msg-page__attach-name">{a.name}</span>
                                    <span className="msg-page__attach-size">{(a.size / 1024).toFixed(0)} KB</span>
                                  </a>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="msg-page__msg-time">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isLastOwn && seenByOthers && <span className="msg-page__msg-seen"><Check size={11} strokeWidth={2.5} aria-hidden="true" />Seen</span>}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Staged attachments preview */}
            {(pendingAttachments.length > 0 || uploadingAttachment || attachError) && (
              <div className="msg-page__attach-tray">
                {pendingAttachments.map((a, i) => (
                  <span key={i} className="msg-page__attach-chip">
                    {a.type.startsWith('image/')
                      ? <Paperclip size={13} strokeWidth={1.75} aria-hidden="true" />
                      : <FileText size={13} strokeWidth={1.75} aria-hidden="true" />}
                    <span className="msg-page__attach-chip-name">{a.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X size={12} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {uploadingAttachment && <span className="msg-page__attach-uploading">Uploading…</span>}
                {attachError && <span className="msg-page__attach-error">{attachError}</span>}
              </div>
            )}

            {/* Compose */}
            <div className="msg-page__compose">
              <div style={{ position: 'relative' }}>
                <button className="msg-page__tool-btn" onClick={() => setShowEmoji(!showEmoji)} title="Emoji"><Smile size={16} strokeWidth={1.75} /></button>
                {showEmoji && (
                  <div className="msg-page__emoji-grid">
                    {QUICK_EMOJIS.map(e => (
                      <button key={e} onClick={() => { setNewMessage(p => p + e); setShowEmoji(false); inputRef.current?.focus(); autoGrow(inputRef.current); }}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                style={{ display: 'none' }}
                onChange={e => handleAttachFiles(e.target.files)}
              />
              <button
                className="msg-page__tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachment}
                title="Attach a file or photo"
                aria-label="Attach a file or photo"
              >
                <Paperclip size={16} strokeWidth={1.75} />
              </button>
              <textarea
                ref={inputRef}
                className="msg-page__compose-input"
                rows={1}
                value={newMessage}
                onChange={e => { setNewMessage(e.target.value); autoGrow(e.target); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..."
              />
              <button className="msg-page__send-btn" onClick={handleSend} disabled={sending || (!newMessage.trim() && pendingAttachments.length === 0)}>
                Send
              </button>
            </div>
          </div>
        )}

        {/* Empty state when no conversation selected */}
        {!activeConv && !showNewConv && (
          <div className="msg-page__empty-state">
            <span className="msg-page__empty-icon"><MessageSquare size={30} strokeWidth={1.5} /></span>
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
