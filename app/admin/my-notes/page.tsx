// app/admin/my-notes/page.tsx — Personal notes for the current user
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

interface PersonalNote {
  id: string;
  title: string;
  content: string;
  color: string;
  is_pinned: boolean;
  job_id?: string;
  job_name?: string;
  created_at: string;
  updated_at: string;
}

const NOTE_COLORS = [
  { key: 'default', label: 'Default', color: '#F9FAFB' },
  { key: 'yellow', label: 'Yellow', color: '#FEF9C3' },
  { key: 'blue', label: 'Blue', color: '#DBEAFE' },
  { key: 'green', label: 'Green', color: '#D1FAE5' },
  { key: 'pink', label: 'Pink', color: '#FCE7F3' },
  { key: 'purple', label: 'Purple', color: '#EDE9FE' },
];

export default function MyNotesPage() {
  const { data: session } = useSession();
  const [notes] = useState<PersonalNote[]>([]);
  const [search, setSearch] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editorForm, setEditorForm] = useState({ title: '', content: '', color: 'default' });

  if (!session?.user) return null;

  const filtered = notes.filter(n => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned = filtered.filter(n => n.is_pinned);
  const unpinned = filtered.filter(n => !n.is_pinned);

  return (
    <>
      <UnderConstruction
        feature="My Notes"
        description="Personal notes for your own use. Jot down field observations, reminders, calculations, and quick thoughts. Link notes to specific jobs for easy reference."
      />

      <div className="jobs-page">
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">My Notes</h2>
            <span className="jobs-page__count">{notes.length} notes</span>
          </div>
          <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => setShowEditor(!showEditor)}>
            + New Note
          </button>
        </div>

        {/* Search */}
        <div className="jobs-page__controls">
          <form className="jobs-page__search-form" onSubmit={e => e.preventDefault()}>
            <input
              className="jobs-page__search"
              placeholder="Search your notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>
        </div>

        {/* Quick-add note */}
        {showEditor && (
          <div className="job-form" style={{ marginBottom: '1.5rem' }}>
            <div className="job-form__section">
              <h3 className="job-form__section-title">New Note</h3>
              <div className="job-form__grid">
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Title</label>
                  <input className="job-form__input" value={editorForm.title} onChange={e => setEditorForm(f => ({ ...f, title: e.target.value }))} placeholder="Note title (optional)" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Color</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {NOTE_COLORS.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setEditorForm(f => ({ ...f, color: c.key }))}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: editorForm.color === c.key ? '2px solid #1D3095' : '1px solid #D1D5DB',
                          background: c.color, cursor: 'pointer',
                        }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Content</label>
                  <textarea className="job-form__textarea" value={editorForm.content} onChange={e => setEditorForm(f => ({ ...f, content: e.target.value }))} rows={5} placeholder="Write your note..." />
                </div>
              </div>
              <div className="job-form__actions">
                <button className="job-form__cancel" onClick={() => setShowEditor(false)}>Cancel</button>
                <button className="job-form__submit" disabled>Save Note</button>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {filtered.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">📒</span>
            <h3>No notes yet</h3>
            <p>Create personal notes for field observations, reminders, and quick thoughts.</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="jobs-page__section">
                <h3 className="jobs-page__section-title">Pinned</h3>
                <div className="jobs-page__grid">
                  {pinned.map(note => (
                    <div key={note.id} className="job-card" style={{ background: NOTE_COLORS.find(c => c.key === note.color)?.color || '#F9FAFB' }}>
                      <h3 className="job-card__name">{note.title || 'Untitled'}</h3>
                      <p className="job-card__client" style={{ WebkitLineClamp: 4, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.content}</p>
                      {note.job_name && <p className="job-card__address">Job: {note.job_name}</p>}
                      <div className="job-card__footer">
                        <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="jobs-page__grid">
              {unpinned.map(note => (
                <div key={note.id} className="job-card" style={{ background: NOTE_COLORS.find(c => c.key === note.color)?.color || '#F9FAFB' }}>
                  <h3 className="job-card__name">{note.title || 'Untitled'}</h3>
                  <p className="job-card__client" style={{ WebkitLineClamp: 4, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.content}</p>
                  {note.job_name && <p className="job-card__address">Job: {note.job_name}</p>}
                  <div className="job-card__footer">
                    <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">My Notes — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Database Table:</strong> Create <code>user_notes</code> table: id, user_email, title, content, color, is_pinned, job_id (FK nullable), created_at, updated_at</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/my-notes/route.ts</code> — CRUD scoped to current user, search, pin/unpin, link to job</li>
            <li><strong>Rich Text:</strong> Integrate TipTap editor for formatted notes with images and checklists</li>
            <li><strong>Job Linking:</strong> Associate notes with specific jobs via dropdown selector</li>
            <li><strong>Offline Support:</strong> Cache notes in localStorage for field use without connectivity</li>
            <li><strong>Quick Capture:</strong> Voice-to-text note capture for field workers</li>
            <li><strong>Photo Notes:</strong> Attach photos with annotations to notes</li>
            <li><strong>Export:</strong> Export notes as PDF or share with team</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build My Notes at /admin/my-notes/page.tsx.

CURRENT STATE: UI shell with search, note editor form (not connected), color picker, pinned/unpinned layout. No database or API.

DATABASE SCHEMA NEEDED:
CREATE TABLE user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT,
  content TEXT,
  color TEXT DEFAULT 'default',
  is_pinned BOOLEAN DEFAULT false,
  job_id UUID REFERENCES jobs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_notes_email ON user_notes(user_email);

NEXT STEPS:
1. Create user_notes table in Supabase
2. Build /api/admin/my-notes/route.ts with CRUD scoped to current user
3. Connect UI to API
4. Integrate TipTap rich text editor
5. Add job linking dropdown
6. Add note color coding and pinning
7. Build offline caching with localStorage/IndexedDB
8. Add voice-to-text capture
9. Add photo attachments with annotations
10. Build export to PDF`}</pre>
        </div>
      </div>
    </>
  );
}
