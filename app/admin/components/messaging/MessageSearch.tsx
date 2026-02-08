// app/admin/components/messaging/MessageSearch.tsx
'use client';
import { useState } from 'react';

interface SearchResult {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  created_at: string;
}

interface MessageSearchProps {
  conversationId?: string;
  onSelectResult?: (result: SearchResult) => void;
  onClose: () => void;
}

export default function MessageSearch({ conversationId, onSelectResult, onClose }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (conversationId) params.set('conversation_id', conversationId);
      const res = await fetch(`/api/admin/messages/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  function getDisplayName(email: string): string {
    return email.split('@')[0]
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return (
    <div className="msg-search">
      <div className="msg-search__header">
        <h4 className="msg-search__title">Search Messages</h4>
        <button className="msg-search__close" onClick={onClose}>✕</button>
      </div>
      <div className="msg-search__input-row">
        <input
          className="msg-search__input"
          placeholder="Search messages..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          autoFocus
        />
        <button className="msg-search__btn" onClick={handleSearch} disabled={loading}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {loading ? '...' : 'Search'}
        </button>
      </div>

      <div className="msg-search__results">
        {loading && <div className="msg-search__loading">Searching...</div>}
        {!loading && searched && results.length === 0 && (
          <div className="msg-search__empty">No messages found for &ldquo;{query}&rdquo;</div>
        )}
        {results.map(result => (
          <button
            key={result.id}
            className="msg-search__result"
            onClick={() => onSelectResult?.(result)}
          >
            <div className="msg-search__result-header">
              <span className="msg-search__result-sender">{getDisplayName(result.sender_email)}</span>
              <span className="msg-search__result-time">{new Date(result.created_at).toLocaleDateString()}</span>
            </div>
            <div className="msg-search__result-content">{result.content.substring(0, 120)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
