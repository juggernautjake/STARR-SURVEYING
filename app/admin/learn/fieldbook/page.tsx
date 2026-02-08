// app/admin/learn/fieldbook/page.tsx — Full-page fieldbook viewer
// Shows all entries, categories/lists, search, and full note management.
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AudioPlayer from '../../components/fieldbook/AudioPlayer';

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

export default function FieldbookFullPage() {
  /* ─── State ─── */
  const [entries, setEntries] = useState<FieldbookEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Entry detail / editing
  const [viewEntry, setViewEntry] = useState<FieldbookEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editMedia, setEditMedia] = useState<MediaItem[]>([]);
  const [entryCatIds, setEntryCatIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Category management
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📁');
  const [newCatColor, setNewCatColor] = useState('#1D3095');
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  /* ─── Fetch entries ─── */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/admin/learn/fieldbook?action=search';
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
      if (selectedCategory) url += `&category_id=${selectedCategory}`;
      if (dateFrom) url += `&from=${dateFrom}`;
      if (dateTo) url += `&to=${dateTo}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [searchQuery, selectedCategory, dateFrom, dateTo]);

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

  /* ─── Open entry for viewing/editing ─── */
  async function openEntry(entry: FieldbookEntry) {
    setViewEntry(entry);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditMedia(entry.media || []);

    // Fetch category links for this entry
    try {
      const res = await fetch(`/api/admin/learn/fieldbook?action=entry&id=${entry.id}`);
      if (res.ok) {
        const data = await res.json();
        setEntryCatIds(data.category_ids || []);
      }
    } catch { /* silent */ }
  }

  /* ─── Save entry ─── */
  async function saveEntry() {
    if (!viewEntry) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewEntry.id,
          title: editTitle,
          content: editContent,
          media: editMedia,
          category_ids: entryCatIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setViewEntry(data.entry);
        setEntries(prev => prev.map(e => e.id === viewEntry.id ? { ...e, ...data.entry } : e));
      }
    } catch { /* silent */ }
    setSaving(false);
  }

  /* ─── Create new entry ─── */
  async function createEntry() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Note', content: '' }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => [data.entry, ...prev]);
        openEntry(data.entry);
      }
    } catch { /* silent */ }
    setSaving(false);
  }

  /* ─── Delete entry ─── */
  async function deleteEntry(id: string) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await fetch(`/api/admin/learn/fieldbook?id=${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
      if (viewEntry?.id === id) setViewEntry(null);
    } catch { /* silent */ }
  }

  /* ─── Category management ─── */
  async function createCategory() {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_category',
          name: newCatName.trim(),
          icon: newCatIcon,
          color: newCatColor,
        }),
      });
      if (res.ok) {
        setNewCatName('');
        setNewCatIcon('📁');
        setNewCatColor('#1D3095');
        fetchCategories();
      }
    } catch { /* silent */ }
  }

  async function updateCategory(id: string) {
    if (!editCatName.trim()) return;
    try {
      await fetch('/api/admin/learn/fieldbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_category', id, name: editCatName.trim() }),
      });
      setEditCatId(null);
      fetchCategories();
    } catch { /* silent */ }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this list? Notes will not be deleted but will be unlinked.')) return;
    try {
      await fetch(`/api/admin/learn/fieldbook?type=category&id=${id}`, { method: 'DELETE' });
      fetchCategories();
      if (selectedCategory === id) setSelectedCategory(null);
    } catch { /* silent */ }
  }

  /* ─── Toggle entry category ─── */
  async function toggleEntryCategory(catId: string) {
    if (!viewEntry) return;
    const has = entryCatIds.includes(catId);
    try {
      await fetch('/api/admin/learn/fieldbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: has ? 'remove_from_category' : 'add_to_category',
          entry_id: viewEntry.id,
          category_id: catId,
        }),
      });
      setEntryCatIds(prev => has ? prev.filter(c => c !== catId) : [...prev, catId]);
    } catch { /* silent */ }
  }

  /* ─── Remove media from entry ─── */
  function removeMedia(idx: number) {
    setEditMedia(prev => prev.filter((_, i) => i !== idx));
  }

  /* ─── Entry Detail View ─── */
  if (viewEntry) {
    return (
      <>
        <div className="learn__header">
          <button onClick={() => { saveEntry(); setViewEntry(null); }} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D3095', fontFamily: 'Inter,sans-serif', fontSize: '.85rem' }}>
            ← Back to Fieldbook
          </button>
          <h2 className="learn__title">📝 Edit Note</h2>
        </div>

        <div className="fbfull__detail">
          <div className="fbfull__detail-main">
            {/* Title */}
            <input
              type="text"
              className="fbfull__detail-title"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Note title..."
            />

            {/* Content */}
            <textarea
              className="fbfull__detail-content"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={18}
              placeholder="Write your notes here..."
            />

            {/* Media */}
            {editMedia.length > 0 && (
              <div className="fbfull__media-section">
                <h4 className="fbfull__media-title">Attachments ({editMedia.length})</h4>
                {editMedia.map((m, idx) => (
                  <div key={idx} className="fbfull__media-row">
                    {m.type === 'audio' ? (
                      <AudioPlayer src={m.url} name={m.name} duration={m.duration_seconds} onRemove={() => removeMedia(idx)} />
                    ) : (
                      <div className="fbfull__media-file">
                        <span>{m.type === 'image' ? '🖼' : m.type === 'video' ? '🎬' : '🔗'}</span>
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="fbfull__media-link">{m.name}</a>
                        <button className="fbfull__media-remove" onClick={() => removeMedia(idx)} title="Remove">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="fbfull__detail-actions">
              <button className="admin-btn admin-btn--primary" onClick={saveEntry} disabled={saving}>
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
              <button className="admin-btn admin-btn--ghost" onClick={() => setViewEntry(null)}>Cancel</button>
              <button className="admin-btn admin-btn--danger" onClick={() => deleteEntry(viewEntry.id)} style={{ marginLeft: 'auto' }}>
                🗑 Delete
              </button>
            </div>
          </div>

          {/* Sidebar: metadata + categories */}
          <div className="fbfull__detail-sidebar">
            <div className="fbfull__sidebar-section">
              <h4 className="fbfull__sidebar-label">Created</h4>
              <p className="fbfull__sidebar-value">{new Date(viewEntry.created_at).toLocaleString()}</p>
            </div>
            {viewEntry.updated_at !== viewEntry.created_at && (
              <div className="fbfull__sidebar-section">
                <h4 className="fbfull__sidebar-label">Last Updated</h4>
                <p className="fbfull__sidebar-value">{new Date(viewEntry.updated_at).toLocaleString()}</p>
              </div>
            )}
            <div className="fbfull__sidebar-section">
              <h4 className="fbfull__sidebar-label">Lists</h4>
              <div className="fbfull__sidebar-cats">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`fbfull__cat-toggle ${entryCatIds.includes(cat.id) ? 'fbfull__cat-toggle--active' : ''}`}
                    onClick={() => toggleEntryCategory(cat.id)}
                    style={entryCatIds.includes(cat.id) ? { background: cat.color, borderColor: cat.color, color: '#FFF' } : undefined}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ─── Main List View ─── */
  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">← Back to Learning Hub</Link>
        <h2 className="learn__title">📓 My Fieldbook</h2>
        <p className="learn__subtitle">All your field notes, study notes, and observations in one place.</p>
      </div>

      {/* Actions bar */}
      <div className="fbfull__actions-bar">
        <button className="admin-btn admin-btn--primary" onClick={createEntry} disabled={saving}>
          📝 New Note
        </button>
        <button
          className={`admin-btn ${showCatManager ? 'admin-btn--ghost' : 'admin-btn--secondary'}`}
          onClick={() => setShowCatManager(!showCatManager)}
        >
          📂 {showCatManager ? 'Hide Lists' : 'Manage Lists'}
        </button>
      </div>

      {/* Category Manager */}
      {showCatManager && (
        <div className="fbfull__cat-manager">
          <h3 className="fbfull__cat-manager-title">Your Lists</h3>
          <div className="fbfull__cat-grid">
            {categories.map(cat => (
              <div key={cat.id} className="fbfull__cat-card" style={{ borderLeftColor: cat.color }}>
                {editCatId === cat.id ? (
                  <div className="fbfull__cat-edit-row">
                    <input
                      className="fbfull__cat-edit-input"
                      value={editCatName}
                      onChange={e => setEditCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') updateCategory(cat.id); }}
                    />
                    <button className="fbfull__cat-edit-save" onClick={() => updateCategory(cat.id)}>Save</button>
                    <button className="fbfull__cat-edit-cancel" onClick={() => setEditCatId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <span className="fbfull__cat-icon">{cat.icon}</span>
                    <span className="fbfull__cat-name">{cat.name}</span>
                    {!cat.is_default && (
                      <div className="fbfull__cat-actions">
                        <button onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name); }} title="Edit">✏️</button>
                        <button onClick={() => deleteCategory(cat.id)} title="Delete">🗑</button>
                      </div>
                    )}
                    {cat.is_default && <span className="fbfull__cat-badge">Default</span>}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* New category form */}
          <div className="fbfull__cat-new">
            <input
              className="fbfull__cat-new-input"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="New list name..."
              onKeyDown={e => { if (e.key === 'Enter') createCategory(); }}
            />
            <input
              type="text"
              className="fbfull__cat-new-icon"
              value={newCatIcon}
              onChange={e => setNewCatIcon(e.target.value)}
              maxLength={2}
              title="Emoji icon"
            />
            <input
              type="color"
              className="fbfull__cat-new-color"
              value={newCatColor}
              onChange={e => setNewCatColor(e.target.value)}
              title="Color"
            />
            <button className="admin-btn admin-btn--primary" onClick={createCategory}>+ Create List</button>
          </div>
        </div>
      )}

      {/* Search & Filter bar */}
      <div className="fbfull__filters">
        <input
          type="text"
          className="fbfull__search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search notes by title or content..."
          onKeyDown={e => { if (e.key === 'Enter') fetchEntries(); }}
        />
        <input
          type="date"
          className="fbfull__date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="From date"
        />
        <input
          type="date"
          className="fbfull__date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="To date"
        />
        <button className="admin-btn admin-btn--secondary" onClick={fetchEntries}>Search</button>
      </div>

      {/* Category filter chips */}
      <div className="fbfull__cat-chips">
        <button
          className={`fbfull__chip ${!selectedCategory ? 'fbfull__chip--active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All Notes
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`fbfull__chip ${selectedCategory === cat.id ? 'fbfull__chip--active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
            style={selectedCategory === cat.id ? { background: cat.color, borderColor: cat.color, color: '#FFF' } : undefined}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Entry list */}
      {loading ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">⏳</div>
          <div className="admin-empty__title">Loading your notes...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">📓</div>
          <div className="admin-empty__title">No notes found</div>
          <div className="admin-empty__desc">
            {searchQuery || selectedCategory || dateFrom || dateTo
              ? 'Try adjusting your search or filters.'
              : 'Open the fieldbook from any page to start writing notes, or click "New Note" above.'}
          </div>
        </div>
      ) : (
        <div className="fbfull__grid">
          {entries.map(entry => (
            <button key={entry.id} className="fbfull__card" onClick={() => openEntry(entry)}>
              <div className="fbfull__card-header">
                <h3 className="fbfull__card-title">{entry.title || 'Untitled Note'}</h3>
                {entry.media && entry.media.length > 0 && (
                  <span className="fbfull__card-media-badge">📎 {entry.media.length}</span>
                )}
              </div>
              <p className="fbfull__card-preview">
                {entry.content ? entry.content.slice(0, 150) + (entry.content.length > 150 ? '...' : '') : 'No content'}
              </p>
              <div className="fbfull__card-footer">
                <span className="fbfull__card-date">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {entry.updated_at !== entry.created_at && (
                  <span className="fbfull__card-updated">
                    Updated {new Date(entry.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <button
                className="fbfull__card-delete"
                onClick={e => { e.stopPropagation(); deleteEntry(entry.id); }}
                title="Delete"
              >
                🗑
              </button>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
