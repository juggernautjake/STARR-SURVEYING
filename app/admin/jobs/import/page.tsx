// app/admin/jobs/import/page.tsx — Import legacy/historical jobs
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import UnderConstruction from '../../components/messaging/UnderConstruction';
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

export default function ImportJobsPage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const [showResults, setShowResults] = useState(false);

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
    } catch {
      setResults({ success: 0, failed: 1, errors: ['Network error'] });
      setShowResults(true);
    }
    setImporting(false);
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      setResults({ success: 0, failed: 0, errors: ['CSV file is empty or has no data rows'] });
      setShowResults(true);
      setImporting(false);
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      try {
        const res = await fetch('/api/admin/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name || row.job_name || `Legacy Job ${i}`,
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
        else { failCount++; errors.push(`Row ${i}: ${(await res.json()).error || 'Unknown error'}`); }
      } catch {
        failCount++;
        errors.push(`Row ${i}: Network error`);
      }
    }

    setResults({ success: successCount, failed: failCount, errors });
    setShowResults(true);
    setImporting(false);
    e.target.value = '';
  }

  if (!session?.user) return null;

  return (
    <>
      <UnderConstruction
        feature="Import Legacy Jobs"
        description="Import historical surveys and past jobs into the system. Supports single entry and bulk CSV upload."
      />

      <div className="job-form">
        <div className="job-form__header">
          <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
          <h2 className="job-form__title">Import Legacy Jobs</h2>
        </div>

        {/* Mode toggle */}
        <div className="job-import__modes">
          <button
            className={`job-import__mode ${mode === 'single' ? 'job-import__mode--active' : ''}`}
            onClick={() => setMode('single')}
          >
            Single Entry
          </button>
          <button
            className={`job-import__mode ${mode === 'bulk' ? 'job-import__mode--active' : ''}`}
            onClick={() => setMode('bulk')}
          >
            Bulk CSV Upload
          </button>
        </div>

        {/* Results banner */}
        {showResults && (
          <div className={`job-import__results ${results.failed > 0 ? 'job-import__results--error' : 'job-import__results--success'}`}>
            <div className="job-import__results-summary">
              {results.success > 0 && <span>✅ {results.success} job{results.success !== 1 ? 's' : ''} imported</span>}
              {results.failed > 0 && <span>❌ {results.failed} failed</span>}
            </div>
            {results.errors.length > 0 && (
              <ul className="job-import__results-errors">
                {results.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
            <button className="job-import__results-close" onClick={() => setShowResults(false)}>×</button>
          </div>
        )}

        {mode === 'single' ? (
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
        ) : (
          <div className="job-import__bulk">
            <div className="job-form__section">
              <h3 className="job-form__section-title">CSV Upload</h3>
              <p className="job-import__instructions">
                Upload a CSV file with historical jobs. The first row should be column headers.
              </p>
              <div className="job-import__csv-info">
                <h4>Expected Columns:</h4>
                <code>name, job_number, survey_type, address, city, county, acreage, client_name, description, notes, stage, date_received, date_delivered</code>
              </div>
              <div className="job-import__upload-area">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={importing}
                />
                {importing && <p className="job-import__uploading">Importing jobs, please wait...</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Import Legacy Jobs — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Single entry form for manual legacy job input</li>
            <li>Bulk CSV upload with header auto-detection</li>
            <li>All imported jobs marked with is_legacy flag</li>
            <li>Results banner showing success/failure counts</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Improve legacy job import at /admin/jobs/import/page.tsx. Current: single form entry and CSV bulk upload.

NEXT STEPS:
1. Add CSV preview table before import (show parsed rows, let user confirm)
2. Add column mapping UI (map CSV columns to job fields)
3. Add duplicate detection (warn if job_number already exists)
4. Add Excel (.xlsx) file support
5. Add import from Trimble Business Center project files
6. Add import from AutoCAD project metadata
7. Add batch file upload for associating drawings/documents with imported jobs
8. Add progress bar for bulk imports
9. Add undo/rollback for recent imports
10. Add import templates (downloadable CSV template with headers)`}</pre>
        </div>
      </div>
    </>
  );
}
