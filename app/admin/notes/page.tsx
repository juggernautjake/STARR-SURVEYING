// app/admin/notes/page.tsx — Company Notes (admin view)
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { key: 'general', label: 'General', color: '#6B7280' },
  { key: 'procedures', label: 'Procedures', color: '#1D3095' },
  { key: 'safety', label: 'Safety', color: '#EF4444' },
  { key: 'equipment', label: 'Equipment', color: '#D97706' },
  { key: 'legal', label: 'Legal', color: '#7C3AED' },
  { key: 'hr', label: 'HR', color: '#059669' },
  { key: 'training', label: 'Training', color: '#0891B2' },
];

export default function CompanyNotesPage() {
  const { data: session } = useSession();
  const [notes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editorForm, setEditorForm] = useState({ title: '', content: '', category: 'general' });

  if (!session?.user) return null;

  const filtered = notes.filter(n => {
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter(n => n.is_pinned);
  const unpinned = filtered.filter(n => !n.is_pinned);

  return (
    <>
      <UnderConstruction
        feature="Company Notes"
        description="Shared company-wide notes for procedures, safety guidelines, equipment instructions, and important announcements visible to all team members."
      />

      <div className="jobs-page">
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">Company Notes</h2>
            <span className="jobs-page__count">{notes.length} notes</span>
          </div>
          <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => setShowEditor(!showEditor)}>
            + New Note
          </button>
        </div>

        {/* Category filter */}
        <div className="jobs-page__pipeline">
          <button
            className={`jobs-page__pipeline-stage ${categoryFilter === 'all' ? 'jobs-page__pipeline-stage--active' : ''}`}
            onClick={() => setCategoryFilter('all')}
            style={{ '--stage-color': '#374151' } as React.CSSProperties}
          >
            <span className="jobs-page__pipeline-label">All</span>
            <span className="jobs-page__pipeline-count">{notes.length}</span>
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              className={`jobs-page__pipeline-stage ${categoryFilter === c.key ? 'jobs-page__pipeline-stage--active' : ''}`}
              onClick={() => setCategoryFilter(categoryFilter === c.key ? 'all' : c.key)}
              style={{ '--stage-color': c.color } as React.CSSProperties}
            >
              <span className="jobs-page__pipeline-label">{c.label}</span>
              <span className="jobs-page__pipeline-count">{notes.filter(n => n.category === c.key).length}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="jobs-page__controls">
          <form className="jobs-page__search-form" onSubmit={e => e.preventDefault()}>
            <input
              className="jobs-page__search"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>
        </div>

        {/* Note editor */}
        {showEditor && (
          <div className="job-form" style={{ marginBottom: '1.5rem' }}>
            <div className="job-form__section">
              <h3 className="job-form__section-title">New Company Note</h3>
              <div className="job-form__grid">
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Title *</label>
                  <input className="job-form__input" value={editorForm.title} onChange={e => setEditorForm(f => ({ ...f, title: e.target.value }))} placeholder="Note title" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Category</label>
                  <select className="job-form__select" value={editorForm.category} onChange={e => setEditorForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Content</label>
                  <textarea className="job-form__textarea" value={editorForm.content} onChange={e => setEditorForm(f => ({ ...f, content: e.target.value }))} rows={6} placeholder="Write your note..." />
                </div>
              </div>
              <div className="job-form__actions">
                <button className="job-form__cancel" onClick={() => setShowEditor(false)}>Cancel</button>
                <button className="job-form__submit" disabled>Save Note</button>
              </div>
            </div>
          </div>
        )}

        {/* Notes list */}
        {filtered.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">📝</span>
            <h3>No notes yet</h3>
            <p>Create company-wide notes for procedures, safety guidelines, and announcements.</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="jobs-page__section">
                <h3 className="jobs-page__section-title">Pinned</h3>
                <div className="jobs-page__grid">
                  {pinned.map(note => (
                    <div key={note.id} className="job-card" style={{ borderLeft: `3px solid ${CATEGORIES.find(c => c.key === note.category)?.color || '#6B7280'}` }}>
                      <h3 className="job-card__name">{note.title}</h3>
                      <p className="job-card__client" style={{ WebkitLineClamp: 3, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.content}</p>
                      <div className="job-card__footer">
                        <span>{CATEGORIES.find(c => c.key === note.category)?.label}</span>
                        <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="jobs-page__section">
              <h3 className="jobs-page__section-title">All Notes</h3>
              <div className="jobs-page__grid">
                {unpinned.map(note => (
                  <div key={note.id} className="job-card" style={{ borderLeft: `3px solid ${CATEGORIES.find(c => c.key === note.category)?.color || '#6B7280'}` }}>
                    <h3 className="job-card__name">{note.title}</h3>
                    <p className="job-card__client" style={{ WebkitLineClamp: 3, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.content}</p>
                    <div className="job-card__footer">
                      <span>{CATEGORIES.find(c => c.key === note.category)?.label}</span>
                      <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Company Notes — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Database Table:</strong> Create <code>company_notes</code> table: id, title, content, category, is_pinned, created_by, created_at, updated_at</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/notes/route.ts</code> — CRUD operations, category filter, search, pin/unpin</li>
            <li><strong>Rich Text:</strong> Integrate TipTap editor (already in project) for rich text note content with images, links, formatting</li>
            <li><strong>File Attachments:</strong> Allow attaching files to notes (PDFs, images, documents)</li>
            <li><strong>Version History:</strong> Track note edits with revision history and diff view</li>
            <li><strong>Permissions:</strong> Control who can create, edit, and delete company notes</li>
            <li><strong>Comments:</strong> Allow team members to comment on notes for discussion</li>
            <li><strong>Templates:</strong> Pre-built note templates for common procedures</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build Company Notes at /admin/notes/page.tsx.

CURRENT STATE: UI shell with category filter pipeline, search, note editor form (not connected), pinned/unpinned sections. No database or API.

DATABASE SCHEMA NEEDED:
CREATE TABLE company_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  category TEXT CHECK (category IN ('general','procedures','safety','equipment','legal','hr','training')) DEFAULT 'general',
  is_pinned BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

NEXT STEPS:
1. Create company_notes table in Supabase
2. Build /api/admin/notes/route.ts with CRUD + pin/unpin
3. Connect UI to API for creating, editing, deleting notes
4. Integrate TipTap rich text editor (already in project dependencies)
5. Add file attachments to notes
6. Build note detail view with full content display
7. Add version history tracking
8. Add commenting on notes
9. Build procedure templates library
10. Add search with full-text search in Supabase`}</pre>
        </div>
      </div>
    </>
  );
}
