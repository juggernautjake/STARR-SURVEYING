// app/admin/leads/page.tsx — Leads management (admin only)
'use client';
import '../styles/AdminJobs.css';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePageError } from '../hooks/usePageError';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string;
  notes: string | null;
  property_address: string | null;
  survey_type: string | null;
  estimated_acreage: number | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { key: 'new', label: 'New', color: '#3B82F6' },
  { key: 'contacted', label: 'Contacted', color: '#8B5CF6' },
  { key: 'quoted', label: 'Quoted', color: '#F59E0B' },
  { key: 'accepted', label: 'Accepted', color: '#059669' },
  { key: 'declined', label: 'Declined', color: '#EF4444' },
  { key: 'lost', label: 'Lost', color: '#6B7280' },
];

const SOURCE_OPTIONS = ['Website', 'Phone', 'Email', 'Referral', 'Walk-in', 'Social Media', 'Other'];

export default function LeadsPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('LeadsPage');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', source: 'Phone',
    property_address: '', survey_type: 'boundary', estimated_acreage: '',
    notes: '',
  });

  const isAdminUser = session?.user?.roles?.includes('admin') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeFetch<{ leads: Lead[] }>('/api/admin/leads');
      setLeads(res?.leads ?? []);
    } finally {
      setLoading(false);
    }
  }, [safeFetch]);

  useEffect(() => { if (isAdminUser) void load(); }, [isAdminUser, load]);

  async function saveLead() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await safeAction('saving lead', async () => {
        const res = await fetch('/api/admin/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            estimated_acreage: form.estimated_acreage.trim() === '' ? null : Number(form.estimated_acreage),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
      });
      setForm({ name: '', email: '', phone: '', company: '', source: 'Phone', property_address: '', survey_type: 'boundary', estimated_acreage: '', notes: '' });
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(lead: Lead, status: string) {
    await safeAction('updating lead', async () => {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  async function deleteLead(id: string) {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    await safeAction('deleting lead', async () => {
      const res = await fetch(`/api/admin/leads?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `Server ${res.status}`);
    });
    await load();
  }

  if (!session?.user) return null;
  if (!isAdminUser) return null;

  const filtered = statusFilter === 'all' ? leads : leads.filter(l => l.status === statusFilter);

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <h2 className="jobs-page__title">Leads</h2>
          <span className="jobs-page__count">{leads.length} total</span>
        </div>
        <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => setShowForm(!showForm)}>
          + New Lead
        </button>
      </div>

      {/* Status filter */}
      <div className="jobs-page__pipeline">
        <button
          className={`jobs-page__pipeline-stage ${statusFilter === 'all' ? 'jobs-page__pipeline-stage--active' : ''}`}
          onClick={() => setStatusFilter('all')}
          style={{ '--stage-color': '#374151' } as React.CSSProperties}
        >
          <span className="jobs-page__pipeline-label">All</span>
          <span className="jobs-page__pipeline-count">{leads.length}</span>
        </button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.key}
            className={`jobs-page__pipeline-stage ${statusFilter === s.key ? 'jobs-page__pipeline-stage--active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
            style={{ '--stage-color': s.color } as React.CSSProperties}
          >
            <span className="jobs-page__pipeline-label">{s.label}</span>
            <span className="jobs-page__pipeline-count">{leads.filter(l => l.status === s.key).length}</span>
          </button>
        ))}
      </div>

      {/* New Lead Form */}
      {showForm && (
        <div className="job-form" style={{ marginBottom: '1.5rem' }}>
          <div className="job-form__section">
            <h3 className="job-form__section-title">New Lead</h3>
            <div className="job-form__grid">
              <div className="job-form__field">
                <label className="job-form__label">Name *</label>
                <input className="job-form__input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Contact name" />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Email</label>
                <input className="job-form__input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Phone</label>
                <input className="job-form__input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Company</label>
                <input className="job-form__input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Source</label>
                <select className="job-form__select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                  {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="job-form__field">
                <label className="job-form__label">Property Address</label>
                <input className="job-form__input" value={form.property_address} onChange={e => setForm(f => ({ ...f, property_address: e.target.value }))} />
              </div>
              <div className="job-form__field job-form__field--full">
                <label className="job-form__label">Notes</label>
                <textarea className="job-form__textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="job-form__actions">
              <button className="job-form__cancel" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button className="job-form__submit" onClick={() => void saveLead()} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : 'Save Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leads list */}
      {loading ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">⏳</span>
          <h3>Loading leads…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">📨</span>
          <h3>{leads.length === 0 ? 'No leads yet' : 'No leads match this filter'}</h3>
          <p>Add your first lead to start tracking potential clients.</p>
        </div>
      ) : (
        <div className="jobs-page__grid">
          {filtered.map(lead => (
            <div key={lead.id} className="job-card">
              <div className="job-card__header">
                <span className="job-card__stage" style={{ background: STATUS_OPTIONS.find(s => s.key === lead.status)?.color }}>
                  {STATUS_OPTIONS.find(s => s.key === lead.status)?.label}
                </span>
              </div>
              <h3 className="job-card__name">{lead.name}</h3>
              <p className="job-card__client">{lead.company || lead.email || lead.phone || '—'}</p>
              {lead.property_address && <p className="job-card__address">{lead.property_address}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center' }}>
                <select
                  className="job-form__select"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', flex: 1 }}
                  value={lead.status}
                  onChange={e => void changeStatus(lead, e.target.value)}
                >
                  {STATUS_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button
                  className="jobs-page__btn"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: '#EF4444' }}
                  onClick={() => void deleteLead(lead.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
