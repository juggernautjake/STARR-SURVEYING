// app/admin/research/components/DocumentUploadPanel.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { ResearchDocument, DocumentType } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface DocumentUploadPanelProps {
  projectId: string;
  documents: ResearchDocument[];
  onDocumentsChanged: () => void;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_EXTENSIONS = new Set([
  '.pdf',
  '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.gif', '.heic', '.heif',
  '.docx', '.txt', '.rtf',
]);
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/tiff', 'image/webp', 'image/bmp', 'image/gif',
  'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/rtf', 'application/rtf',
]);

const PROCESSING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending', color: '#9CA3AF' },
  extracting: { label: 'Extracting...', color: '#F59E0B' },
  extracted:  { label: 'Extracted', color: '#3B82F6' },
  analyzing:  { label: 'Analyzing...', color: '#F59E0B' },
  analyzed:   { label: 'Analyzed', color: '#059669' },
  error:      { label: 'Error', color: '#EF4444' },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function validateFiles(files: File[]): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const ext = getFileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.has(ext) && !ACCEPTED_MIME_TYPES.has(file.type)) {
      errors.push(`"${file.name}" — unsupported file type (${ext || file.type || 'unknown'})`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`"${file.name}" — file too large (${formatFileSize(file.size)}, max 50 MB)`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`"${file.name}" — file is empty`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

export default function DocumentUploadPanel({ projectId, documents, onDocumentsChanged }: DocumentUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    document_type: '' as string,
    document_label: '',
    content: '',
    recording_info: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible document list state
  const [docsOpen, setDocsOpen] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  // Keep selectedDocs in sync when documents change (e.g. external deletion)
  useEffect(() => {
    const docIds = new Set(documents.map(d => d.id));
    setSelectedDocs(prev => {
      const filtered = new Set([...prev].filter(id => docIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const activeSelected = selectedDocs;

  async function handleFileUpload(files: FileList | File[]) {
    if (!files.length || uploading) return;

    setUploadError(null);

    // Client-side validation
    const { valid, errors } = validateFiles(Array.from(files));
    if (errors.length > 0) {
      setUploadError(errors.join('\n'));
    }
    if (valid.length === 0) return;

    setUploading(true);

    const formData = new FormData();
    for (const file of valid) {
      formData.append('file', file);
    }

    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        onDocumentsChanged();
      } else {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        setUploadError(err.error || 'Upload failed. Please try again.');
      }
    } catch {
      setUploadError('Upload failed. Check your internet connection and try again.');
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualEntry.content.trim() || submittingManual) return;
    setSubmittingManual(true);
    setManualError(null);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualEntry),
      });
      if (res.ok) {
        setManualEntry({ document_type: '', document_label: '', content: '', recording_info: '' });
        setShowManual(false);
        onDocumentsChanged();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        setManualError(err.error || 'Failed to save manual entry. Please try again.');
      }
    } catch {
      setManualError('Failed to save. Check your internet connection and try again.');
    }
    setSubmittingManual(false);
  }

  async function handleReprocessDocument(docId: string) {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents?id=${docId}&action=reprocess`, {
        method: 'PATCH',
      });
      if (res.ok) {
        onDocumentsChanged();
      } else {
        setUploadError('Failed to reprocess document. Please try again.');
      }
    } catch {
      setUploadError('Failed to reprocess. Check your connection and try again.');
    }
  }

  async function handleDeleteDocument(docId: string) {
    const doc = documents.find(d => d.id === docId);
    let confirmMsg = `Remove "${doc?.original_filename || 'this document'}" from the project?`;
    if (doc?.processing_status === 'analyzed' || doc?.processing_status === 'extracted') {
      confirmMsg += '\n\nNote: any data points previously extracted from this document will remain in the project until you re-run the analysis.';
    }
    if (!confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/documents?id=${docId}`, { method: 'DELETE' });
      if (!res.ok) {
        setUploadError('Failed to delete document. Please try again.');
      } else {
        setSelectedDocs(prev => { const next = new Set(prev); next.delete(docId); return next; });
        onDocumentsChanged();
      }
    } catch {
      setUploadError('Failed to delete document. Check your connection and try again.');
    }
  }

  function toggleDocSelection(docId: string) {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function selectAllDocs() {
    setSelectedDocs(new Set(documents.map(d => d.id)));
  }

  function deselectAllDocs() {
    setSelectedDocs(new Set());
  }

  async function handleBulkDelete() {
    if (activeSelected.size === 0) return;
    const count = activeSelected.size;
    if (!confirm(`Remove ${count} document${count !== 1 ? 's' : ''} from the project?\n\nNote: any data points previously extracted from these documents will remain until you re-run the analysis.`)) return;
    const ids = [...activeSelected];
    setSelectedDocs(new Set());
    const failed: string[] = [];
    for (const docId of ids) {
      try {
        const res = await fetch(`/api/admin/research/${projectId}/documents?id=${docId}`, { method: 'DELETE' });
        if (!res.ok) {
          const doc = documents.find(d => d.id === docId);
          failed.push(doc?.document_label || doc?.original_filename || docId);
        }
      } catch {
        const doc = documents.find(d => d.id === docId);
        failed.push(doc?.document_label || doc?.original_filename || docId);
      }
    }
    if (failed.length > 0) {
      setUploadError(`Failed to remove ${failed.length} document${failed.length !== 1 ? 's' : ''}: ${failed.join(', ')}`);
    }
    onDocumentsChanged();
  }

  return (
    <div className="research-upload">
      {/* Drop zone */}
      <div
        className={`research-upload__dropzone ${dragOver ? 'research-upload__dropzone--active' : ''} ${uploading ? 'research-upload__dropzone--uploading' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp,.bmp,.gif,.heic,.heif,.docx,.txt,.rtf"
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFileUpload(e.target.files)}
        />
        <div className="research-upload__dropzone-icon">
          {uploading ? '...' : '+'}
        </div>
        <div className="research-upload__dropzone-text">
          {uploading
            ? 'Uploading...'
            : dragOver
              ? 'Drop files here'
              : 'Drop files here or click to browse'}
        </div>
        <div className="research-upload__dropzone-hint">
          PDF, PNG, JPG, TIFF, BMP, GIF, HEIC, DOCX, TXT, RTF — up to 50 MB each
        </div>
      </div>

      {/* Upload error display */}
      {uploadError && (
        <div
          className="research-upload__error"
          style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.5rem',
            padding: '0.75rem 1rem', marginTop: '0.75rem', color: '#DC2626', fontSize: '0.85rem',
            whiteSpace: 'pre-line',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span>{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0 0 0.5rem', lineHeight: 1 }}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Manual entry toggle */}
      <div className="research-upload__actions">
        <button
          className="research-upload__manual-btn"
          onClick={() => setShowManual(!showManual)}
        >
          {showManual ? 'Cancel manual entry' : '+ Enter text manually'}
        </button>
      </div>

      {/* Manual entry form */}
      {showManual && (
        <form className="research-upload__manual-form" onSubmit={handleManualSubmit}>
          <div className="research-modal__row">
            <div className="research-modal__field">
              <label className="research-modal__label">Document Type</label>
              <select
                className="research-modal__select"
                value={manualEntry.document_type}
                onChange={e => setManualEntry(p => ({ ...p, document_type: e.target.value }))}
              >
                <option value="">Auto-detect</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, { label, icon }]) => (
                  <option key={key} value={key}>{icon} {label}</option>
                ))}
              </select>
            </div>
            <div className="research-modal__field">
              <label className="research-modal__label">Label</label>
              <input
                className="research-modal__input"
                type="text"
                placeholder="e.g., Deed from County Clerk"
                value={manualEntry.document_label}
                onChange={e => setManualEntry(p => ({ ...p, document_label: e.target.value }))}
              />
            </div>
          </div>
          <div className="research-modal__field">
            <label className="research-modal__label">Recording Info (optional)</label>
            <input
              className="research-modal__input"
              type="text"
              placeholder="e.g., Vol. 3456, Pg. 789"
              value={manualEntry.recording_info}
              onChange={e => setManualEntry(p => ({ ...p, recording_info: e.target.value }))}
            />
          </div>
          <div className="research-modal__field">
            <label className="research-modal__label">Content *</label>
            <textarea
              className="research-modal__textarea"
              placeholder="Paste or type the document content here..."
              value={manualEntry.content}
              onChange={e => setManualEntry(p => ({ ...p, content: e.target.value }))}
              rows={8}
              required
            />
          </div>
          {manualError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: '#DC2626', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {manualError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="research-modal__cancel" onClick={() => setShowManual(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="research-modal__submit"
              disabled={manualEntry.content.trim().length < 10 || submittingManual}
            >
              {submittingManual ? 'Saving...' : 'Add Document'}
            </button>
          </div>
        </form>
      )}

      {/* Document list — collapsible */}
      {documents.length > 0 && (
        <div className="research-upload__list">
          {/* Collapsible header */}
          <div
            className="research-upload__list-toggle-header"
            onClick={() => setDocsOpen(prev => !prev)}
            role="button"
            aria-expanded={docsOpen}
          >
            <span className="research-upload__list-toggle-title">
              📂 Documents ({documents.length})
            </span>
            <div className="research-upload__list-select-controls" onClick={e => e.stopPropagation()}>
              <button
                className="research-search__select-btn"
                onClick={selectAllDocs}
                type="button"
              >
                Select all
              </button>
              <button
                className="research-search__select-btn"
                onClick={deselectAllDocs}
                type="button"
              >
                Deselect all
              </button>
              {activeSelected.size > 0 && (
                <button
                  className="research-upload__bulk-delete-btn"
                  onClick={handleBulkDelete}
                  type="button"
                  title={`Remove ${activeSelected.size} selected document${activeSelected.size !== 1 ? 's' : ''}`}
                >
                  🗑 Remove {activeSelected.size} selected
                </button>
              )}
            </div>
            <span className="research-search__toggle-chevron" aria-hidden="true">
              {docsOpen ? '▲' : '▼'}
            </span>
          </div>

          {/* Collapsible body */}
          {docsOpen && (
            <div className="research-upload__list-body">
              {documents.map(doc => {
                const status = PROCESSING_STATUS_LABELS[doc.processing_status] || PROCESSING_STATUS_LABELS.pending;
                const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;
                const isChecked = activeSelected.has(doc.id);

                return (
                  <div
                    key={doc.id}
                    className={`research-upload__doc ${isChecked ? 'research-upload__doc--selected' : ''}`}
                    onClick={() => toggleDocSelection(doc.id)}
                  >
                    <div className="research-upload__doc-check">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDocSelection(doc.id)}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Select ${doc.document_label || doc.original_filename || 'document'}`}
                      />
                    </div>
                    <div className="research-upload__doc-icon">
                      {typeInfo?.icon || (doc.source_type === 'manual_entry' ? '📝' : '📄')}
                    </div>
                    <div className="research-upload__doc-info">
                      <div className="research-upload__doc-name">
                        {doc.document_label || doc.original_filename || 'Untitled'}
                      </div>
                      <div className="research-upload__doc-meta">
                        {typeInfo && <span>{typeInfo.label}</span>}
                        {doc.file_size_bytes ? <span>{formatFileSize(doc.file_size_bytes)}</span> : null}
                        {doc.page_count ? <span>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span> : null}
                        <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                      </div>
                      {doc.processing_error && (
                        <div className="research-upload__doc-error">
                          {doc.processing_error}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReprocessDocument(doc.id); }}
                            style={{
                              display: 'inline-block', marginLeft: '0.5rem',
                              background: 'none', border: '1px solid #DC2626', borderRadius: '0.25rem',
                              color: '#DC2626', cursor: 'pointer', padding: '0.15rem 0.5rem',
                              fontSize: '0.75rem', fontWeight: 600,
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className="research-upload__doc-delete"
                      onClick={e => { e.stopPropagation(); handleDeleteDocument(doc.id); }}
                      title="Remove document"
                    >
                      &times;
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
