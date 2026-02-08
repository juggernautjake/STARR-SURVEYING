// app/admin/components/FloatingMessenger.tsx — Floating messenger widget (like FB Messenger)
// Sits near the Fieldbook button, shows unread count badge, opens a mini chat panel
// with conversation tabs (all, admin-only, job threads).
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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

const QUICK_EMOJIS = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '❤️', '💯', '✅', '❌'];

export default function FloatingMessenger() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'admin' | 'jobs'>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userEmail = session?.user?.email;

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
      const res = await fetch(`/api/admin/messages/send?conversation_id=${convId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        // Mark as read
        fetch('/api/admin/messages/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId }),
        });
      }
    } catch { /* silent */ }
    setLoadingMessages(false);
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchConversations();
    fetchUnread();
    const interval = setInterval(() => {
      fetchConversations();
      fetchUnread();
      if (activeConv) fetchMessages(activeConv);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchUnread, activeConv, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Open a conversation
  function openConversation(convId: string) {
    setActiveConv(convId);
    fetchMessages(convId);
  }

  // Send message
  async function handleSend() {
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConv,
          content: newMessage.trim(),
          message_type: 'text',
        }),
      });
      if (res.ok) {
        setNewMessage('');
        setShowEmoji(false);
        fetchMessages(activeConv);
      }
    } catch { /* silent */ }
    setSending(false);
  }

  // Filter conversations by tab
  const filteredConvs = conversations.filter(c => {
    if (activeTab === 'admin') return c.type === 'admin_discussion';
    if (activeTab === 'jobs') return c.type === 'job_thread';
    return true;
  });

  // Get display name for a conversation
  function getConvName(c: Conversation): string {
    if (c.title) return c.title;
    if (c.type === 'direct') {
      const other = c.participants?.find(p => p.user_email !== userEmail);
      return other?.user_email?.split('@')[0] || 'Direct Message';
    }
    return 'Conversation';
  }

  // Don't show on login page
  if (pathname === '/admin/login' || !userEmail) return null;
  // Don't show on the full messages page (user is already there)
  if (pathname.startsWith('/admin/messages')) return null;

  return (
    <>
      {/* FAB — Message button */}
      {!isOpen && (
        <div className="messenger-fab-wrap">
          <span className="messenger-fab-tooltip">Messages</span>
          <button
            className="messenger-fab"
            onClick={() => { setIsOpen(true); fetchConversations(); fetchUnread(); }}
            aria-label="Open messages"
          >
            💬
            {totalUnread > 0 && (
              <span className="messenger-fab__badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
            )}
          </button>
        </div>
      )}

      {/* Messenger panel */}
      {isOpen && (
        <div className="messenger-panel" ref={panelRef}>
          {/* Header */}
          <div className="messenger-panel__header">
            {activeConv ? (
              <>
                <button className="messenger-panel__back" onClick={() => { setActiveConv(null); setMessages([]); }}>
                  ←
                </button>
                <span className="messenger-panel__conv-title">
                  {getConvName(conversations.find(c => c.id === activeConv)!)}
                </span>
                <Link
                  href={`/admin/messages/${activeConv}`}
                  className="messenger-panel__expand"
                  onClick={() => setIsOpen(false)}
                  title="Open full view"
                >
                  ↗
                </Link>
              </>
            ) : (
              <>
                <span className="messenger-panel__title">Messages</span>
                <Link
                  href="/admin/messages"
                  className="messenger-panel__expand"
                  onClick={() => setIsOpen(false)}
                  title="Open full inbox"
                >
                  ↗
                </Link>
              </>
            )}
            <button className="messenger-panel__close" onClick={() => { setIsOpen(false); setActiveConv(null); }}>✕</button>
          </div>

          {/* Tabs (only in list view) */}
          {!activeConv && (
            <div className="messenger-panel__tabs">
              <button className={`messenger-panel__tab ${activeTab === 'all' ? 'messenger-panel__tab--active' : ''}`} onClick={() => setActiveTab('all')}>
                All
              </button>
              <button className={`messenger-panel__tab ${activeTab === 'admin' ? 'messenger-panel__tab--active' : ''}`} onClick={() => setActiveTab('admin')}>
                Admin
              </button>
              <button className={`messenger-panel__tab ${activeTab === 'jobs' ? 'messenger-panel__tab--active' : ''}`} onClick={() => setActiveTab('jobs')}>
                Jobs
              </button>
            </div>
          )}

          {/* Conversation list */}
          {!activeConv && (
            <div className="messenger-panel__list">
              {filteredConvs.length === 0 ? (
                <div className="messenger-panel__empty">
                  <span>💬</span>
                  <p>No conversations yet</p>
                  <Link href="/admin/messages/new" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setIsOpen(false)}>
                    Start a Chat
                  </Link>
                </div>
              ) : (
                filteredConvs.map(c => {
                  const unread = unreadCounts[c.id] || 0;
                  return (
                    <button
                      key={c.id}
                      className={`messenger-panel__conv ${unread > 0 ? 'messenger-panel__conv--unread' : ''}`}
                      onClick={() => openConversation(c.id)}
                    >
                      <div className="messenger-panel__conv-avatar">
                        {c.type === 'group' || c.type === 'admin_discussion' ? '👥' : c.type === 'job_thread' ? '🔧' : '💬'}
                      </div>
                      <div className="messenger-panel__conv-info">
                        <div className="messenger-panel__conv-name">{getConvName(c)}</div>
                        <div className="messenger-panel__conv-preview">
                          {c.last_message_preview?.slice(0, 50) || 'No messages yet'}
                        </div>
                      </div>
                      {unread > 0 && (
                        <span className="messenger-panel__conv-badge">{unread}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Active conversation messages */}
          {activeConv && (
            <>
              <div className="messenger-panel__messages">
                {loadingMessages ? (
                  <p className="messenger-panel__loading">Loading...</p>
                ) : messages.length === 0 ? (
                  <p className="messenger-panel__loading">No messages yet. Say hello!</p>
                ) : (
                  messages.map(m => {
                    const isOwn = m.sender_email === userEmail;
                    return (
                      <div key={m.id} className={`messenger-panel__msg ${isOwn ? 'messenger-panel__msg--own' : ''}`}>
                        {!isOwn && (
                          <span className="messenger-panel__msg-sender">
                            {m.sender_email.split('@')[0]}
                          </span>
                        )}
                        <div className={`messenger-panel__msg-bubble ${isOwn ? 'messenger-panel__msg-bubble--own' : ''}`}>
                          {m.content}
                        </div>
                        <span className="messenger-panel__msg-time">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose area */}
              <div className="messenger-panel__compose">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                />
                <button className="messenger-panel__tool" onClick={() => fileInputRef.current?.click()} title="Attach file">📎</button>
                <div style={{ position: 'relative' }}>
                  <button className="messenger-panel__tool" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">😊</button>
                  {showEmoji && (
                    <div className="messenger-panel__emoji-picker">
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => { setNewMessage(p => p + e); setShowEmoji(false); }}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <input
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
                  ➤
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
