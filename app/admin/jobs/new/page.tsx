// app/admin/jobs/new/page.tsx — Create new job
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UnderConstruction from '../../components/messaging/UnderConstruction';
import { SURVEY_TYPES } from '../../components/jobs/JobCard';

export default function NewJobPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    survey_type: 'boundary',
    address: '',
    city: '',
    state: 'TX',
    zip: '',
    county: '',
    acreage: '',
    lot_number: '',
    subdivision: '',
    abstract_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_company: '',
    client_address: '',
    lead_rpls_email: '',
    deadline: '',
    quote_amount: '',
    notes: '',
    tags: '',
    is_priority: false,
    is_legacy: false,
    stage: 'quote',
  });

  function updateField(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { setError('Job name is required'); return; }
    setSaving(true);
    setError('');

    try {
      const body = {
        ...form,
        acreage: form.acreage ? parseFloat(form.acreage) : undefined,
        quote_amount: form.quote_amount ? parseFloat(form.quote_amount) : undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        deadline: form.deadline || undefined,
      };

      const res = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/admin/jobs/${data.job.id}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create job');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  if (!session?.user) return null;

  return (
    <>
      <UnderConstruction
        feature="New Job"
        description="Create a new survey job and start the quote-to-delivery lifecycle."
      />

      <div className="job-form">
        <div className="job-form__header">
          <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
          <h2 className="job-form__title">Create New Job</h2>
        </div>

        {error && <div className="job-form__error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Job Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Job Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Job Name *</label>
                <input className="job-form__input" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g., Smith Boundary Survey" required />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Survey Type</label>
                <select className="job-form__select" value={form.survey_type} onChange={e => updateField('survey_type', e.target.value)}>
                  {Object.entries(SURVEY_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Initial Stage</label>
                <select className="job-form__select" value={form.stage} onChange={e => updateField('stage', e.target.value)}>
                  <option value="quote">Quote</option>
                  <option value="research">Research</option>
                  <option value="fieldwork">Field Work</option>
                  <option value="drawing">Drawing</option>
                  <option value="legal">Legal</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Acreage</label>
                <input className="job-form__input" type="number" step="0.01" value={form.acreage} onChange={e => updateField('acreage', e.target.value)} placeholder="e.g., 5.25" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Deadline</label>
                <input className="job-form__input" type="date" value={form.deadline} onChange={e => updateField('deadline', e.target.value)} />
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Description</label>
                <textarea className="job-form__textarea" value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Job description and scope of work..." rows={3} />
              </div>
            </div>
          </div>

          {/* Property Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Property Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Address</label>
                <input className="job-form__input" value={form.address} onChange={e => updateField('address', e.target.value)} placeholder="Street address" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">City</label>
                <input className="job-form__input" value={form.city} onChange={e => updateField('city', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">State</label>
                <input className="job-form__input" value={form.state} onChange={e => updateField('state', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">ZIP</label>
                <input className="job-form__input" value={form.zip} onChange={e => updateField('zip', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">County</label>
                <input className="job-form__input" value={form.county} onChange={e => updateField('county', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Lot Number</label>
                <input className="job-form__input" value={form.lot_number} onChange={e => updateField('lot_number', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Subdivision</label>
                <input className="job-form__input" value={form.subdivision} onChange={e => updateField('subdivision', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Abstract Number</label>
                <input className="job-form__input" value={form.abstract_number} onChange={e => updateField('abstract_number', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Client Info */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Client Information</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">Client Name</label>
                <input className="job-form__input" value={form.client_name} onChange={e => updateField('client_name', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Client Email</label>
                <input className="job-form__input" type="email" value={form.client_email} onChange={e => updateField('client_email', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Client Phone</label>
                <input className="job-form__input" type="tel" value={form.client_phone} onChange={e => updateField('client_phone', e.target.value)} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Company</label>
                <input className="job-form__input" value={form.client_company} onChange={e => updateField('client_company', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Assignment & Financial */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Assignment & Financial</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">Lead RPLS Email</label>
                <input className="job-form__input" type="email" value={form.lead_rpls_email} onChange={e => updateField('lead_rpls_email', e.target.value)} placeholder="rpls@starr-surveying.com" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Quote Amount ($)</label>
                <input className="job-form__input" type="number" step="0.01" value={form.quote_amount} onChange={e => updateField('quote_amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Tags (comma-separated)</label>
                <input className="job-form__input" value={form.tags} onChange={e => updateField('tags', e.target.value)} placeholder="residential, rush, complex terrain" />
              </div>
            </div>
          </div>

          {/* Notes & Flags */}
          <div className="job-form__section">
            <h3 className="job-form__section-title">Notes & Flags</h3>
            <div className="job-form__grid">
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Notes</label>
                <textarea className="job-form__textarea" value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Any additional notes..." rows={3} />
              </div>
              <div className="job-form__field">
                <label className="job-form__checkbox-label">
                  <input type="checkbox" checked={form.is_priority} onChange={e => updateField('is_priority', e.target.checked)} />
                  Priority Job
                </label>
              </div>
              <div className="job-form__field">
                <label className="job-form__checkbox-label">
                  <input type="checkbox" checked={form.is_legacy} onChange={e => updateField('is_legacy', e.target.checked)} />
                  Legacy/Historical Job
                </label>
              </div>
            </div>
          </div>

          <div className="job-form__actions">
            <Link href="/admin/jobs" className="job-form__cancel">Cancel</Link>
            <button type="submit" className="job-form__submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
