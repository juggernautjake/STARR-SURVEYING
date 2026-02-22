// app/admin/research/components/DocumentUploadPanel.tsx
'use client';

import { useState, useRef } from 'react';
import type { ResearchDocument, DocumentType } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface DocumentUploadPanelProps {
  projectId: string;
  documents: ResearchDocument[];
  onDocumentsChanged: () => void;
}

const PROCESSING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending', color: '#9CA3AF' },
  extracting: { label: 'Extracting...', color: '#F59E0B' },
  extracted:  { label: 'Extracted', color: '#3B82F6' },
  analyzing:  { label: 'Analyzing...', color: '#F59E0B' },
  analyzed:   { label: 'Analyzed', color: '#059669' },
  error:      { label: 'Error', color: '#EF4444' },
};

export default function DocumentUploadPanel({ projectId, documents, onDocumentsChanged }: DocumentUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    document_type: '' as string,
    document_label: '',
    content: '',
    recording_info: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(files: FileList | File[]) {
    if (!files.length || uploading) return;
    setUploading(true);

    const formData = new FormData();
    for (const file of Array.from(files)) {
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
        const err = await res.json();
        console.error('Upload error:', err);
      }
    } catch (err) {
      console.error('Upload failed:', err);
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
      }
    } catch (err) {
      console.error('Manual entry failed:', err);
    }
    setSubmittingManual(false);
  }

  async function handleDeleteDocument(docId: string) {
    if (!confirm('Remove this document from the project?')) return;
    try {
      await fetch(`/api/admin/research/${projectId}/documents?id=${docId}`, { method: 'DELETE' });
      onDocumentsChanged();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  function formatSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.docx,.txt,.webp"
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
          PDF, PNG, JPG, TIFF, DOCX, TXT — up to 50 MB each
        </div>
      </div>

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

      {/* Document list */}
      {documents.length > 0 && (
        <div className="research-upload__list">
          <h3 className="research-upload__list-title">
            Documents ({documents.length})
          </h3>
          {documents.map(doc => {
            const status = PROCESSING_STATUS_LABELS[doc.processing_status] || PROCESSING_STATUS_LABELS.pending;
            const typeInfo = doc.document_type ? DOCUMENT_TYPE_LABELS[doc.document_type] : null;

            return (
              <div key={doc.id} className="research-upload__doc">
                <div className="research-upload__doc-icon">
                  {typeInfo?.icon || (doc.source_type === 'manual_entry' ? '📝' : '📄')}
                </div>
                <div className="research-upload__doc-info">
                  <div className="research-upload__doc-name">
                    {doc.document_label || doc.original_filename || 'Untitled'}
                  </div>
                  <div className="research-upload__doc-meta">
                    {typeInfo && <span>{typeInfo.label}</span>}
                    {doc.file_size_bytes ? <span>{formatSize(doc.file_size_bytes)}</span> : null}
                    {doc.page_count ? <span>{doc.page_count} page{doc.page_count !== 1 ? 's' : ''}</span> : null}
                    <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                  </div>
                  {doc.processing_error && (
                    <div className="research-upload__doc-error">{doc.processing_error}</div>
                  )}
                </div>
                <button
                  className="research-upload__doc-delete"
                  onClick={() => handleDeleteDocument(doc.id)}
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
  );
}
