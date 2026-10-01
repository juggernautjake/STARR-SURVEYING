'use client';
// app/admin/my-files/MyFilesPanel.tsx
//
// Personal file storage — upload/list/download/delete against the private
// user-files bucket via /api/admin/my-files.

import '../styles/AdminMyNotes.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFileSelection } from '../components/files/useFileSelection';
import { FileCheckbox, SelectAllCheckbox, SelectionBar } from '../components/files/SelectionControls';
import { useDeleteFiles } from '../components/files/useDeleteFiles';
import { useSession } from 'next-auth/react';
import {
  Folder, MapPin, DraftingCompass, Camera, FileText, Mic, Package,
  Upload, Loader2, FolderOpen, type LucideIcon,
} from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import RecentBadge from '../components/files/RecentBadge';
import { putWithProgress, startFailure } from '@/lib/jobs/upload-client';
import { asStep, classifyError, contentTypeForAnyFile, planSnapshots, runWithRetry, snapshotFile } from '@/lib/files/upload-resilience';
import { checkMyFilesUpload, MY_FILES_MAX_BYTES } from '@/lib/files/my-files-upload';

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

const FOLDERS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'all', label: 'All Files', Icon: Folder },
  { key: 'field-data', label: 'Field Data', Icon: MapPin },
  { key: 'drawings', label: 'Drawings', Icon: DraftingCompass },
  { key: 'photos', label: 'Photos', Icon: Camera },
  { key: 'documents', label: 'Documents', Icon: FileText },
  { key: 'voice-memos', label: 'Voice Memos', Icon: Mic },
  { key: 'other', label: 'Other', Icon: Package },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One file into My Files: sign → PUT straight to storage → save the row (2026-10-01).
 *
 * It used to POST the whole file as base64 JSON, which Vercel refuses above 4.5 MB — so anything
 * over ~3.3 MB failed while the page promised 50. Small files are copied into memory first (the
 * Android "changed after it was picked" failure), and a dropped connection is retried.
 */
async function uploadMyFile(file: File, folder: string): Promise<void> {
  const check = checkMyFilesUpload({ name: file.name, sizeBytes: file.size });
  if (!check.ok) throw new Error(check.error);
  let body: File = file;
  let buffered = false;
  if (planSnapshots([file.size])[0]) { body = await snapshotFile(file); buffered = true; }
  let path: string | null = null;
  await runWithRetry(async () => {
    if (!path) {
      const init = await asStep('start', () => fetch('/api/admin/my-files/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name, size_bytes: body.size }),
      }));
      if (!init.ok) throw await startFailure(init, body.name);
      const started = (await init.json()) as { path: string; signed_url: string };
      await putWithProgress(started.signed_url, body);
      path = started.path;
    }
    const res = await asStep('save', () => fetch('/api/admin/my-files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: path, name: body.name, size_bytes: body.size, mime_type: contentTypeForAnyFile(body.name, body.type), folder }),
    }));
    if (!res.ok) throw await startFailure(res, body.name, 'save');
  }, {
    classify: (err) => classifyError(err, { fileName: body.name, sizeBytes: body.size, buffered, online: navigator.onLine !== false }),
  });
}

const MAX_BYTES = MY_FILES_MAX_BYTES;

export default function MyFilesPanel() {
  const { data: session } = useSession();
  const { safeFetch, reportPageError } = usePageError('MyFilesPanel');
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
    const failed: string[] = [];
    try {
      for (const file of list) {
        if (file.size > MAX_BYTES) {
          window.alert(`"${file.name}" exceeds the 50MB limit and was skipped.`);
          continue;
        }
        // One file failing never stops the rest; each reason is collected and said once, in words.
        try {
          await uploadMyFile(file, targetFolder);
        } catch (err) {
          failed.push(err instanceof Error ? err.message : `"${file.name}" did not upload.`);
          reportPageError(err instanceof Error ? err : String(err), { element: `uploading ${file.name}` });
        }
      }
      await load();
      if (failed.length > 0) {
        const head = failed.length === 1 ? 'A file did not upload' : `${failed.length} files did not upload`;
        window.alert(`${head}:\n\n${failed.join('\n\n')}`);
      }
    } finally {
      setUploading(false);
    }
  }, [folderFilter, reportPageError, load]);

  const filtered = useMemo(() => files.filter(f => {
    if (folderFilter !== 'all' && f.folder !== folderFilter) return false;
    if (search && !f.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [files, folderFilter, search]);

  // Delete and multi-select (owner, 2026-09-27): one confirmation naming the files, the same
  // permission-checked API as every other file list, and a report of anything that failed.
  // My Files deletes are permanent, and the confirmation says so.
  const selection = useFileSelection(useMemo(() => filtered.map((f) => f.id), [filtered]));
  const deleter = useDeleteFiles({ onDone: () => { selection.clear(); void load(); } });
  const deleteFiles = (list: UserFile[]) => deleter.request(list.map((f) => ({ kind: 'user_file' as const, id: f.id, name: f.file_name })));

  if (!session?.user) return null;
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
            <span className="jobs-page__pipeline-icon"><f.Icon size={16} strokeWidth={1.75} /></span>
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
        <span style={{ color: 'var(--color-brand-navy, #1D3095)' }}><Upload size={30} strokeWidth={1.75} /></span>
        <p><strong>Drop files here</strong> or click to browse</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--theme-fg-muted, #9CA3AF)' }}>
          {folderFilter === 'all' ? 'Uploads go to “Other”.' : `Uploads go to “${FOLDERS.find(f => f.key === folderFilter)?.label}”.`} Supports all file types. Max 50MB per file.
        </p>
      </div>

      {/* Files list */}
      {loading ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon"><Loader2 size={28} className="animate-spin" /></span>
          <h3>Loading files…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon"><FolderOpen size={28} strokeWidth={1.5} /></span>
          <h3>{files.length === 0 ? 'No files yet' : 'No files match your filters'}</h3>
          <p>Upload field data, photos, drawings, and other files.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
          <div className="myfiles__select">
            <SelectAllCheckbox selection={selection} total={filtered.length} />
            <SelectionBar
              selection={selection}
              busy={deleter.busy}
              onDelete={() => deleteFiles(filtered.filter((f) => selection.isSelected(f.id)))}
              onDownload={() => {
                for (const f of filtered.filter((x) => selection.isSelected(x.id) && x.file_url)) window.open(f.file_url as string, '_blank', 'noopener');
              }}
            />
          </div>
          <div className="job-detail__field-data-row job-detail__field-data-row--header">
            <span>Name</span>
            <span>Folder</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>Actions</span>
          </div>
          {filtered.map(file => (
            <div key={file.id} className="job-detail__field-data-row">
              <span className="myfiles__name">
                <FileCheckbox id={file.id} name={file.file_name} selection={selection} />
                {file.file_name}
                <RecentBadge uploadedAt={file.uploaded_at} className="recent-badge--inline" />
              </span>
              <span>{FOLDERS.find(f => f.key === file.folder)?.label || file.folder}</span>
              <span>{formatFileSize(file.file_size || 0)}</span>
              <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                {file.file_url
                  ? <a className="fw__btn fw__btn--sm" href={file.file_url} target="_blank" rel="noopener noreferrer">Download</a>
                  : <button className="fw__btn fw__btn--sm" disabled>Download</button>}
                <button className="fw__btn fw__btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => deleteFiles([file])} aria-label={`Delete ${file.file_name}`}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {deleter.element}
    </div>
  );
}
