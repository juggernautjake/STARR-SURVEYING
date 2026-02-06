// app/admin/components/jobs/JobFileManager.tsx — File management with backups
'use client';
import { useState } from 'react';

interface JobFile {
  id: string;
  file_name: string;
  file_type: string;
  file_url?: string;
  file_size?: number;
  section: string;
  description?: string;
  uploaded_by: string;
  uploaded_at: string;
  is_backup: boolean;
}

const FILE_TYPES: Record<string, { label: string; icon: string }> = {
  drawing: { label: 'Drawing', icon: '📐' },
  field_data: { label: 'Field Data', icon: '📊' },
  image: { label: 'Image', icon: '🖼️' },
  satellite_image: { label: 'Satellite Image', icon: '🛰️' },
  voice_memo: { label: 'Voice Memo', icon: '🎙️' },
  document: { label: 'Document', icon: '📄' },
  deed: { label: 'Deed', icon: '📜' },
  plat: { label: 'Plat', icon: '🗺️' },
  legal: { label: 'Legal', icon: '⚖️' },
  cad: { label: 'CAD File', icon: '💻' },
  trimble: { label: 'Trimble Data', icon: '📡' },
  backup: { label: 'Backup', icon: '💾' },
  other: { label: 'Other', icon: '📎' },
};

const SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'research', label: 'Research' },
  { key: 'fieldwork', label: 'Field Work' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'legal', label: 'Legal' },
  { key: 'delivery', label: 'Delivery' },
];

interface Props {
  files: JobFile[];
  onUpload?: (file: { file_name: string; file_type: string; file_url: string; file_size: number; section: string; description: string }) => void;
  onDelete?: (id: string) => void;
  activeSection?: string;
}

export default function JobFileManager({ files, onUpload, onDelete, activeSection }: Props) {
  const [section, setSection] = useState(activeSection || 'general');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('document');
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const sectionFiles = files.filter(f => !activeSection || f.section === section);

  function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onUpload?.({
        file_name: file.name,
        file_type: uploadType,
        file_url: reader.result as string,
        file_size: file.size,
        section,
        description,
      });
      setDescription('');
      setShowUpload(false);
    };
    reader.readAsDataURL(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onUpload?.({
        file_name: file.name,
        file_type: uploadType,
        file_url: reader.result as string,
        file_size: file.size,
        section,
        description,
      });
      setDescription('');
      setShowUpload(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
              {Object.entries(FILE_TYPES).filter(([k]) => k !== 'backup').map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
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
            <span className="job-files__drop-icon">📂</span>
            <p className="job-files__drop-text">Drag & drop file here or click to browse</p>
            <input type="file" className="job-files__file-input" onChange={handleFileSelect} />
          </div>
        </div>
      )}

      {sectionFiles.length === 0 ? (
        <div className="job-files__empty">No files in this section</div>
      ) : (
        <div className="job-files__list">
          {sectionFiles.map(file => {
            const typeInfo = FILE_TYPES[file.file_type] || FILE_TYPES.other;
            return (
              <div key={file.id} className="job-files__item">
                <span className="job-files__item-icon">{typeInfo.icon}</span>
                <div className="job-files__item-info">
                  <span className="job-files__item-name">{file.file_name}</span>
                  <span className="job-files__item-meta">
                    {typeInfo.label} · {formatFileSize(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString()}
                  </span>
                  {file.description && (
                    <span className="job-files__item-desc">{file.description}</span>
                  )}
                </div>
                <div className="job-files__item-actions">
                  {file.file_url && (
                    <a href={file.file_url} download={file.file_name} className="job-files__item-btn" title="Download">⬇️</a>
                  )}
                  {onDelete && (
                    <button className="job-files__item-btn job-files__item-btn--delete" onClick={() => onDelete(file.id)} title="Delete">🗑️</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { FILE_TYPES, SECTIONS };
