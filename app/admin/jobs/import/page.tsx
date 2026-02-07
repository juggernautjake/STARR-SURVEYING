// app/admin/jobs/import/page.tsx — Import legacy/historical jobs + file uploads
'use client';
import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import { SURVEY_TYPES } from '../../components/jobs/JobCard';

interface LegacyJob {
  name: string;
  job_number: string;
  survey_type: string;
  address: string;
  city: string;
  county: string;
  acreage: string;
  client_name: string;
  description: string;
  notes: string;
  date_received: string;
  date_delivered: string;
  stage: string;
}

interface CSVPreviewRow {
  [key: string]: string;
}

type ImportMode = 'single' | 'bulk' | 'files';

export default function ImportJobsPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('ImportJobsPage');
  const [mode, setMode] = useState<ImportMode>('single');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const [showResults, setShowResults] = useState(false);

  // CSV preview state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CSVPreviewRow[]>([]);
  const [csvReady, setCsvReady] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [fileJobId, setFileJobId] = useState('');
  const [fileDragActive, setFileDragActive] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single import form
  const [form, setForm] = useState<LegacyJob>({
    name: '', job_number: '', survey_type: 'boundary', address: '', city: '', county: '',
    acreage: '', client_name: '', description: '', notes: '', date_received: '', date_delivered: '',
    stage: 'completed',
  });

  function updateField(field: keyof LegacyJob, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSingleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setImporting(true);

    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          acreage: form.acreage ? parseFloat(form.acreage) : undefined,
          is_legacy: true,
          date_received: form.date_received || undefined,
          date_delivered: form.date_delivered || undefined,
        }),
      });

      if (res.ok) {
        setResults({ success: 1, failed: 0, errors: [] });
        setShowResults(true);
        setForm({ name: '', job_number: '', survey_type: 'boundary', address: '', city: '', county: '', acreage: '', client_name: '', description: '', notes: '', date_received: '', date_delivered: '', stage: 'completed' });
      } else {
        const data = await res.json();
        setResults({ success: 0, failed: 1, errors: [data.error || 'Unknown error'] });
        setShowResults(true);
      }
    } catch (err) {
      setResults({ success: 0, failed: 1, errors: ['Network error'] });
      setShowResults(true);
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'single import' });
    }
    setImporting(false);
  }

  // CSV parsing — load into preview first
  function handleCSVSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        setResults({ success: 0, failed: 0, errors: ['CSV file is empty or has no data rows'] });
        setShowResults(true);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const rows: CSVPreviewRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: CSVPreviewRow = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
      }

      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvReady(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // Handle quoted CSV fields properly
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  async function importCSVRows() {
    setImporting(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      try {
        const res = await fetch('/api/admin/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name || row.job_name || `Legacy Job ${i + 1}`,
            job_number: row.job_number || row.number || undefined,
            survey_type: row.survey_type || row.type || 'boundary',
            address: row.address || '',
            city: row.city || '',
            county: row.county || '',
            acreage: row.acreage ? parseFloat(row.acreage) : undefined,
            client_name: row.client_name || row.client || '',
            description: row.description || '',
            notes: row.notes || '',
            stage: row.stage || 'completed',
            is_legacy: true,
          }),
        });
        if (res.ok) successCount++;
        else { failCount++; errors.push(`Row ${i + 1}: ${(await res.json()).error || 'Unknown error'}`); }
      } catch (err) {
        failCount++;
        errors.push(`Row ${i + 1}: Network error`);
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: `CSV import row ${i + 1}` });
      }
    }

    setResults({ success: successCount, failed: failCount, errors });
    setShowResults(true);
    setImporting(false);
    setCsvReady(false);
    setCsvRows([]);
    setCsvHeaders([]);
  }

  function downloadTemplate() {
    const headers = 'name,job_number,survey_type,address,city,county,acreage,client_name,description,notes,stage,date_received,date_delivered';
    const example = '"Smith Boundary Survey","2023-0042","boundary","123 Main St","Austin","Travis","2.5","John Smith","Residential boundary survey","Corner found at NE","completed","2023-01-15","2023-02-10"';
    const csv = headers + '\n' + example + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // File upload handlers
  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setFileDragActive(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const newFiles = Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const newFiles = Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  }

  function removeFile(idx: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function getFileIcon(name: string): string {
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) return '\u{1F5BC}';
    if (['.pdf'].includes(ext)) return '\u{1F4C4}';
    if (['.doc', '.docx'].includes(ext)) return '\u{1F4DD}';
    if (['.xls', '.xlsx', '.csv'].includes(ext)) return '\u{1F4CA}';
    if (['.dwg', '.dxf', '.dgn'].includes(ext)) return '\u{1F4D0}';
    if (['.txt', '.rtf'].includes(ext)) return '\u{1F4C3}';
    return '\u{1F4CE}';
  }

  async function uploadFilesToJob() {
    if (!fileJobId.trim() || uploadedFiles.length === 0) return;
    setUploadingFiles(true);
    // In a real implementation this would upload to Supabase Storage
    // For now it records metadata
    let successCount = 0;
    for (const f of uploadedFiles) {
      try {
        const res = await fetch('/api/admin/jobs/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: fileJobId.trim(),
            file_name: f.name,
            file_type: 'other',
            file_size: f.size,
            mime_type: f.type,
            section: 'general',
          }),
        });
        if (res.ok) successCount++;
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'file upload' });
      }
    }
    setResults({ success: successCount, failed: uploadedFiles.length - successCount, errors: [] });
    setShowResults(true);
    setUploadedFiles([]);
    setUploadingFiles(false);
  }

  if (!session?.user) return null;

  return (
    <>
      <div className="job-form">
        <div className="job-form__header">
          <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
          <h2 className="job-form__title">Import Jobs & Files</h2>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280', margin: '0.25rem 0 0' }}>
            Import historical surveys, bulk-upload jobs from CSV, or attach files to existing jobs.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="job-import__modes">
          <button className={`job-import__mode ${mode === 'single' ? 'job-import__mode--active' : ''}`} onClick={() => setMode('single')}>
            Single Entry
          </button>
          <button className={`job-import__mode ${mode === 'bulk' ? 'job-import__mode--active' : ''}`} onClick={() => setMode('bulk')}>
            Bulk CSV Upload
          </button>
          <button className={`job-import__mode ${mode === 'files' ? 'job-import__mode--active' : ''}`} onClick={() => setMode('files')}>
            Upload Files
          </button>
        </div>

        {/* Results banner */}
        {showResults && (
          <div className={`job-import__results ${results.failed > 0 ? 'job-import__results--error' : 'job-import__results--success'}`}>
            <div className="job-import__results-summary">
              {results.success > 0 && <span>{results.success} item{results.success !== 1 ? 's' : ''} imported successfully</span>}
              {results.failed > 0 && <span>{results.failed} failed</span>}
            </div>
            {results.errors.length > 0 && (
              <ul className="job-import__results-errors">
                {results.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                {results.errors.length > 10 && <li>...and {results.errors.length - 10} more errors</li>}
              </ul>
            )}
            <button className="job-import__results-close" onClick={() => setShowResults(false)}>&times;</button>
          </div>
        )}

        {/* SINGLE ENTRY MODE */}
        {mode === 'single' && (
          <form onSubmit={handleSingleImport}>
            <div className="job-form__section">
              <h3 className="job-form__section-title">Legacy Job Details</h3>
              <div className="job-form__grid">
                <div className="job-form__field">
                  <label className="job-form__label">Job Name *</label>
                  <input className="job-form__input" value={form.name} onChange={e => updateField('name', e.target.value)} required />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Job Number</label>
                  <input className="job-form__input" value={form.job_number} onChange={e => updateField('job_number', e.target.value)} placeholder="e.g., 2020-0042" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Survey Type</label>
                  <select className="job-form__select" value={form.survey_type} onChange={e => updateField('survey_type', e.target.value)}>
                    {Object.entries(SURVEY_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Status</label>
                  <select className="job-form__select" value={form.stage} onChange={e => updateField('stage', e.target.value)}>
                    <option value="completed">Completed</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Address</label>
                  <input className="job-form__input" value={form.address} onChange={e => updateField('address', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">City</label>
                  <input className="job-form__input" value={form.city} onChange={e => updateField('city', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">County</label>
                  <input className="job-form__input" value={form.county} onChange={e => updateField('county', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Acreage</label>
                  <input className="job-form__input" type="number" step="0.01" value={form.acreage} onChange={e => updateField('acreage', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Client Name</label>
                  <input className="job-form__input" value={form.client_name} onChange={e => updateField('client_name', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Date Received</label>
                  <input className="job-form__input" type="date" value={form.date_received} onChange={e => updateField('date_received', e.target.value)} />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Date Delivered</label>
                  <input className="job-form__input" type="date" value={form.date_delivered} onChange={e => updateField('date_delivered', e.target.value)} />
                </div>
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Description</label>
                  <textarea className="job-form__textarea" value={form.description} onChange={e => updateField('description', e.target.value)} rows={2} />
                </div>
                <div className="job-form__field job-form__field--full">
                  <label className="job-form__label">Notes</label>
                  <textarea className="job-form__textarea" value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={2} />
                </div>
              </div>
            </div>
            <div className="job-form__actions">
              <button type="submit" className="job-form__submit" disabled={importing}>
                {importing ? 'Importing...' : 'Import Job'}
              </button>
            </div>
          </form>
        )}

        {/* BULK CSV MODE */}
        {mode === 'bulk' && (
          <div className="job-import__bulk">
            <div className="job-form__section">
              <h3 className="job-form__section-title">CSV Upload</h3>
              <p className="job-import__instructions">
                Upload a CSV file with historical jobs. The first row should be column headers.
                You can preview and confirm before importing.
              </p>

              <div className="job-import__csv-actions">
                <button className="job-import__template-btn" onClick={downloadTemplate}>
                  Download CSV Template
                </button>
              </div>

              <div className="job-import__csv-info">
                <h4>Expected Columns:</h4>
                <code>name, job_number, survey_type, address, city, county, acreage, client_name, description, notes, stage, date_received, date_delivered</code>
              </div>

              {!csvReady ? (
                <div className="job-import__upload-area">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVSelect}
                    disabled={importing}
                    style={{ display: 'none' }}
                  />
                  <div
                    className="job-files__drop-zone"
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <span className="job-files__drop-icon">{'\u{1F4C4}'}</span>
                    <p className="job-files__drop-text">Click to select a CSV file or drag it here</p>
                    <p className="job-files__drop-sub">Accepts .csv files</p>
                  </div>
                </div>
              ) : (
                <div className="job-import__preview">
                  <div className="job-import__preview-header">
                    <h4>Preview: {csvFileName} ({csvRows.length} row{csvRows.length !== 1 ? 's' : ''})</h4>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="job-import__template-btn"
                        onClick={() => { setCsvReady(false); setCsvRows([]); setCsvHeaders([]); }}
                      >
                        Cancel
                      </button>
                      <button
                        className="job-form__submit"
                        onClick={importCSVRows}
                        disabled={importing}
                      >
                        {importing ? `Importing ${csvRows.length} jobs...` : `Import ${csvRows.length} Jobs`}
                      </button>
                    </div>
                  </div>
                  <div className="job-import__preview-table-wrap">
                    <table className="job-import__preview-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          {csvHeaders.map(h => <th key={h}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 50).map((row, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            {csvHeaders.map(h => <td key={h}>{row[h] || ''}</td>)}
                          </tr>
                        ))}
                        {csvRows.length > 50 && (
                          <tr>
                            <td colSpan={csvHeaders.length + 1} style={{ textAlign: 'center', fontStyle: 'italic', color: '#9CA3AF' }}>
                              ...and {csvRows.length - 50} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FILE UPLOAD MODE */}
        {mode === 'files' && (
          <div className="job-import__bulk">
            <div className="job-form__section">
              <h3 className="job-form__section-title">Upload Files to a Job</h3>
              <p className="job-import__instructions">
                Attach documents, drawings, images, and other files to an existing job.
                Supports all file types including images, Word documents, PDFs, CAD files, and more.
              </p>

              <div className="job-form__field" style={{ maxWidth: '400px', marginBottom: '1rem' }}>
                <label className="job-form__label">Job ID or Job Number *</label>
                <input
                  className="job-form__input"
                  value={fileJobId}
                  onChange={e => setFileJobId(e.target.value)}
                  placeholder="Enter the job ID to attach files to"
                />
              </div>

              <div
                className={`job-files__drop-zone ${fileDragActive ? 'job-files__drop-zone--active' : ''}`}
                onDragOver={e => { e.preventDefault(); setFileDragActive(true); }}
                onDragLeave={() => setFileDragActive(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ marginBottom: '1rem' }}
              >
                <span className="job-files__drop-icon">{'\u{1F4C2}'}</span>
                <p className="job-files__drop-text">Drag & drop files here or click to browse</p>
                <p className="job-files__drop-sub">
                  Images (.jpg, .png, .gif, .tiff) &middot; Documents (.pdf, .doc, .docx, .txt) &middot;
                  Spreadsheets (.xlsx, .csv) &middot; CAD (.dwg, .dxf) &middot; Any other file type
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              </div>

              {uploadedFiles.length > 0 && (
                <div className="job-import__file-list">
                  <div className="job-import__file-list-header">
                    <span>{uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} selected</span>
                    <button
                      className="job-form__submit"
                      onClick={uploadFilesToJob}
                      disabled={uploadingFiles || !fileJobId.trim()}
                    >
                      {uploadingFiles ? 'Uploading...' : `Upload ${uploadedFiles.length} File${uploadedFiles.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="job-import__file-item">
                      <span className="job-import__file-icon">{getFileIcon(f.name)}</span>
                      <div className="job-import__file-info">
                        <span className="job-import__file-name">{f.name}</span>
                        <span className="job-import__file-meta">{formatSize(f.size)} &middot; {f.type || 'Unknown type'}</span>
                      </div>
                      <button className="job-import__file-remove" onClick={() => removeFile(i)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="job-import__supported-types">
                <h4>Supported File Types</h4>
                <div className="job-import__type-grid">
                  <div className="job-import__type-card">
                    <span>{'\u{1F5BC}'}</span>
                    <strong>Images</strong>
                    <span>.jpg .png .gif .bmp .webp .svg .tiff</span>
                  </div>
                  <div className="job-import__type-card">
                    <span>{'\u{1F4C4}'}</span>
                    <strong>Documents</strong>
                    <span>.pdf .doc .docx .txt .rtf</span>
                  </div>
                  <div className="job-import__type-card">
                    <span>{'\u{1F4CA}'}</span>
                    <strong>Spreadsheets</strong>
                    <span>.xls .xlsx .csv</span>
                  </div>
                  <div className="job-import__type-card">
                    <span>{'\u{1F4D0}'}</span>
                    <strong>CAD Files</strong>
                    <span>.dwg .dxf .dgn</span>
                  </div>
                  <div className="job-import__type-card">
                    <span>{'\u{1F4E1}'}</span>
                    <strong>Trimble Data</strong>
                    <span>.jxl .dc .job .vce</span>
                  </div>
                  <div className="job-import__type-card">
                    <span>{'\u{1F4CE}'}</span>
                    <strong>Other</strong>
                    <span>Any file type accepted</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
