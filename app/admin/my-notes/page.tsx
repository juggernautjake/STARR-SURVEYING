// app/admin/my-notes/page.tsx — Personal notes powered by Fieldbook API
// Two tabs: My Notes (personal) and Job Notes (public field notes).
// Create lists, manage public/private visibility, full-page notebook editor.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

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
  is_public?: boolean;
  job_id?: string | null;
  job_name?: string | null;
  job_number?: string | null;
  user_email?: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

/* ─── Constants ─── */
const LINES_PER_PAGE = 22;
const CHARS_PER_LINE = 60;

function getLineCount(text: string): number {
  const lines = text.split('\n');
  let count = 0;
  for (const line of lines) {
    count += line.length <= CHARS_PER_LINE ? 1 : Math.ceil(line.length / CHARS_PER_LINE);
  }
  return count;
}

export default function MyNotesPage() {
  const { data: session } = useSession();

  /* ─── View state ─── */
  const [activeTab, setActiveTab] = useState<'personal' | 'job'>('personal');

  /* ─── List state ─── */
  const [entries, setEntries] = useState<FieldbookEntry[]>([]);
  const [jobNotes, setJobNotes] = useState<FieldbookEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  /* ─── List management ─── */
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListIcon, setNewListIcon] = useState('📁');

  /* ─── Editor state ─── */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FieldbookEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editMedia, setEditMedia] = useState<MediaItem[]>([]);
  const [editPublic, setEditPublic] = useState(false);
  const [entryCatIds, setEntryCatIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  /* ─── Fetch personal entries ─── */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/admin/learn/fieldbook?action=search';
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
      if (selectedCategory) url += `&category_id=${selectedCategory}`;
      // Personal tab = exclude job notes; Job tab = only job notes
      if (activeTab === 'personal') url += '&job_only=false';
      else url += '&job_only=true';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (activeTab === 'personal') setEntries(data.entries || []);
        else setJobNotes(data.entries || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [searchQuery, selectedCategory, activeTab]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/learn/fieldbook?action=categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchCategories();
  }, [fetchEntries, fetchCategories]);

  /* ─── Auto-save debounced ─── */
  useEffect(() => {
    if (!editEntry?.id || !editorOpen) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveNote(false), 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContent, editTitle, editMedia, editPublic]);

  /* ─── Save note ─── */
  async function saveNote(showStatus = true) {
    if (showStatus) setSaving(true);
    try {
      if (editEntry?.id) {
        const res = await fetch('/api/admin/learn/fieldbook', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editEntry.id, title: editTitle, content: editContent,
            media: editMedia, is_public: editPublic, category_ids: entryCatIds,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEditEntry(data.entry);
          setLastSaved(new Date().toLocaleTimeString());
        }
      } else {
        const res = await fetch('/api/admin/learn/fieldbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editTitle || 'Untitled Note', content: editContent,
            media: editMedia, is_public: editPublic, category_ids: entryCatIds,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEditEntry(data.entry);
          setLastSaved(new Date().toLocaleTimeString());
        }
      }
    } catch { /* silent */ }
    if (showStatus) setTimeout(() => setSaving(false), 600);
  }

  /* ─── Open / Create / Close ─── */
  async function openEntry(entry: FieldbookEntry) {
    setEditEntry(entry);
    setEditTitle(entry.title || '');
    setEditContent(entry.content || '');
    setEditMedia(entry.media || []);
    setEditPublic(entry.is_public ?? false);
    setLastSaved(null);
    setEditorOpen(true);
    try {
      const res = await fetch(`/api/admin/learn/fieldbook?action=entry&id=${entry.id}`);
      if (res.ok) {
        const data = await res.json();
        setEntryCatIds(data.category_ids || []);
      }
    } catch { /* silent */ }
  }

  function startNewEntry() {
    setEditEntry(null);
    setEditTitle('');
    setEditContent('');
    setEditMedia([]);
    setEditPublic(false);
    setEntryCatIds([]);
    setLastSaved(null);
    setEditorOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }

  async function closeEditor() {
    if (editTitle.trim() || editContent.trim()) await saveNote(false);
    setEditorOpen(false);
    setEditEntry(null);
    fetchEntries();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await fetch(`/api/admin/learn/fieldbook?id=${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
      setJobNotes(prev => prev.filter(e => e.id !== id));
      if (editEntry?.id === id) { setEditorOpen(false); setEditEntry(null); }
    } catch { /* silent */ }
  }

  /* ─── Category/list management ─── */
  async function createList() {
    if (!newListName.trim()) return;
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_category', name: newListName.trim(), icon: newListIcon }),
      });
      if (res.ok) {
        setNewListName(''); setNewListIcon('📁'); setShowNewList(false);
        fetchCategories();
      }
    } catch { /* silent */ }
  }

  async function toggleEntryCategory(catId: string) {
    if (!editEntry) return;
    const has = entryCatIds.includes(catId);
    try {
      await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: has ? 'remove_from_category' : 'add_to_category',
          entry_id: editEntry.id, category_id: catId,
        }),
      });
      setEntryCatIds(prev => has ? prev.filter(c => c !== catId) : [...prev, catId]);
    } catch { /* silent */ }
  }

  /* ─── Helpers ─── */
  function removeMedia(idx: number) { setEditMedia(prev => prev.filter((_, i) => i !== idx)); }

  function applyFormat(before: string, after: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editContent.slice(start, end) || 'text';
    setEditContent(editContent.slice(0, start) + before + selected + after + editContent.slice(end));
    setTimeout(() => { ta.focus(); const p = start + before.length + selected.length + after.length; ta.setSelectionRange(p, p); }, 0);
  }

  function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtDateTime(d: string) { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  if (!session?.user) return null;

  const isJobNote = !!(editEntry?.job_id);
  const displayEntries = activeTab === 'personal' ? entries : jobNotes;

  /* ═══════════════════════════════════════════════════════════
     FULL-PAGE NOTEBOOK EDITOR
     ═══════════════════════════════════════════════════════════ */
  if (editorOpen) {
    const lineCount = Math.max(LINES_PER_PAGE, getLineCount(editContent) + 3);

    return (
      <div className="mynotes-editor">
        <div className="mynotes-editor__topbar">
          <button className="mynotes-editor__back" onClick={closeEditor}>&larr; Back to My Notes</button>
          <div className="mynotes-editor__actions">
            {lastSaved && <span className="mynotes-editor__saved">Saved {lastSaved}</span>}
            {saving && <span className="mynotes-editor__saving">Saving...</span>}
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveNote(true)} disabled={saving}>Save</button>
            {editEntry && (
              <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ color: '#EF4444' }} onClick={() => deleteEntry(editEntry.id)}>Delete</button>
            )}
          </div>
        </div>

        <div className="mynotes-editor__layout">
          <div className="mynotes-editor__main">
            <div className="mynotes-notebook">
              <div className="mynotes-notebook__margin" />

              <input
                className="mynotes-notebook__title"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Note Title..."
              />

              {/* Visibility + date row */}
              <div className="mynotes-notebook__meta-row">
                <span className="mynotes-notebook__date">
                  {editEntry ? fmtDate(editEntry.created_at) : fmtDate(new Date().toISOString())}
                </span>
                {isJobNote ? (
                  <span className="mynotes-notebook__vis-badge mynotes-notebook__vis-badge--job">
                    Job Note &mdash; Always Public
                  </span>
                ) : (
                  <button
                    className={`mynotes-notebook__vis-toggle ${editPublic ? 'mynotes-notebook__vis-toggle--public' : ''}`}
                    onClick={() => setEditPublic(!editPublic)}
                  >
                    {editPublic ? '🌐 Public' : '🔒 Private'}
                  </button>
                )}
              </div>

              {isJobNote && editEntry?.job_name && (
                <div className="mynotes-notebook__job-label">
                  Job: {editEntry.job_name} {editEntry.job_number ? `(#${editEntry.job_number})` : ''}
                </div>
              )}

              <div className="mynotes-notebook__content">
                <textarea
                  ref={textareaRef}
                  className="mynotes-notebook__textarea"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="Start writing..."
                  style={{ minHeight: `${lineCount * 1.65}rem` }}
                />
                <div className="mynotes-notebook__lines" aria-hidden="true">
                  {Array.from({ length: lineCount }).map((_, i) => (
                    <div key={i} className="mynotes-notebook__line" />
                  ))}
                </div>
              </div>

              {editMedia.length > 0 && (
                <div className="mynotes-notebook__media">
                  <div className="mynotes-notebook__media-label">Attachments ({editMedia.length})</div>
                  {editMedia.map((m, idx) => (
                    <div key={idx} className="mynotes-notebook__media-item">
                      <span>{m.type === 'audio' ? '🎙' : m.type === 'image' ? '🖼' : m.type === 'video' ? '🎬' : '🔗'}</span>
                      <span className="mynotes-notebook__media-name">{m.name}</span>
                      <button className="mynotes-notebook__media-remove" onClick={() => removeMedia(idx)} title="Remove">&#x2715;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mynotes-editor__toolbar">
              <button className="mynotes-editor__tool" onClick={() => applyFormat('**', '**')} title="Bold"><strong>B</strong></button>
              <button className="mynotes-editor__tool" onClick={() => applyFormat('*', '*')} title="Italic"><em>I</em></button>
              <button className="mynotes-editor__tool" onClick={() => applyFormat('__', '__')} title="Underline" style={{ textDecoration: 'underline' }}>U</button>
              <button className="mynotes-editor__tool" onClick={() => applyFormat('- ', '')} title="Bullet List">&#x2022;</button>
              <button className="mynotes-editor__tool" onClick={() => applyFormat('[ ] ', '')} title="Checklist">&#x2611;</button>
              <button className="mynotes-editor__tool" onClick={() => applyFormat('### ', '')} title="Heading">H</button>
            </div>
          </div>

          <div className="mynotes-editor__sidebar">
            {/* Note info */}
            <div className="mynotes-editor__meta-section">
              <h4 className="mynotes-editor__meta-title">Note Info</h4>
              <div className="mynotes-editor__meta-row">
                <span className="mynotes-editor__meta-label">Created</span>
                <span className="mynotes-editor__meta-value">{editEntry ? fmtDateTime(editEntry.created_at) : 'Just now'}</span>
              </div>
              {editEntry && editEntry.updated_at !== editEntry.created_at && (
                <div className="mynotes-editor__meta-row">
                  <span className="mynotes-editor__meta-label">Last Edited</span>
                  <span className="mynotes-editor__meta-value">{fmtDateTime(editEntry.updated_at)}</span>
                </div>
              )}
              <div className="mynotes-editor__meta-row">
                <span className="mynotes-editor__meta-label">Visibility</span>
                <span className="mynotes-editor__meta-value">{isJobNote ? 'Public (Job)' : editPublic ? 'Public' : 'Private'}</span>
              </div>
              <div className="mynotes-editor__meta-row">
                <span className="mynotes-editor__meta-label">Characters</span>
                <span className="mynotes-editor__meta-value">{editContent.length.toLocaleString()}</span>
              </div>
            </div>

            {/* Lists (categories) */}
            {editEntry && categories.length > 0 && (
              <div className="mynotes-editor__meta-section">
                <h4 className="mynotes-editor__meta-title">Lists</h4>
                <div className="mynotes-editor__cats">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      className={`mynotes-editor__cat ${entryCatIds.includes(cat.id) ? 'mynotes-editor__cat--active' : ''}`}
                      onClick={() => toggleEntryCategory(cat.id)}
                      style={entryCatIds.includes(cat.id) ? { background: cat.color, borderColor: cat.color, color: '#FFF' } : undefined}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     NOTES LIST VIEW
     ═══════════════════════════════════════════════════════════ */
  return (
    <>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">My Notes</h2>
        <p className="admin-learn__subtitle">
          All your fieldbook entries and personal notes in one place. Write new notes or browse and edit existing ones.
        </p>
      </div>

      {/* Tabs */}
      <div className="mynotes__tabs">
        <button className={`mynotes__tab ${activeTab === 'personal' ? 'mynotes__tab--active' : ''}`} onClick={() => { setActiveTab('personal'); setSelectedCategory(null); setSearchQuery(''); }}>
          🔒 My Notes
        </button>
        <button className={`mynotes__tab ${activeTab === 'job' ? 'mynotes__tab--active' : ''}`} onClick={() => { setActiveTab('job'); setSelectedCategory(null); setSearchQuery(''); }}>
          🔧 Job Notes
        </button>
      </div>

      {/* Actions bar */}
      <div className="mynotes__actions">
        <button className="admin-btn admin-btn--primary" onClick={startNewEntry}>+ New Entry</button>
        <span className="mynotes__count">
          {displayEntries.length} note{displayEntries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search */}
      <div className="mynotes__search-bar">
        <input
          className="mynotes__search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={activeTab === 'personal' ? 'Search your notes...' : 'Search job notes...'}
          onKeyDown={e => { if (e.key === 'Enter') fetchEntries(); }}
        />
        <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={fetchEntries}>Search</button>
      </div>

      {/* Category chips + new list */}
      <div className="mynotes__chips">
        <button
          className={`mynotes__chip ${!selectedCategory ? 'mynotes__chip--active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`mynotes__chip ${selectedCategory === cat.id ? 'mynotes__chip--active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
            style={selectedCategory === cat.id ? { background: cat.color, borderColor: cat.color, color: '#FFF' } : undefined}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
        <button className="mynotes__chip mynotes__chip--add" onClick={() => setShowNewList(!showNewList)}>+ New List</button>
      </div>

      {/* New list form */}
      {showNewList && (
        <div className="mynotes__new-list-form">
          <input
            className="mynotes__search"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            placeholder="List name..."
            onKeyDown={e => { if (e.key === 'Enter') createList(); }}
            style={{ flex: 1 }}
          />
          <select className="mynotes__icon-select" value={newListIcon} onChange={e => setNewListIcon(e.target.value)}>
            <option value="📁">📁</option>
            <option value="📋">📋</option>
            <option value="🔧">🔧</option>
            <option value="📐">📐</option>
            <option value="📚">📚</option>
            <option value="⭐">⭐</option>
            <option value="🎯">🎯</option>
            <option value="💡">💡</option>
            <option value="⚠️">⚠️</option>
            <option value="🏗️">🏗️</option>
          </select>
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={createList}>Create</button>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowNewList(false)}>Cancel</button>
        </div>
      )}

      {/* Notes grid */}
      {loading ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x23F3;</div>
          <div className="admin-empty__title">Loading your notes...</div>
        </div>
      ) : displayEntries.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">{activeTab === 'personal' ? '📒' : '🔧'}</div>
          <div className="admin-empty__title">
            {activeTab === 'personal' ? 'No personal notes yet' : 'No job notes yet'}
          </div>
          <div className="admin-empty__desc">
            {searchQuery || selectedCategory
              ? 'Try adjusting your search or filters.'
              : activeTab === 'personal'
                ? 'Click "New Entry" to write your first note, or use the Fieldbook button on any page.'
                : 'Job notes are created automatically when you take notes on a job page, or you can create them manually.'}
          </div>
        </div>
      ) : (
        <div className="mynotes__grid">
          {displayEntries.map(entry => (
            <button key={entry.id} className="mynotes__card" onClick={() => openEntry(entry)}>
              <div className="mynotes__card-header">
                <h3 className="mynotes__card-title">
                  {entry.is_public ? '🌐 ' : '🔒 '}
                  {entry.title || 'Untitled Note'}
                </h3>
                {entry.media && entry.media.length > 0 && (
                  <span className="mynotes__card-badge">&#x1F4CE; {entry.media.length}</span>
                )}
              </div>
              {entry.job_name && (
                <div className="mynotes__card-job">
                  &#x1F527; {entry.job_name} {entry.job_number ? `(#${entry.job_number})` : ''}
                </div>
              )}
              <p className="mynotes__card-preview">
                {entry.content ? entry.content.slice(0, 160) + (entry.content.length > 160 ? '...' : '') : 'Empty note'}
              </p>
              <div className="mynotes__card-footer">
                <div className="mynotes__card-dates">
                  <span className="mynotes__card-created">Created {fmtDate(entry.created_at)}</span>
                  {entry.updated_at !== entry.created_at && (
                    <span className="mynotes__card-edited">Edited {fmtDate(entry.updated_at)}</span>
                  )}
                </div>
                {!entry.job_id && (
                  <button
                    className="mynotes__card-delete"
                    onClick={e => { e.stopPropagation(); deleteEntry(entry.id); }}
                    title="Delete"
                  >
                    &#x1F5D1;
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
