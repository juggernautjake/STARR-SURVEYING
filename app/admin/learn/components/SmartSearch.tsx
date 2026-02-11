// app/admin/learn/components/SmartSearch.tsx — Universal smart search for admin learn pages
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  type: string;
  url?: string;
  builderUrl?: string;
  title?: string;
  term?: string;
  definition?: string;
  question_text?: string;
  description?: string;
  excerpt?: string;
  notes?: string;
  assigned_to?: string;
  status?: string;
  difficulty?: string;
  category?: string;
  exam_category?: string;
  question_type?: string;
  keywords?: string[];
  tags?: string[];
}

interface SmartSearchProps {
  /** Optional callback when a result is selected (instead of navigating) */
  onSelect?: (result: SearchResult) => void;
  /** Placeholder text override */
  placeholder?: string;
  /** Include draft content in results */
  includeAll?: boolean;
  /** Compact mode (smaller input) */
  compact?: boolean;
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  module:     { icon: '📚', label: 'Module',     color: '#1D3095' },
  lesson:     { icon: '📖', label: 'Lesson',     color: '#059669' },
  topic:      { icon: '📝', label: 'Topic',      color: '#7C3AED' },
  article:    { icon: '📰', label: 'Article',    color: '#DC2626' },
  flashcard:  { icon: '🃏', label: 'Flashcard',  color: '#D97706' },
  question:   { icon: '❓', label: 'Question',   color: '#0891B2' },
  assignment: { icon: '📋', label: 'Assignment', color: '#6366F1' },
};

export default function SmartSearch({ onSelect, placeholder, includeAll = true, compact = false }: SmartSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Flatten results for keyboard nav
  const flatResults = Object.entries(results).flatMap(([, items]) => items);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({}); setTotalCount(0); setIsOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/learn/search?q=${encodeURIComponent(q)}&include_all=${includeAll}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || {});
        setTotalCount(data.totalCount || 0);
        setIsOpen(true);
      }
    } catch (err) { console.error('SmartSearch: search failed', err); }
    setLoading(false);
  }, [includeAll]);

  function handleChange(value: string) {
    setQuery(value);
    setSelectedIdx(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  }

  function handleSelect(result: SearchResult) {
    setIsOpen(false);
    setQuery('');
    setResults({});
    if (onSelect) {
      onSelect(result);
    } else if (result.url) {
      router.push(result.url);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIdx >= 0 && flatResults[selectedIdx]) {
      e.preventDefault();
      handleSelect(flatResults[selectedIdx]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ctrl+K / Cmd+K to focus search
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  function getResultTitle(r: SearchResult): string {
    if (r.title) return r.title;
    if (r.term) return r.term;
    if (r.question_text) return r.question_text.slice(0, 100);
    if (r.assigned_to) return `Assignment for ${r.assigned_to}`;
    return r.id.slice(0, 12);
  }

  function getResultSubtitle(r: SearchResult): string {
    const parts: string[] = [];
    if (r.description) parts.push(r.description.slice(0, 80));
    else if (r.excerpt) parts.push(r.excerpt.slice(0, 80));
    else if (r.definition) parts.push(r.definition.slice(0, 80));
    else if (r.notes) parts.push(r.notes.slice(0, 80));
    if (r.status && r.status !== 'published') parts.push(r.status.toUpperCase());
    if (r.difficulty) parts.push(r.difficulty);
    if (r.category || r.exam_category) parts.push(r.category || r.exam_category || '');
    if (r.question_type) parts.push(r.question_type);
    return parts.filter(Boolean).join(' · ');
  }

  let flatIdx = -1; // running counter for keyboard nav

  return (
    <div className="smart-search" style={{ position: 'relative' }}>
      <div className="smart-search__input-wrap">
        <input
          ref={inputRef}
          className={`fc-form__input smart-search__input ${compact ? 'smart-search__input--compact' : ''}`}
          placeholder={placeholder || 'Search modules, lessons, flashcards, questions... (Ctrl+K)'}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.length >= 2 && totalCount > 0) setIsOpen(true); }}
        />
        {loading && <span className="smart-search__spinner" />}
      </div>

      {isOpen && (query.length >= 2) && (
        <div className="smart-search__dropdown" ref={dropdownRef}>
          {totalCount === 0 && !loading && (
            <div className="smart-search__empty">No results for &ldquo;{query}&rdquo;</div>
          )}

          {Object.entries(results).map(([type, items]) => {
            if (!items || items.length === 0) return null;
            const meta = TYPE_META[type] || { icon: '📄', label: type, color: '#6B7280' };
            return (
              <div key={type} className="smart-search__group">
                <div className="smart-search__group-header">
                  <span>{meta.icon}</span>
                  <span>{meta.label}s</span>
                  <span className="smart-search__group-count">{items.length}</span>
                </div>
                {items.map((item) => {
                  flatIdx++;
                  const currentIdx = flatIdx;
                  return (
                    <button
                      key={item.id}
                      className={`smart-search__result ${currentIdx === selectedIdx ? 'smart-search__result--selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIdx(currentIdx)}
                    >
                      <div className="smart-search__result-main">
                        <span className="smart-search__result-badge" style={{ background: meta.color }}>{meta.label}</span>
                        <span className="smart-search__result-title">{getResultTitle(item)}</span>
                      </div>
                      <div className="smart-search__result-sub">{getResultSubtitle(item)}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="smart-search__footer">
            <span>{totalCount} result{totalCount !== 1 ? 's' : ''}</span>
            <span>↑↓ navigate · Enter select · Esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
