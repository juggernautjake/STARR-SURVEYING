'use client';
// app/admin/components/jobs/FileViewer.tsx — the job / project / photo-gallery viewer, now the SHARED
// viewer wearing this file's old props.
//
// Owner, 2026-09-09: one file viewer everywhere. The three callers (JobFileManager, JobPhotoGallery,
// ProjectFilesPanel) keep the props they had — `file`, `files`, `onClose`, `onSelect`, `onPatched`,
// `onDelete` — and this module maps them onto app/admin/components/files/FileViewer.tsx through the
// job-file adapter. What the old 577-line viewer did on its own (zoom, pan, rotate, iframe PDFs, a
// details rail) the shared one does for every surface, with pdf.js pages, a single Save-as button
// that opens the OS dialog, notes, tags, and move / copy to another job or project.

import React, { useMemo } from 'react';
import SharedFileViewer from '@/app/admin/components/files/FileViewer';
import FileComments from '@/app/admin/components/files/FileComments';
import { jobFileToViewerFile, jobFileCapabilities, type JobFileLike } from '@/lib/files/adapters/job-file';
import { fileKind } from '@/lib/files/viewer-model';
import type { DetailsFile } from './FileDetailsPanel';

export interface ViewerFile extends DetailsFile {
  file_url?: string;
  /** Resolved by `GET /api/admin/jobs/files` — works for every row shape. */
  download_href?: string | null;
  file_type: string;
  mime_type?: string;
  section?: string | null;
  job_id?: string | null;
  project_id?: string | null;
  file_node_id?: string | null;
  linked_file?: { available?: boolean } | null;
}

export interface FileViewerProps {
  /** The file to show. */
  file: ViewerFile;
  /** The rest of the list, for stepping. Omitted means a single-file viewer. */
  files?: ViewerFile[];
  onClose: () => void;
  /** Called when the viewer steps to another file, so the caller owns which one is open. */
  onSelect?: (file: ViewerFile) => void;
  /** A rename, note or tag change, so the list behind the viewer updates without a refetch. */
  onPatched?: (id: string, patch: Partial<ViewerFile>) => void;
  /** Delete this file. The control only appears when a handler is given. */
  onDelete?: (file: ViewerFile) => void;
}

/** Kept for the callers that import it. */
export function isImageFile(name: string, mime?: string | null): boolean {
  return fileKind(name, mime) === 'image';
}

export function getFileCategory(name: string, mime?: string | null): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  return fileKind(name, mime);
}

export default function FileViewer({ file, files, onClose, onSelect, onPatched, onDelete }: FileViewerProps) {
  const list = useMemo(() => {
    const base = files && files.length > 0 ? files : [file];
    return base.some((f) => f.id === file.id) ? base : [file, ...base];
  }, [file, files]);
  const rowFor = (id: string) => list.find((f) => f.id === id) as JobFileLike | undefined;

  const collection = useMemo(() => ({
    id: file.job_id ?? file.project_id ?? 'files',
    title: file.section ? `${file.section} files` : 'Files',
    files: list.map((f) => jobFileToViewerFile(f as JobFileLike)),
  }), [list, file.job_id, file.project_id, file.section]);

  const capabilities = useMemo(() => jobFileCapabilities({
    rowFor,
    onPatched: (row) => onPatched?.(row.id, row as Partial<ViewerFile>),
    onDelete: onDelete ? async (id) => { const row = rowFor(id); if (row) onDelete(row as ViewerFile); } : undefined,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, onPatched, onDelete]);

  return (
    <SharedFileViewer
      collection={collection}
      fileId={file.id}
      capabilities={capabilities}
      onClose={onClose}
      onCurrentChange={(id) => { const row = rowFor(id); if (row && row.id !== file.id) onSelect?.(row as ViewerFile); }}
      extra={(f) => <FileComments subjectType="job_file" subjectId={f.id} />}
    />
  );
}
