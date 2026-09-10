'use client';
// app/admin/components/files/DownloadAllButton.tsx — "Download all" for a folder: one .zip, saved
// where the person chooses. Shared by every file surface (owner, 2026-09-09).

import React, { useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import { downloadZip, canChooseWhereToSave, type ZipEntry, type ZipProgress } from '@/lib/files/download';
import { zipName } from '@/lib/files/viewer-model';
import './FileViewer.css';

export interface DownloadAllButtonProps {
  /** The files of the folder currently on screen. Resolved when clicked, so the URLs are fresh. */
  getEntries: () => Promise<ZipEntry[]> | ZipEntry[];
  /** The folder's name — becomes "<name>.zip". */
  title: string;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export default function DownloadAllButton({ getEntries, title, className, label, disabled }: DownloadAllButtonProps) {
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setNote(null);
    setProgress({ done: 0, total: 0, current: '' });
    try {
      const entries = await getEntries();
      if (entries.length === 0) { setNote('Nothing to download in this folder.'); return; }
      const result = await downloadZip(entries, zipName(title), setProgress);
      if (result.outcome === 'cancelled' && result.included === 0) setNote('None of the files could be fetched.');
      else if (result.failed.length > 0) setNote(`${result.included} file(s) zipped; left out: ${result.failed.map((f) => f.name).join(', ')}.`);
      else if (result.outcome === 'saved') setNote(`Saved ${result.included} file(s) as one .zip.`);
      else if (result.outcome === 'downloaded') setNote(`Downloaded ${result.included} file(s) as one .zip.`);
    } catch (err) {
      setNote(`Could not build the .zip: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
      window.setTimeout(() => setNote(null), 6000);
    }
  };

  return (
    <span className="fv-dl-all">
      <button type="button" className={className ?? 'fv-btn'} onClick={run} disabled={disabled || progress !== null} title={canChooseWhereToSave() ? 'Choose where to save a .zip of every file in this folder' : 'Download every file in this folder as one .zip'}>
        {progress ? <Loader2 size={15} className="fv-spin motion-essential" aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
        {progress && progress.total > 0 ? `Zipping ${progress.done}/${progress.total}…` : (label ?? 'Download all')}
      </button>
      {note ? <span className="fv-dl-all__note" role="status">{note}</span> : null}
    </span>
  );
}
