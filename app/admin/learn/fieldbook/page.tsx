// app/admin/learn/fieldbook/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Note {
  id: string; title: string; content: string;
  context_type?: string; context_label?: string;
  page_url?: string; created_at: string; updated_at: string;
}

export default function FieldbookPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchNotes(); }, []);

  async function fetchNotes() {
    try {
      const res = await fetch('/api/admin/learn/notes');
      if (res.ok) { const data = await res.json(); setNotes(data.notes || []); }
    } catch {}
    setLoading(false);
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    await fetch(`/api/admin/learn/notes?id=${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  async function updateNote() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/notes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, title: editTitle, content: editContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === editing.id ? data.note : n));
        setEditing(null);
      }
    } catch {}
    setSaving(false);
  }

  async function createNote() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Note', content: '', context_type: 'fieldbook', context_label: 'Fieldbook' }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => [data.note, ...prev]);
        setEditing(data.note);
        setEditTitle(data.note.title);
        setEditContent(data.note.content);
      }
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading...</div></div>;

  // Edit view
  if (editing) return (
    <>
      <div className="learn__header">
        <button onClick={() => setEditing(null)} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>← Back to Fieldbook</button>
        <h2 className="learn__title">📝 Edit Note</h2>
      </div>
      <div style={{ maxWidth: '700px' }}>
        <div className="fieldbook-edit__context">
          <span>📅 Created: {new Date(editing.created_at).toLocaleString()}</span>
          {editing.context_label && <span> · 📍 {editing.context_label}</span>}
          {editing.page_url && <span> · 🔗 {editing.page_url}</span>}
        </div>
        <input type="text" className="fieldbook-edit__input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Note title" />
        <textarea className="fieldbook-edit__textarea" value={editContent} onChange={e => setEditContent(e.target.value)} rows={14} placeholder="Write your notes here..." />
        <div className="fieldbook-edit__actions">
          <button className="admin-btn admin-btn--primary" onClick={updateNote} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>
          <button className="admin-btn admin-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">← Back to Learning Hub</Link>
        <h2 className="learn__title">📓 My Fieldbook</h2>
        <p className="learn__subtitle">All your study notes in one place. Notes auto-record the date, time, and what page you were viewing.</p>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <button className="admin-btn admin-btn--primary" onClick={createNote} disabled={saving}>📝 New Note</button>
      </div>

      {notes.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">📓</div>
          <div className="admin-empty__title">No notes yet</div>
          <div className="admin-empty__desc">Use the &ldquo;📓 Write in Fieldbook&rdquo; button on any page to capture notes with auto-context, or create a blank note here.</div>
        </div>
      ) : (
        <div className="fieldbook__list">
          {notes.map(note => (
            <div key={note.id} className="fieldbook__note">
              <div className="fieldbook__note-info">
                <div className="fieldbook__note-title">{note.title}</div>
                <div className="fieldbook__note-meta">
                  📅 {new Date(note.created_at).toLocaleString()}
                  {note.context_label && <> · 📍 {note.context_label}</>}
                </div>
                {note.content && (
                  <div className="fieldbook__note-preview">
                    {note.content.substring(0, 180)}{note.content.length > 180 ? '...' : ''}
                  </div>
                )}
              </div>
              <div className="fieldbook__note-actions">
                <button className="manage__item-btn" onClick={() => { setEditing(note); setEditTitle(note.title); setEditContent(note.content); }}>✏️ Edit</button>
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => deleteNote(note.id)}>🗑 Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
