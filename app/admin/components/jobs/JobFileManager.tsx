// app/admin/components/jobs/JobFileManager.tsx — File management with viewer + multi upload
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { uploadJobFileBytes } from '@/lib/jobs/upload-client';
import { Loader2, FolderOpen, Eye, Download, Trash2, Link2, MessageSquare, Tag } from 'lucide-react';
import FileViewer, { isImageFile } from './FileViewer';
import FilePicker from '@/app/admin/components/files/FilePicker';
import { matchesTags, tagFacets } from '@/lib/files/labels';

interface JobFile {
  id: string;
  file_name: string;
  file_type: string;
  file_url?: string;
  /** Resolved by `GET /api/admin/jobs/files`: works whether the bytes are a storage object, a
   *  legacy `data:` URI, or a linked File Explorer document. */
  download_href?: string | null;
  file_size?: number;
  mime_type?: string;
  section: string;
  description?: string;
  uploaded_by: string;
  uploaded_at: string;
  is_backup: boolean;
  /** seeds/607 — what a person renamed this to. `file_name` keeps the uploaded name. */
  label?: string | null;
  /** seeds/607 — free-text tags, already normalised by the server. */
  tags?: string[] | null;
  /** F5 — set when this row REFERENCES a File Explorer document instead of carrying its own bytes. */
  file_node_id?: string | null;
  /** Annotated by `GET /api/admin/jobs/files`. `available: false` means the document was deleted or
   *  the viewer cannot see it — the row still exists and is labelled rather than dropped. */
  linked_file?: {
    id: string;
    name: string;
    mime_type: string | null;
    size_bytes: number | null;
    available: boolean;
  } | null;
}

const FILE_TYPES: Record<string, { label: string; icon: string }> = {
  drawing: { label: 'Drawing', icon: '\u{1F4D0}' },
  field_data: { label: 'Field Data', icon: '\u{1F4CA}' },
  image: { label: 'Image', icon: '\u{1F5BC}' },
  satellite_image: { label: 'Satellite Image', icon: '\u{1F6F0}' },
  voice_memo: { label: 'Voice Memo', icon: '\u{1F399}' },
  document: { label: 'Document', icon: '\u{1F4C4}' },
  deed: { label: 'Deed', icon: '\u{1F4DC}' },
  plat: { label: 'Plat', icon: '\u{1F5FA}' },
  legal: { label: 'Legal', icon: '\u2696' },
  cad: { label: 'CAD File', icon: '\u{1F4BB}' },
  trimble: { label: 'Trimble Data', icon: '\u{1F4E1}' },
  backup: { label: 'Backup', icon: '\u{1F4BE}' },
  other: { label: 'Other', icon: '\u{1F4CE}' },
};

const FILE_TYPE_ICONS: Record<string, string> = {
  drawing: '\u{1F4D0}',
  field_data: '\u{1F4CA}',
  image: '\u{1F5BC}',
  satellite_image: '\u{1F6F0}',
  voice_memo: '\u{1F399}',
  document: '\u{1F4C4}',
  deed: '\u{1F4DC}',
  plat: '\u{1F5FA}',
  legal: '\u2696\uFE0F',
  cad: '\u{1F4BB}',
  trimble: '\u{1F4E1}',
  backup: '\u{1F4BE}',
  other: '\u{1F4CE}',
};

const SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'research', label: 'Research' },
  { key: 'fieldwork', label: 'Field Work' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'legal', label: 'Legal' },
  { key: 'delivery', label: 'Delivery' },
];

// Auto-detect file type from extension
function detectFileType(fileName: string): string {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff'].includes(ext)) return 'image';
  if (['.dwg', '.dxf', '.dgn'].includes(ext)) return 'cad';
  if (['.jxl', '.dc', '.job', '.vce'].includes(ext)) return 'trimble';
  if (['.pdf'].includes(ext)) return 'document';
  if (['.doc', '.docx', '.rtf', '.odt'].includes(ext)) return 'document';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'field_data';
  if (['.mp3', '.wav', '.m4a', '.ogg'].includes(ext)) return 'voice_memo';
  if (['.tif', '.tiff', '.sid', '.ecw', '.jp2'].includes(ext)) return 'satellite_image';
  return 'other';
}

interface Props {
  files: JobFile[];
  onUpload?: (file: {
    file_name: string; file_type: string; file_size: number; mime_type?: string;
    section: string; description: string;
    /** The storage shape — the id the upload route minted and the key the bytes went to. */
    file_id?: string; storage_path?: string;
    /** Legacy only. Kept so a caller that has not been given a `jobId` still works. */
    file_url?: string;
  }) => void;
  /** Required for real uploads. Without it the component falls back to the old inline path, which
   *  is what every byte in this table used to be — see `lib/jobs/file-storage.ts`. */
  jobId?: string;
  onDelete?: (id: string) => void;
  activeSection?: string;
  /**
   * F5 — attach an existing File Explorer document instead of uploading bytes. Optional so the
   * component keeps working unchanged on any page that has not wired it; the button only appears when
   * a handler is supplied, rather than rendering a control that silently does nothing.
   */
  onAttachFromFiles?: (attach: { file_node_id: string; file_name: string; file_type: string; section: string; description: string }) => void;
}

export default function JobFileManager({ files, onUpload, onDelete, activeSection, onAttachFromFiles, jobId }: Props) {
  const [section, setSection] = useState(activeSection || 'general');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('document');
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [viewingFile, setViewingFile] = useState<JobFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  /** Tags currently narrowing the list. AND, not OR — see `matchesTags`. */
  const [activeTags, setActiveTags] = useState<string[]>([]);
  /** How many notes each file has, so a row can say so without a request per row. */
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  /**
   * Local overlay of edits made in the viewer.
   *
   * `files` is a prop owned by the page, and a rename made in the viewer must show in the list
   * behind it immediately. Refetching the whole job to see one new name is both slower and visibly
   * jumpy, so the patch is held here and merged on read.
   */
  const [patched, setPatched] = useState<Record<string, Partial<JobFile>>>({});

  const merged = useMemo(
    () => files.map((f) => (patched[f.id] ? { ...f, ...patched[f.id] } : f)),
    [files, patched],
  );

  const sectionFiles = useMemo(
    () => merged.filter(f => (!activeSection || f.section === section) && matchesTags(f, activeTags)),
    [merged, activeSection, section, activeTags],
  );

  // Facets come from the SECTION's files ignoring the tag filter, so selecting a tag does not
  // remove the other tags from the bar and strand the person with no way to widen the list again.
  const facets = useMemo(
    () => tagFacets(merged.filter(f => !activeSection || f.section === section)),
    [merged, activeSection, section],
  );

  // One request for the whole visible list. Keyed on the ids so it re-runs when files are added or
  // removed, not on every render.
  const idKey = useMemo(() => sectionFiles.map(f => f.id).sort().join(','), [sectionFiles]);
  const loadNoteCounts = useCallback(async () => {
    if (!idKey) { setNoteCounts({}); return; }
    try {
      const res = await fetch(`/api/admin/files/comments?subject_type=job_file&subject_ids=${encodeURIComponent(idKey)}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setNoteCounts(body.counts ?? {});
    } catch {
      // A missing badge is not worth an error state — the notes themselves are still one click away.
    }
  }, [idKey]);
  useEffect(() => { void loadNoteCounts(); }, [loadNoteCounts]);

  function toggleTag(tag: string) {
    setActiveTags(t => (t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag]));
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ── THE BYTES GO TO STORAGE NOW, NOT INTO A DATABASE COLUMN (2026-08-19) ────────────────────
  //
  // This used to be `FileReader.readAsDataURL` → the whole file, base64, posted as JSON and stored
  // in `job_files.file_url`. Two things were wrong with that and neither announced itself: a 10 MB
  // PDF became ~13 MB of text on a row that every file list pulls, and the File Explorer — which
  // reads storage objects — could not see a single attachment the job page had ever made.
  //
  // It is also now AWAITED. The old version fired one FileReader per file and hid the form after a
  // fixed 500 ms, so a failure looked exactly like a success: the form closed, the list reloaded,
  // and the file simply was not there.
  async function uploadMany(list: FileList) {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;

    setUploading(true);
    setUploadCount(chosen.length);
    setUploadError(null);

    let done = 0;
    for (const file of chosen) {
      const detectedType = detectFileType(file.name);
      const file_type = uploadType === 'document' ? detectedType : uploadType;
      try {
        if (jobId) {
          setUploadNote(`Uploading ${file.name} (${done + 1}/${chosen.length})…`);
          const { file_id, storage_path } = await uploadJobFileBytes(jobId, file, (pct) =>
            setUploadNote(`Uploading ${file.name} (${done + 1}/${chosen.length})… ${pct}%`),
          );
          await onUpload?.({
            file_name: file.name, file_type, file_size: file.size, mime_type: file.type,
            section, description, file_id, storage_path,
          });
        } else {
          // No job id supplied: the old inline path, so an unwired caller still works rather than
          // silently dropping the file.
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
            reader.readAsDataURL(file);
          });
          await onUpload?.({
            file_name: file.name, file_type, file_size: file.size, mime_type: file.type,
            section, description, file_url: dataUrl,
          });
        }
        done += 1;
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : `Could not upload ${file.name}.`);
        break;
      }
    }

    setUploading(false);
    setUploadCount(0);
    setUploadNote(null);
    if (done === chosen.length) {
      setDescription('');
      setShowUpload(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) void uploadMany(e.dataTransfer.files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    void uploadMany(fileList);
    e.target.value = '';
  }

  function hrefOf(file: JobFile): string | null {
    return (file.download_href ?? file.file_url) || null;
  }

  function canPreview(file: JobFile): boolean {
    if (!hrefOf(file)) return false;
    return isImageFile(file.file_name, file.mime_type) ||
      file.file_name.toLowerCase().endsWith('.pdf') ||
      file.file_name.toLowerCase().endsWith('.txt') ||
      file.file_name.toLowerCase().endsWith('.csv');
  }

  return (
    <div className="job-files">
      <div className="job-files__header">
        <h3 className="job-files__title">Files & Documents</h3>
        <span className="job-files__count">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        {onUpload && (
          <button className="job-files__upload-btn" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? 'Cancel' : '+ Upload'}
          </button>
        )}
        {/* F5 — the second way a file gets onto a job. Deliberately a peer of Upload rather than an
            option buried inside the upload form: "this document already exists" is a different
            intention from "here are some bytes", and the whole point is not to make a second copy. */}
        {onAttachFromFiles && (
          <button
            className="job-files__upload-btn job-files__attach-btn"
            onClick={() => setShowPicker(true)}
            title="Link a document that already lives in the File Explorer — no copy is made"
          >
            <Link2 size={14} aria-hidden /> Attach from Files
          </button>
        )}
      </div>

      {!activeSection && (
        <div className="job-files__sections">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              className={`job-files__section-tab ${section === s.key ? 'job-files__section-tab--active' : ''}`}
              onClick={() => setSection(s.key)}
            >
              {s.label}
              <span className="job-files__section-count">
                {files.filter(f => f.section === s.key).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* A failed upload has to say so. The old path hid the form on a timer whether or not
          anything arrived, so "it didn't upload" and "it uploaded" looked identical. */}
      {uploadError && (
        <div className="job-files__upload-error" role="alert">{uploadError}</div>
      )}

      {showUpload && (
        <div className="job-files__upload-form">
          <div className="job-files__upload-row">
            <select
              className="job-files__type-select"
              value={uploadType}
              onChange={e => setUploadType(e.target.value)}
            >
              {Object.entries(FILE_TYPES).filter(([k]) => k !== 'backup').map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <input
              className="job-files__desc-input"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div
            className={`job-files__drop-zone ${dragActive ? 'job-files__drop-zone--active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <>
                <span className="job-files__drop-icon"><Loader2 size={24} strokeWidth={2} className="animate-spin" /></span>
                {/* The per-file line, with a percentage on the file being sent. A 90 MB drawing is
                    now a real upload rather than an instant base64 read, so a spinner with no
                    progress behind it is indistinguishable from a hang. */}
                <p className="job-files__drop-text">
                  {uploadNote ?? `Uploading ${uploadCount} file${uploadCount !== 1 ? 's' : ''}…`}
                </p>
              </>
            ) : (
              <>
                <span className="job-files__drop-icon"><FolderOpen size={24} strokeWidth={1.75} /></span>
                <p className="job-files__drop-text">Drag & drop files here or click to browse</p>
                <p className="job-files__drop-sub">Supports images, PDFs, Word docs, CAD files, and more. Multiple files OK.</p>
              </>
            )}
            <input
              type="file"
              className="job-files__file-input"
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx,.dwg,.dxf,.dgn,.jxl,.dc,.job"
            />
          </div>
        </div>
      )}

      {/* Tag filter. Rendered only once tags exist, so a job nobody has tagged shows no empty
          furniture. Counts come from the section ignoring the current selection — see `facets`. */}
      {facets.length > 0 && (
        <div className="job-files__tagbar">
          <span className="job-files__tagbar-icon" aria-hidden><Tag size={12} /></span>
          {facets.map(({ tag, count }) => (
            <button
              key={tag}
              className={`job-files__tag${activeTags.includes(tag) ? ' job-files__tag--on' : ''}`}
              onClick={() => toggleTag(tag)}
              aria-pressed={activeTags.includes(tag)}
            >
              {tag} <span className="job-files__tag-count">{count}</span>
            </button>
          ))}
          {activeTags.length > 0 && (
            <button className="job-files__tag-clear" onClick={() => setActiveTags([])}>Clear</button>
          )}
        </div>
      )}

      {sectionFiles.length === 0 ? (
        <div className="job-files__empty">
          {activeTags.length > 0
            ? `No files in this section tagged ${activeTags.join(' + ')}.`
            : 'No files in this section'}
        </div>
      ) : (
        <div className="job-files__list">
          {sectionFiles.map(file => {
            const typeIcon = FILE_TYPE_ICONS[file.file_type] || FILE_TYPE_ICONS.other;
            const typeLabel = FILE_TYPES[file.file_type]?.label || 'Other';
            const previewing = canPreview(file);
            const isImage = isImageFile(file.file_name, file.mime_type);

            return (
              <div key={file.id} className="job-files__item">
                {/* Thumbnail for images */}
                {isImage && file.file_url ? (
                  <button
                    className="job-files__thumb"
                    onClick={() => setViewingFile(file)}
                    title="Click to view"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.file_name} className="job-files__thumb-img" />
                  </button>
                ) : (
                  <span className="job-files__item-icon">{typeIcon}</span>
                )}
                <div className="job-files__item-info">
                  <span className="job-files__item-name">
                    {previewing ? (
                      <button
                        className="job-files__view-link"
                        onClick={() => setViewingFile(file)}
                      >
                        {/* The label, when there is one. The uploaded name is still shown in the
                            meta line below, so the file the phone made stays findable. */}
                        {file.label?.trim() || file.file_name}
                      </button>
                    ) : (
                      file.label?.trim() || file.file_name
                    )}
                    {noteCounts[file.id] > 0 && (
                      <span className="job-files__notes" title={`${noteCounts[file.id]} note${noteCounts[file.id] === 1 ? '' : 's'}`}>
                        <MessageSquare size={11} aria-hidden /> {noteCounts[file.id]}
                      </span>
                    )}
                  </span>
                  <span className="job-files__item-meta">
                    {typeLabel} {formatFileSize(file.file_size ?? file.linked_file?.size_bytes ?? undefined) && `\u00B7 ${formatFileSize(file.file_size ?? file.linked_file?.size_bytes ?? undefined)}`} {'\u00B7'} {new Date(file.uploaded_at).toLocaleDateString()}
                  </span>
                  {/* F5 \u2014 say plainly that this is a link, not a copy. Without this the row is
                      indistinguishable from an upload, and someone would reasonably assume deleting it
                      from the job deletes the document (it does not) or that editing the document
                      leaves the job's copy behind (there is no copy). The unavailable case is shown
                      rather than hidden: an attachment whose document was deleted or whose permissions
                      changed is information, and silently dropping the row would look like the attach
                      never happened. */}
                  {file.file_node_id && (
                    file.linked_file?.available ? (
                      <span className="job-files__item-linked">
                        <Link2 size={11} aria-hidden /> Linked from Files \u2014 no copy stored
                      </span>
                    ) : (
                      <span className="job-files__item-linked job-files__item-linked--gone">
                        <Link2 size={11} aria-hidden /> Linked document is unavailable \u2014 deleted, or you
                        do not have access to it
                      </span>
                    )
                  )}
                  {file.description && (
                    <span className="job-files__item-desc">{file.description}</span>
                  )}
                  {/* Once renamed, say what it arrived as. Without this the crew member who shot
                      the video cannot match it to anything on their phone. */}
                  {file.label?.trim() && (
                    <span className="job-files__item-orig">Uploaded as {file.file_name}</span>
                  )}
                  {(file.tags?.length ?? 0) > 0 && (
                    <span className="job-files__item-tags">
                      {file.tags?.map(tag => (
                        <button
                          key={tag}
                          className={`job-files__tag${activeTags.includes(tag) ? ' job-files__tag--on' : ''}`}
                          onClick={() => toggleTag(tag)}
                          title={activeTags.includes(tag) ? `Stop filtering by "${tag}"` : `Show only "${tag}"`}
                        >
                          {tag}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
                <div className="job-files__item-actions">
                  {previewing && (
                    <button className="job-files__item-btn" onClick={() => setViewingFile(file)} title="Preview">
                      <Eye size={15} strokeWidth={2} />
                    </button>
                  )}
                  {/* ONE download control for every shape. It used to be two — one reading
                      `file_url` and one for linked documents — which meant a storage-backed upload,
                      the shape everything writes now, had NO download button at all.

                      F5 still holds and is why this is a plain href rather than a fetch: a linked
                      file resolves to the EXPLORER's own route, which re-checks the viewer's access.
                      Whoever attached it had access; whoever is looking now must too. A linked row
                      whose document is gone shows no button, because there is nothing to hand over. */}
                  {hrefOf(file) && !(file.file_node_id && !file.linked_file?.available) && (
                    <a
                      href={hrefOf(file) as string}
                      download={file.file_name}
                      className="job-files__item-btn"
                      title={file.file_node_id
                        ? 'Download from the File Explorer (checks your own permissions)'
                        : 'Download'}
                    >
                      <Download size={15} strokeWidth={2} />
                    </a>
                  )}
                  {onDelete && (
                    <button className="job-files__item-btn job-files__item-btn--delete" onClick={() => onDelete(file.id)} title="Delete">
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal.
          `files` is what makes ← / → work: reviewing forty photos used to mean open-look-close
          forty times. Only the previewable rows are passed — stepping onto a row that can only
          render a download prompt is a dead end in the middle of a review. */}
      {viewingFile && (
        <FileViewer
          file={merged.find(f => f.id === viewingFile.id) ?? viewingFile}
          files={sectionFiles.filter(canPreview)}
          onClose={() => {
            setViewingFile(null);
            // Notes are added inside the panel without going through `onPatched`, so the badges are
            // reconciled on the way out rather than left stale until the next page load.
            void loadNoteCounts();
          }}
          onSelect={(f) => setViewingFile(f as JobFile)}
          onPatched={(id, patch) => {
            // The viewer's file type allows `null` where this list's allows `undefined` on a couple
            // of nullable columns; the values are the same, only the declarations differ.
            setPatched(p => ({ ...p, [id]: { ...p[id], ...(patch as Partial<JobFile>) } }));
            // A note may have been added while the panel was open; the badge should agree.
            void loadNoteCounts();
          }}
        />
      )}

      {/* F5 — the shared picker, in `file` mode. Same component and same two endpoints as the File
          Explorer's own browse, so this can never show a different tree or a different set of
          permissions from /admin/files. The section and description come from the form's current
          state, so attaching lands in the tab the user is looking at. */}
      {showPicker && onAttachFromFiles && (
        <FilePicker
          open={showPicker}
          mode="file"
          title="Attach a document from Files"
          actionLabel="Attach"
          onClose={() => setShowPicker(false)}
          onPick={(node) => {
            onAttachFromFiles({
              file_node_id: node.id,
              file_name: node.name,
              // Guess the type from the name so the row gets a sensible icon and section filter; the
              // picker returns only id + name, and re-deriving here beats threading mime through.
              file_type: detectFileType(node.name),
              section,
              description,
            });
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

export { FILE_TYPES, SECTIONS };
