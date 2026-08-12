// app/admin/components/jobs/JobFileManager.tsx — File management with viewer + multi upload
'use client';
import { useState } from 'react';
import { Loader2, FolderOpen, Eye, Download, Trash2, Link2 } from 'lucide-react';
import FileViewer, { isImageFile } from './FileViewer';
import FilePicker from '@/app/admin/components/files/FilePicker';

interface JobFile {
  id: string;
  file_name: string;
  file_type: string;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  section: string;
  description?: string;
  uploaded_by: string;
  uploaded_at: string;
  is_backup: boolean;
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
  onUpload?: (file: { file_name: string; file_type: string; file_url: string; file_size: number; mime_type?: string; section: string; description: string }) => void;
  onDelete?: (id: string) => void;
  activeSection?: string;
  /**
   * F5 — attach an existing File Explorer document instead of uploading bytes. Optional so the
   * component keeps working unchanged on any page that has not wired it; the button only appears when
   * a handler is supplied, rather than rendering a control that silently does nothing.
   */
  onAttachFromFiles?: (attach: { file_node_id: string; file_name: string; file_type: string; section: string; description: string }) => void;
}

export default function JobFileManager({ files, onUpload, onDelete, activeSection, onAttachFromFiles }: Props) {
  const [section, setSection] = useState(activeSection || 'general');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('document');
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [viewingFile, setViewingFile] = useState<JobFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  const sectionFiles = files.filter(f => !activeSection || f.section === section);

  function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const detectedType = detectFileType(file.name);
      onUpload?.({
        file_name: file.name,
        file_type: uploadType === 'document' ? detectedType : uploadType,
        file_url: reader.result as string,
        file_size: file.size,
        mime_type: file.type,
        section,
        description,
      });
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const fileList = e.dataTransfer.files;
    if (!fileList.length) return;

    setUploading(true);
    setUploadCount(fileList.length);
    for (let i = 0; i < fileList.length; i++) {
      processFile(fileList[i]);
    }
    setDescription('');
    setTimeout(() => { setShowUpload(false); setUploading(false); setUploadCount(0); }, 500);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    setUploading(true);
    setUploadCount(fileList.length);
    for (let i = 0; i < fileList.length; i++) {
      processFile(fileList[i]);
    }
    setDescription('');
    setTimeout(() => { setShowUpload(false); setUploading(false); setUploadCount(0); }, 500);
    e.target.value = '';
  }

  function canPreview(file: JobFile): boolean {
    if (!file.file_url) return false;
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
                <p className="job-files__drop-text">Uploading {uploadCount} file{uploadCount !== 1 ? 's' : ''}...</p>
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

      {sectionFiles.length === 0 ? (
        <div className="job-files__empty">No files in this section</div>
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
                        {file.file_name}
                      </button>
                    ) : (
                      file.file_name
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
                </div>
                <div className="job-files__item-actions">
                  {previewing && (
                    <button className="job-files__item-btn" onClick={() => setViewingFile(file)} title="Preview">
                      <Eye size={15} strokeWidth={2} />
                    </button>
                  )}
                  {file.file_url && (
                    <a href={file.file_url} download={file.file_name} className="job-files__item-btn" title="Download">
                      <Download size={15} strokeWidth={2} />
                    </a>
                  )}
                  {/* F5 — a linked file downloads through the EXPLORER's route, not from here. That
                      route re-checks the viewer's own access, so a job page can never become a way to
                      read a document you are not entitled to: whoever attached it had access, but
                      whoever is looking now must too. */}
                  {file.file_node_id && file.linked_file?.available && (
                    <a
                      href={`/api/admin/files/${file.file_node_id}/download`}
                      className="job-files__item-btn"
                      title="Download from the File Explorer (checks your own permissions)"
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

      {/* File Viewer Modal */}
      {viewingFile && (
        <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />
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
