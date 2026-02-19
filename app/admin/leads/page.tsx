// app/admin/leads/page.tsx — Leads management (admin only)
'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  status: string;
  notes: string;
  property_address: string;
  survey_type: string;
  estimated_acreage: number;
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
  const [leads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', source: 'Phone',
    property_address: '', survey_type: 'boundary', estimated_acreage: '',
    notes: '',
  });

  if (!session?.user) return null;

  // Admin-only page guard
  if (session.user.role !== 'admin') return null;

  const filtered = statusFilter === 'all' ? leads : leads.filter(l => l.status === statusFilter);

  return (
    <>
      <UnderConstruction
        feature="Leads Management"
        description="Track potential clients from first contact to signed contract. Manage the sales pipeline, follow up on quotes, and convert leads into jobs."
      />

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
                <button className="job-form__cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="job-form__submit" disabled>Save Lead</button>
              </div>
            </div>
          </div>
        )}

        {/* Leads list */}
        {filtered.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">📨</span>
            <h3>No leads yet</h3>
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
                <p className="job-card__client">{lead.company || lead.email || lead.phone}</p>
                <p className="job-card__address">{lead.property_address}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Leads — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Database Table:</strong> Create <code>leads</code> table in Supabase with columns: id, name, email, phone, company, source, status, notes, property_address, survey_type, estimated_acreage, assigned_to, created_at, updated_at, converted_job_id</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/leads/route.ts</code> with GET (list/filter), POST (create), PUT (update status/details), DELETE</li>
            <li><strong>Lead-to-Job Conversion:</strong> "Convert to Job" button that creates a new job pre-filled with lead data and links converted_job_id</li>
            <li><strong>Follow-up Tracking:</strong> Add follow_up_date column, show overdue follow-ups prominently</li>
            <li><strong>Activity Log:</strong> Track all interactions (calls, emails, meetings) on each lead</li>
            <li><strong>Quote Integration:</strong> Generate and send quotes from lead detail view</li>
            <li><strong>Email Integration:</strong> Send follow-up emails directly from the lead card</li>
            <li><strong>Analytics:</strong> Conversion rates, lead sources breakdown, average time to close</li>
            <li><strong>Kanban Board:</strong> Drag-and-drop leads between status columns</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build the Leads Management system at /admin/leads/page.tsx.

CURRENT STATE: UI shell with status pipeline filter, new lead form (not connected), empty state. No database table or API yet.

DATABASE SCHEMA NEEDED:
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT DEFAULT 'Phone',
  status TEXT CHECK (status IN ('new','contacted','quoted','accepted','declined','lost')) DEFAULT 'new',
  notes TEXT,
  property_address TEXT,
  city TEXT,
  state TEXT DEFAULT 'TX',
  survey_type TEXT,
  estimated_acreage NUMERIC,
  quote_amount NUMERIC,
  assigned_to TEXT,
  follow_up_date TIMESTAMPTZ,
  converted_job_id UUID REFERENCES jobs(id),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

API NEEDED: /api/admin/leads/route.ts
- GET: List leads with status filter, search, pagination
- POST: Create new lead
- PUT: Update lead status, details, assign to user
- DELETE: Remove lead

NEXT STEPS:
1. Create leads table in Supabase (run migration SQL)
2. Build /api/admin/leads/route.ts with full CRUD
3. Connect form to API for creating leads
4. Add lead detail view with activity timeline
5. Build "Convert to Job" action
6. Add follow-up date tracking with overdue alerts
7. Build Kanban board view for drag-drop status changes
8. Add lead analytics dashboard (conversion rates, sources)
9. Email integration for follow-up communications
10. Import leads from CSV`}</pre>
        </div>
      </div>
    </>
  );
}
