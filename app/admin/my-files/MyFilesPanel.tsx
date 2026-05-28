'use client';
// app/admin/my-files/MyFilesPanel.tsx
//
// Personal file storage — upload/list/download/delete against the private
// user-files bucket via /api/admin/my-files.

import '../styles/AdminMyNotes.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface UserFile {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  file_url: string | null;
  folder: string;
  description: string | null;
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

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 50 * 1024 * 1024;

export default function MyFilesPanel() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('MyFilesPanel');
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeFetch<{ files: UserFile[] }>('/api/admin/my-files');
      setFiles(res?.files ?? []);
    } finally {
      setLoading(false);
    }
  }, [safeFetch]);

  useEffect(() => { if (session?.user) void load(); }, [session?.user, load]);

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    // Files uploaded while a specific folder is selected land in that folder.
    const targetFolder = folderFilter === 'all' ? 'other' : folderFilter;
    setUploading(true);
    try {
      for (const file of list) {
        if (file.size > MAX_BYTES) {
          window.alert(`"${file.name}" exceeds the 50MB limit and was skipped.`);
          continue;
        }
        const dataUrl = await readAsDataURL(file);
        if (!dataUrl) continue;
        await safeAction(`uploading ${file.name}`, async () => {
          const res = await fetch('/api/admin/my-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl, name: file.name, folder: targetFolder }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
        });
      }
      await load();
    } finally {
      setUploading(false);
    }
  }, [folderFilter, safeAction, load]);

  async function deleteFile(id: string) {
    if (!window.confirm('Delete this file? This cannot be undone.')) return;
    await safeAction('deleting file', async () => {
      const res = await fetch(`/api/admin/my-files?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  if (!session?.user) return null;

  const filtered = files.filter(f => {
    if (folderFilter !== 'all' && f.folder !== folderFilter) return false;
    if (search && !f.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

  return (
    <div className="jobs-page">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        style={{ display: 'none' }}
        onChange={e => { const fs = e.target.files; e.currentTarget.value = ''; if (fs) void uploadFiles(fs); }}
      />

      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <h2 className="jobs-page__title">My Files</h2>
          <span className="jobs-page__count">{files.length} files ({formatFileSize(totalSize)})</span>
        </div>
        <button className="jobs-page__btn jobs-page__btn--primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload Files'}
        </button>
      </div>

      {/* Folder filter */}
      <div className="jobs-page__pipeline">
        {FOLDERS.map(f => (
          <button
            key={f.key}
            className={`jobs-page__pipeline-stage ${folderFilter === f.key ? 'jobs-page__pipeline-stage--active' : ''}`}
            onClick={() => setFolderFilter(folderFilter === f.key ? 'all' : f.key)}
            style={{ '--stage-color': 'var(--color-brand-navy)' } as React.CSSProperties}
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
        onClick={() => inputRef.current?.click()}
        onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files); }}
        style={{ marginBottom: '1.5rem', cursor: 'pointer' }}
      >
        <span style={{ fontSize: '2rem' }}>📁</span>
        <p><strong>Drop files here</strong> or click to browse</p>
        <p style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>
          {folderFilter === 'all' ? 'Uploads go to “Other”.' : `Uploads go to “${FOLDERS.find(f => f.key === folderFilter)?.label}”.`} Supports all file types. Max 50MB per file.
        </p>
      </div>

      {/* Files list */}
      {loading ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">⏳</span>
          <h3>Loading files…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">📁</span>
          <h3>{files.length === 0 ? 'No files yet' : 'No files match your filters'}</h3>
          <p>Upload field data, photos, drawings, and other files.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
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
              <span>{formatFileSize(file.file_size || 0)}</span>
              <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                {file.file_url
                  ? <a className="fw__btn fw__btn--sm" href={file.file_url} target="_blank" rel="noopener noreferrer">Download</a>
                  : <button className="fw__btn fw__btn--sm" disabled>Download</button>}
                <button className="fw__btn fw__btn--sm" style={{ color: '#EF4444' }} onClick={() => void deleteFile(file.id)}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
