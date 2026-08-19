// app/admin/components/projects/ProjectFilesPanel.tsx — the engagement's own documents.
//
// Owner, 2026-08-19: *"I also need to be able to upload images and files and stuff to the
// project/job… Please make it plain in the project/job workflow where I can quickly open up the
// files/images related to the current job, and from there I should also be able to view all of the
// files on the platform if I want to."*
//
// ── WHAT THIS HOLDS, AND WHAT IT DOES NOT ───────────────────────────────────────────────────────
//
// The PROJECT's own documents — the signed contract, the title commitment, the client's deed. Not
// the union of its jobs' files: that lives in the project's folder in the File Explorer, and the
// link to it is right here. Two different questions, and a panel that answered both would answer
// neither, because "the contract" would be lost among forty field photos.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, FileText, Image as ImageIcon, Download, Trash2, FolderOpen, Files } from 'lucide-react';
import { uploadProjectFileBytes } from '@/lib/jobs/upload-client';

interface ProjectFile {
  id: string;
  file_name: string;
  file_type: string;
  mime_type?: string | null;
  file_size?: number | null;
  description?: string | null;
  uploaded_by: string;
  uploaded_at: string;
  download_href?: string | null;
}

function human(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const isImage = (f: ProjectFile) =>
  (f.mime_type ?? '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.file_name);

export default function ProjectFilesPanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/jobs/files?project_id=${projectId}`);
    setLoading(false);
    if (!res.ok) { setError('Could not load the project’s files.'); return; }
    setFiles((await res.json()).files ?? []);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Awaited per file, and the form is only cleared once the row exists. The job page's old uploader
  // hid itself after a fixed 500ms, so a failure looked exactly like a success.
  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const chosen = Array.from(list);
    for (let i = 0; i < chosen.length; i += 1) {
      const file = chosen[i];
      try {
        setBusy(`Uploading ${file.name} (${i + 1}/${chosen.length})…`);
        const { file_id, storage_path, storage_bucket } = await uploadProjectFileBytes(projectId, file, (pct) =>
          setBusy(`Uploading ${file.name} (${i + 1}/${chosen.length})… ${pct}%`));
        const res = await fetch('/api/admin/jobs/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId, file_id, storage_path, storage_bucket,
            file_name: file.name, file_type: isImageName(file.name) ? 'photo' : 'document',
            file_size: file.size, mime_type: file.type, section: 'project',
          }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `Could not save ${file.name}.`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not upload ${file.name}.`);
        break;
      }
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = '';
    void load();
  }

  async function remove(f: ProjectFile) {
    if (!window.confirm(`Delete "${f.file_name}"?`)) return;
    const res = await fetch(`/api/admin/jobs/files?id=${f.id}`, { method: 'DELETE' });
    if (!res.ok) { setError('Could not delete that file.'); return; }
    void load();
  }

  return (
    <div className="pd__card">
      <h3><Files size={15} aria-hidden /> Project files</h3>

      <label className={`proj-page__btn proj-page__btn--secondary pfiles__upload${busy ? ' is-busy' : ''}`} data-testid="project-upload-label">
        <Upload size={15} aria-hidden /> {busy ? 'Uploading…' : 'Upload to this project'}
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => upload(e.target.files)}
          disabled={Boolean(busy)}
          style={{ display: 'none' }}
          data-testid="project-upload-input"
        />
      </label>
      {busy && <p className="pd__note" data-testid="project-upload-progress">{busy}</p>}
      {error && <p className="proj-page__error" role="alert">{error}</p>}

      {loading && <p className="pd__note">Loading…</p>}
      {!loading && files.length === 0 && (
        <p className="pd__note">
          Nothing filed against the project itself yet — the contract, the title commitment, the
          deed. Files attached to individual jobs live in each job.
        </p>
      )}

      {files.length > 0 && (
        <ul className="pfiles" data-testid="project-files">
          {files.map((f) => (
            <li key={f.id} className="pfiles__item">
              <span className="pfiles__icon">
                {isImage(f) ? <ImageIcon size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
              </span>
              <span className="pfiles__name">
                {f.file_name}
                <span className="pfiles__meta">{human(f.file_size)}{f.file_size ? ' · ' : ''}{f.uploaded_by}</span>
              </span>
              <span className="pfiles__actions">
                {f.download_href && (
                  <a className="pfiles__btn" href={f.download_href} target="_blank" rel="noreferrer" title={`Download ${f.file_name}`} aria-label={`Download ${f.file_name}`}>
                    <Download size={14} aria-hidden />
                  </a>
                )}
                <button type="button" className="pfiles__btn pfiles__btn--danger" onClick={() => remove(f)} title={`Delete ${f.file_name}`} aria-label={`Delete ${f.file_name}`}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The two ways out, both asked for: everything for THIS engagement, and everything at all. */}
      <p className="pd__line pfiles__links">
        <FolderOpen size={13} aria-hidden />
        <Link href={`/admin/files?node=mnt:projects:${projectId}`} data-testid="project-files-link">
          Open this project&rsquo;s folder
        </Link>
      </p>
      <p className="pd__line pfiles__links">
        <Files size={13} aria-hidden />
        <Link href="/admin/files" data-testid="project-all-files-link">Browse all files on the platform</Link>
      </p>
      <p className="pd__note">The folder holds every job&rsquo;s files, photos, receipts and drawings too.</p>
    </div>
  );
}

function isImageName(n: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$/i.test(n);
}
