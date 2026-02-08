// app/admin/components/Fieldbook.tsx — Two-page notebook fieldbook
// Opens as a floating book with lined paper, audio recording, media, emoji,
// rich text formatting. Stays open across page navigation. Auto-saves.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import AudioRecorder from './fieldbook/AudioRecorder';
import AudioPlayer from './fieldbook/AudioPlayer';

/* ─── Types ─── */
interface MediaItem {
  type: 'audio' | 'image' | 'video' | 'url';
  url: string;
  name: string;
  duration_seconds?: number;
}

interface FieldbookEntry {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  media: MediaItem[];
  tags: string[];
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

/* ─── Constants ─── */
const QUICK_EMOJIS = ['📌', '⭐', '❗', '✅', '❌', '🔍', '💡', '📐', '🗺️', '📋', '🎯', '⚠️', '🏗️', '🔧', '📷', '📝'];
const LINES_PER_PAGE = 18;
const CHARS_PER_LINE = 42;

/* ─── Helper: split content into pages ─── */
function splitIntoPages(text: string): string[] {
  const lines = text.split('\n');
  const expanded: string[] = [];
  for (const line of lines) {
    if (line.length <= CHARS_PER_LINE) {
      expanded.push(line);
    } else {
      // Word wrap long lines
      let remaining = line;
      while (remaining.length > 0) {
        if (remaining.length <= CHARS_PER_LINE) {
          expanded.push(remaining);
          break;
        }
        let breakIdx = remaining.lastIndexOf(' ', CHARS_PER_LINE);
        if (breakIdx === -1) breakIdx = CHARS_PER_LINE;
        expanded.push(remaining.slice(0, breakIdx));
        remaining = remaining.slice(breakIdx).trimStart();
      }
    }
  }

  // Partition into pages (two pages at a time = one spread)
  const linesPerSpread = LINES_PER_PAGE * 2;
  const pages: string[] = [];
  for (let i = 0; i < expanded.length; i += linesPerSpread) {
    pages.push(expanded.slice(i, i + linesPerSpread).join('\n'));
  }
  if (pages.length === 0) pages.push('');
  return pages;
}

export default function Fieldbook() {
  const pathname = usePathname();

  /* ─── State ─── */
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'write' | 'browse' | 'search'>('write');
  const [entry, setEntry] = useState<FieldbookEntry | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [flipping, setFlipping] = useState<'forward' | 'back' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

  // Browse/search state
  const [entries, setEntries] = useState<FieldbookEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Category management
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [entryCategoryIds, setEntryCategoryIds] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  /* ─── Load current entry on open ─── */
  const loadCurrentEntry = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/learn/fieldbook?action=current');
      if (res.ok) {
        const data = await res.json();
        if (data.entry) {
          setEntry(data.entry);
          setTitle(data.entry.title || '');
          setContent(data.entry.content || '');
          setMedia(data.entry.media || []);
        }
      }
    } catch { /* silent */ }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/learn/fieldbook?action=categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCurrentEntry();
      loadCategories();
    }
  }, [isOpen, loadCurrentEntry, loadCategories]);

  /* ─── Auto-save debounced (2s after last edit) ─── */
  useEffect(() => {
    if (!entry?.id || !isOpen) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveEntry(false), 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, media]);

  /* ─── Save entry ─── */
  async function saveEntry(showStatus = true) {
    if (showStatus) setSaving(true);
    try {
      if (entry?.id) {
        await fetch('/api/admin/learn/fieldbook', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: entry.id, title, content, media }),
        });
      } else {
        const res = await fetch('/api/admin/learn/fieldbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, media }),
        });
        if (res.ok) {
          const data = await res.json();
          setEntry(data.entry);
        }
      }
    } catch { /* silent */ }
    if (showStatus) setTimeout(() => setSaving(false), 600);
  }

  /* ─── New entry ─── */
  async function startNewEntry() {
    // Save current first
    if (entry?.id && content.trim()) await saveEntry(false);

    setEntry(null);
    setTitle('');
    setContent('');
    setMedia([]);
    setSpreadIndex(0);
    setEntryCategoryIds([]);
    setView('write');
  }

  /* ─── Open existing entry ─── */
  async function openEntry(e: FieldbookEntry) {
    // Save current first
    if (entry?.id && content.trim()) await saveEntry(false);

    setEntry(e);
    setTitle(e.title || '');
    setContent(e.content || '');
    setMedia(e.media || []);
    setSpreadIndex(0);
    setView('write');
  }

  /* ─── Browse / search ─── */
  async function loadEntries() {
    setLoadingEntries(true);
    try {
      let url = '/api/admin/learn/fieldbook?action=search';
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
      if (selectedCategory) url += `&category_id=${selectedCategory}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* silent */ }
    setLoadingEntries(false);
  }

  useEffect(() => {
    if (view === 'browse' || view === 'search') loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedCategory]);

  /* ─── Page flipping ─── */
  const pages = splitIntoPages(content);
  const totalSpreads = Math.ceil(pages.length / 1) || 1;

  function flipForward() {
    if (spreadIndex >= totalSpreads - 1) return;
    setFlipping('forward');
    setTimeout(() => { setSpreadIndex(i => i + 1); setFlipping(null); }, 400);
  }

  function flipBack() {
    if (spreadIndex <= 0) return;
    setFlipping('back');
    setTimeout(() => { setSpreadIndex(i => i - 1); setFlipping(null); }, 400);
  }

  /* ─── Audio recording complete ─── */
  function handleAudioRecorded(blob: Blob, duration: number) {
    const url = URL.createObjectURL(blob);
    const item: MediaItem = {
      type: 'audio',
      url,
      name: `Recording ${media.filter(m => m.type === 'audio').length + 1}`,
      duration_seconds: duration,
    };
    setMedia(prev => [...prev, item]);
    setShowRecorder(false);
  }

  /* ─── File upload (image/video) ─── */
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('image/') ? 'image' as const
        : file.type.startsWith('video/') ? 'video' as const
        : 'url' as const;
      setMedia(prev => [...prev, { type, url, name: file.name }]);
    });
    e.target.value = '';
  }

  /* ─── URL insert ─── */
  function insertURL() {
    const url = prompt('Enter URL:');
    if (url?.trim()) {
      setMedia(prev => [...prev, { type: 'url', url: url.trim(), name: url.trim() }]);
    }
  }

  /* ─── Emoji insert ─── */
  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart || content.length;
    setContent(prev => prev.slice(0, pos) + emoji + prev.slice(pos));
    setShowEmoji(false);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(pos + emoji.length, pos + emoji.length); }, 0);
  }

  /* ─── Format helpers ─── */
  function applyFormat(before: string, after: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || 'text';
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(newContent);
    setTimeout(() => { ta.focus(); const p = start + before.length + selected.length + after.length; ta.setSelectionRange(p, p); }, 0);
  }

  /* ─── Remove media ─── */
  function removeMedia(idx: number) {
    setMedia(prev => prev.filter((_, i) => i !== idx));
  }

  /* ─── Create category ─── */
  async function createCategory() {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_category', name: newCatName.trim() }),
      });
      if (res.ok) {
        setNewCatName('');
        setShowNewCat(false);
        loadCategories();
      }
    } catch { /* silent */ }
  }

  // Don't render on login
  if (pathname === '/admin/login') return null;

  /* ─── Render: get current spread's text ─── */
  const currentPageContent = pages[spreadIndex] || '';
  const allLines = currentPageContent.split('\n');
  const leftLines = allLines.slice(0, LINES_PER_PAGE);
  const rightLines = allLines.slice(LINES_PER_PAGE, LINES_PER_PAGE * 2);

  return (
    <>
      {/* ─── FAB Button ─── */}
      {!isOpen && (
        <div className="fieldbook-fab-wrap">
          <span className="fieldbook-fab-tooltip">Fieldbook</span>
          <button className="fieldbook-fab" onClick={() => setIsOpen(true)} aria-label="Open Fieldbook">
            📓
          </button>
        </div>
      )}

      {/* ─── Open Fieldbook ─── */}
      {isOpen && (
        <div className="fb">
          {/* ─── Top bar ─── */}
          <div className="fb__topbar">
            <div className="fb__topbar-left">
              <button className={`fb__tab ${view === 'write' ? 'fb__tab--active' : ''}`} onClick={() => setView('write')}>Write</button>
              <button className={`fb__tab ${view === 'browse' ? 'fb__tab--active' : ''}`} onClick={() => setView('browse')}>Browse</button>
              <button className={`fb__tab ${view === 'search' ? 'fb__tab--active' : ''}`} onClick={() => setView('search')}>Search</button>
            </div>
            <div className="fb__topbar-right">
              {saving && <span className="fb__saving">Saving...</span>}
              <Link href="/admin/learn/fieldbook" className="fb__expand" onClick={() => setIsOpen(false)} title="Full page view">↗</Link>
              <button className="fb__close" onClick={() => { saveEntry(false); setIsOpen(false); }}>✕</button>
            </div>
          </div>

          {/* ═══ WRITE VIEW ═══ */}
          {view === 'write' && (
            <>
              {/* Title */}
              <div className="fb__title-bar">
                <input
                  className="fb__title-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Entry title..."
                />
                <button className="fb__new-btn" onClick={startNewEntry} title="New entry">+ New</button>
              </div>

              {/* Book spread with page-flip */}
              <div className={`fb__book ${flipping ? `fb__book--flip-${flipping}` : ''}`}>
                {/* Left page */}
                <div className="fb__page fb__page--left">
                  <div className="fb__page-lines">
                    {Array.from({ length: LINES_PER_PAGE }).map((_, i) => (
                      <div key={i} className="fb__line">
                        <span className="fb__line-text">{leftLines[i] || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Spine */}
                <div className="fb__spine" />
                {/* Right page */}
                <div className="fb__page fb__page--right">
                  <div className="fb__page-lines">
                    {Array.from({ length: LINES_PER_PAGE }).map((_, i) => (
                      <div key={i} className="fb__line">
                        <span className="fb__line-text">{rightLines[i] || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Page navigation */}
              <div className="fb__page-nav">
                <button className="fb__page-btn" onClick={flipBack} disabled={spreadIndex === 0}>← Prev</button>
                <span className="fb__page-count">
                  Pages {spreadIndex * 2 + 1}–{Math.min(spreadIndex * 2 + 2, Math.max(1, allLines.length > LINES_PER_PAGE ? spreadIndex * 2 + 2 : spreadIndex * 2 + 1))}
                </span>
                <button className="fb__page-btn" onClick={flipForward} disabled={spreadIndex >= totalSpreads - 1}>Next →</button>
              </div>

              {/* Hidden textarea that drives content */}
              <div className="fb__editor">
                <textarea
                  ref={textareaRef}
                  className="fb__textarea"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Start writing your notes..."
                />
              </div>

              {/* Media items */}
              {media.length > 0 && (
                <div className="fb__media-list">
                  {media.map((m, idx) => (
                    <div key={idx} className="fb__media-item">
                      {m.type === 'audio' ? (
                        <AudioPlayer src={m.url} name={m.name} duration={m.duration_seconds} onRemove={() => removeMedia(idx)} />
                      ) : (
                        <div className="fb__media-link">
                          <span>{m.type === 'image' ? '🖼' : m.type === 'video' ? '🎬' : '🔗'}</span>
                          <span className="fb__media-link-text">{m.name}</span>
                          <button onClick={() => removeMedia(idx)} title="Remove">✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Audio recorder */}
              {showRecorder && (
                <div className="fb__recorder-wrap">
                  <AudioRecorder onRecordingComplete={handleAudioRecorded} maxDurationSeconds={300} />
                </div>
              )}

              {/* Toolbar */}
              <div className="fb__toolbar">
                <button className="fb__tool" onClick={() => applyFormat('**', '**')} title="Bold"><strong>B</strong></button>
                <button className="fb__tool" onClick={() => applyFormat('*', '*')} title="Italic"><em>I</em></button>
                <button className="fb__tool" onClick={() => applyFormat('__', '__')} title="Underline" style={{ textDecoration: 'underline' }}>U</button>
                <button className="fb__tool" onClick={() => applyFormat('- ', '')} title="List">•</button>
                <span className="fb__toolbar-sep" />
                <button className="fb__tool" onClick={() => setShowRecorder(!showRecorder)} title="Record audio">🎙️</button>
                <button className="fb__tool" onClick={() => fileInputRef.current?.click()} title="Upload file">📎</button>
                <button className="fb__tool" onClick={insertURL} title="Insert URL">🔗</button>
                <div style={{ position: 'relative' }}>
                  <button className="fb__tool" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">😊</button>
                  {showEmoji && (
                    <div className="fb__emoji-picker">
                      {QUICK_EMOJIS.map(em => (
                        <button key={em} onClick={() => insertEmoji(em)}>{em}</button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="fb__toolbar-sep" />
                <button className="fb__tool fb__tool--save" onClick={() => saveEntry(true)} title="Save now">💾</button>
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>

              {/* Entry metadata */}
              {entry && (
                <div className="fb__meta">
                  Created: {new Date(entry.created_at).toLocaleString()}
                  {entry.updated_at !== entry.created_at && (
                    <> | Updated: {new Date(entry.updated_at).toLocaleString()}</>
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══ BROWSE VIEW ═══ */}
          {view === 'browse' && (
            <div className="fb__browse">
              {/* Category filter */}
              <div className="fb__cat-bar">
                <button className={`fb__cat-chip ${!selectedCategory ? 'fb__cat-chip--active' : ''}`} onClick={() => setSelectedCategory(null)}>All</button>
                {categories.map(c => (
                  <button key={c.id} className={`fb__cat-chip ${selectedCategory === c.id ? 'fb__cat-chip--active' : ''}`} onClick={() => setSelectedCategory(c.id)} style={selectedCategory === c.id ? { background: c.color, borderColor: c.color } : undefined}>
                    {c.icon} {c.name}
                  </button>
                ))}
                <button className="fb__cat-chip fb__cat-chip--add" onClick={() => setShowNewCat(!showNewCat)}>+ List</button>
              </div>

              {showNewCat && (
                <div className="fb__new-cat-form">
                  <input className="fb__new-cat-input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New list name..." onKeyDown={e => { if (e.key === 'Enter') createCategory(); }} />
                  <button className="fb__new-cat-save" onClick={createCategory}>Create</button>
                </div>
              )}

              {/* Entry list */}
              <div className="fb__entry-list">
                {loadingEntries ? (
                  <p className="fb__empty-msg">Loading...</p>
                ) : entries.length === 0 ? (
                  <p className="fb__empty-msg">No entries found.</p>
                ) : (
                  entries.map(e => (
                    <button key={e.id} className="fb__entry-card" onClick={() => openEntry(e)}>
                      <div className="fb__entry-card-title">{e.title || 'Untitled Note'}</div>
                      <div className="fb__entry-card-preview">{e.content.slice(0, 80)}</div>
                      <div className="fb__entry-card-date">
                        {new Date(e.created_at).toLocaleDateString()}
                        {e.media && e.media.length > 0 && <span> | 📎 {e.media.length}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ═══ SEARCH VIEW ═══ */}
          {view === 'search' && (
            <div className="fb__browse">
              <div className="fb__search-bar">
                <input
                  className="fb__search-input"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by title or content..."
                  onKeyDown={e => { if (e.key === 'Enter') loadEntries(); }}
                />
                <button className="fb__search-btn" onClick={loadEntries}>Search</button>
              </div>

              <div className="fb__entry-list">
                {loadingEntries ? (
                  <p className="fb__empty-msg">Searching...</p>
                ) : entries.length === 0 ? (
                  <p className="fb__empty-msg">No results. Try a different search.</p>
                ) : (
                  entries.map(e => (
                    <button key={e.id} className="fb__entry-card" onClick={() => openEntry(e)}>
                      <div className="fb__entry-card-title">{e.title || 'Untitled Note'}</div>
                      <div className="fb__entry-card-preview">{e.content.slice(0, 80)}</div>
                      <div className="fb__entry-card-date">{new Date(e.created_at).toLocaleDateString()}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
