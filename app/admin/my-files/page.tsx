// app/admin/my-files/page.tsx — Personal file storage
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

interface UserFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  folder: string;
  description: string;
  uploaded_at: string;
}

const FOLDERS = [
  { key: 'all', label: 'All Files', icon: '📁' },
  { key: 'field-data', label: 'Field Data', icon: '📡' },
  { key: 'drawings', label: 'Drawings', icon: '📐' },
  { key: 'photos', label: 'Photos', icon: '📷' },
  { key: 'documents', label: 'Documents', icon: '📄' },
  { key: 'voice-memos', label: 'Voice Memos', icon: '🎤' },
  { key: 'other', label: 'Other', icon: '📦' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MyFilesPage() {
  const { data: session } = useSession();
  const [files] = useState<UserFile[]>([]);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [dragActive, setDragActive] = useState(false);

  if (!session?.user) return null;

  const filtered = files.filter(f => {
    if (folderFilter !== 'all' && f.folder !== folderFilter) return false;
    if (search && !f.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

  return (
    <>
      <UnderConstruction
        feature="My Files"
        description="Personal file storage for field data, photos, drawings, voice memos, and documents. Upload, organize, and access your files from anywhere."
      />

      <div className="jobs-page">
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">My Files</h2>
            <span className="jobs-page__count">{files.length} files ({formatFileSize(totalSize)})</span>
          </div>
          <button className="jobs-page__btn jobs-page__btn--primary">
            Upload Files
          </button>
        </div>

        {/* Folder filter */}
        <div className="jobs-page__pipeline">
          {FOLDERS.map(f => (
            <button
              key={f.key}
              className={`jobs-page__pipeline-stage ${folderFilter === f.key ? 'jobs-page__pipeline-stage--active' : ''}`}
              onClick={() => setFolderFilter(folderFilter === f.key ? 'all' : f.key)}
              style={{ '--stage-color': '#1D3095' } as React.CSSProperties}
            >
              <span className="jobs-page__pipeline-icon">{f.icon}</span>
              <span className="jobs-page__pipeline-label">{f.label}</span>
              <span className="jobs-page__pipeline-count">
                {f.key === 'all' ? files.length : files.filter(file => file.folder === f.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="jobs-page__controls">
          <form className="jobs-page__search-form" onSubmit={e => e.preventDefault()}>
            <input
              className="jobs-page__search"
              placeholder="Search files..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>
        </div>

        {/* Upload dropzone */}
        <div
          className={`job-import__dropzone ${dragActive ? 'job-import__dropzone--active' : ''}`}
          onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); setDragActive(false); }}
          style={{ marginBottom: '1.5rem' }}
        >
          <span style={{ fontSize: '2rem' }}>📁</span>
          <p><strong>Drop files here</strong> or click to browse</p>
          <p style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Supports all file types. Max 50MB per file.</p>
        </div>

        {/* Files list */}
        {filtered.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">📁</span>
            <h3>No files yet</h3>
            <p>Upload field data, photos, drawings, and other files.</p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
            {/* File list header */}
            <div className="job-detail__field-data-row job-detail__field-data-row--header">
              <span>Name</span>
              <span>Folder</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>Actions</span>
            </div>
            {filtered.map(file => (
              <div key={file.id} className="job-detail__field-data-row">
                <span>{file.file_name}</span>
                <span>{FOLDERS.find(f => f.key === file.folder)?.label || file.folder}</span>
                <span>{formatFileSize(file.file_size)}</span>
                <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
                <span>
                  <button className="fw__btn fw__btn--sm">Download</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">My Files — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Supabase Storage:</strong> Create a <code>user-files</code> storage bucket with per-user folder isolation</li>
            <li><strong>Database Table:</strong> Create <code>user_files</code> table: id, user_email, file_name, file_type, file_size, file_url, folder, description, uploaded_at</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/my-files/route.ts</code> — upload (multipart), list, download, delete, move between folders</li>
            <li><strong>File Upload:</strong> Integrate Supabase Storage for actual file upload/download with signed URLs</li>
            <li><strong>Preview:</strong> In-browser preview for images, PDFs, and text files</li>
            <li><strong>Drag & Drop:</strong> Connect drag-and-drop zone to actual upload handler</li>
            <li><strong>Sharing:</strong> Share files with team members via internal messaging</li>
            <li><strong>Sync:</strong> Auto-upload from field devices when connectivity is available</li>
            <li><strong>Versioning:</strong> File version tracking for drawings and documents</li>
            <li><strong>Storage Quota:</strong> Per-user storage limits with usage tracking</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build My Files at /admin/my-files/page.tsx.

CURRENT STATE: UI shell with folder filters, search, drag-and-drop upload zone (not connected), file list table. No storage or API.

SUPABASE STORAGE SETUP:
- Create 'user-files' bucket in Supabase Storage
- Set RLS: users can only access files in their own folder (email-based paths)
- Max file size: 50MB

DATABASE SCHEMA NEEDED:
CREATE TABLE user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  folder TEXT DEFAULT 'other',
  description TEXT,
  job_id UUID REFERENCES jobs(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_files_email ON user_files(user_email);

NEXT STEPS:
1. Create Supabase Storage bucket 'user-files' with RLS
2. Create user_files table
3. Build /api/admin/my-files/route.ts with upload/download/delete using Supabase Storage
4. Connect drag-and-drop upload to real file upload
5. Add file preview modal (images, PDFs)
6. Add folder management (create, rename, move files between)
7. Add file sharing via messaging
8. Add storage quota tracking per user
9. Build mobile-optimized upload from camera
10. Add auto-sync from field devices`}</pre>
        </div>
      </div>
    </>
  );
}
