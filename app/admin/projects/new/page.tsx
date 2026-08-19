// app/admin/projects/new/page.tsx — create a project.
//
// The form asks for the client and the site ONCE. That is the whole economic argument for the
// project layer: the boundary survey, the topo and the staking on the Smith Tract used to be three
// jobs each carrying its own retyped copy of the same client and address, with three chances to
// disagree. Everything entered here is inherited by every job created inside the project.
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderKanban, ArrowLeft, Check, Wand2 } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';
import { suggestProjectName } from '@/lib/projects/model';

export default function NewProjectPage() {
  const router = useRouter();
  const { reportPageError } = usePageError('NewProjectPage');
  const [error, setErrorText] = useState<string | null>(null);
  const setError = (m: string) => { setErrorText(m); reportPageError(m); };

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '',
    client_name: '', client_company: '', client_email: '', client_phone: '',
    address: '', city: '', state: 'TX', zip: '', county: '',
    subdivision: '', abstract_number: '', lot_number: '', acreage: '',
    notes: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── The name suggestion ────────────────────────────────────────────────────────────────────
  //
  // Owner, 2026-08-19: *"We will likely name the project by the name of the customer or location or
  // date or some combination of all 3."* So the app offers exactly that combination rather than
  // leaving a blank box and a habit to remember. It is a SUGGESTION, not a format: the name stays
  // free text, because the day somebody needs "Smith Tract — re-survey after the flood" is the day
  // an enforced pattern becomes an obstacle.
  const suggestion = useMemo(
    () => suggestProjectName({
      client: form.client_company || form.client_name,
      location: form.subdivision || form.address || form.city,
      date: new Date(),
    }),
    [form.client_company, form.client_name, form.subdivision, form.address, form.city],
  );
  const canSuggest = suggestion.length > 0 && suggestion !== form.name.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('A project name is required.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        // An empty acreage box means "not known", not zero — sending 0 would claim the parcel has
        // no area, and that number ends up on reports.
        acreage: form.acreage.trim() ? Number.parseFloat(form.acreage) : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not create the project.');
      return;
    }
    const { project } = await res.json();
    // Straight into the project, which is where the next thing to do — add a job — lives.
    router.push(`/admin/projects/${project.id}`);
  }

  return (
    <div className="proj-page">
      <div className="proj-page__header">
        <div className="proj-page__header-left">
          <h1 className="proj-page__title"><FolderKanban size={20} aria-hidden /> New Project</h1>
        </div>
        <div className="proj-page__header-actions">
          <Link href="/admin/projects" className="proj-page__btn proj-page__btn--secondary">
            <ArrowLeft size={15} aria-hidden /> All Projects
          </Link>
        </div>
      </div>

      <form onSubmit={submit} className="pf">
        {error && <div className="proj-page__error" role="alert">{error}</div>}
        <p className="pf__lead">
          The client and site you enter here are inherited by every job you create inside this
          project, so they only need typing once. A job can still override any of them.
        </p>

        <fieldset className="pf__set">
          <legend>The project</legend>
          <label className="pf__field pf__field--wide">
            <span>Project name *</span>
            <input value={form.name} onChange={set('name')} required placeholder="Smith Holdings — Los Ebanos Estates — Aug 2026" data-testid="proj-name" />
          </label>
          {canSuggest && (
            <p className="pf__suggest pf__field--wide">
              <button type="button" className="pf__suggest-btn" onClick={() => setForm((f) => ({ ...f, name: suggestion }))} data-testid="proj-name-suggest">
                <Wand2 size={13} aria-hidden /> Use &ldquo;{suggestion}&rdquo;
              </button>
              <span> — built from the client, the location and today&rsquo;s date.</span>
            </p>
          )}
          <label className="pf__field pf__field--wide">
            <span>Description</span>
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="What this engagement covers" />
          </label>
        </fieldset>

        <fieldset className="pf__set">
          <legend>Client</legend>
          <label className="pf__field"><span>Contact name</span><input value={form.client_name} onChange={set('client_name')} /></label>
          <label className="pf__field"><span>Company</span><input value={form.client_company} onChange={set('client_company')} /></label>
          <label className="pf__field"><span>Email</span><input type="email" value={form.client_email} onChange={set('client_email')} /></label>
          <label className="pf__field"><span>Phone</span><input value={form.client_phone} onChange={set('client_phone')} /></label>
        </fieldset>

        <fieldset className="pf__set">
          <legend>Site</legend>
          <label className="pf__field pf__field--wide"><span>Address</span><input value={form.address} onChange={set('address')} /></label>
          <label className="pf__field"><span>City</span><input value={form.city} onChange={set('city')} /></label>
          <label className="pf__field"><span>State</span><input value={form.state} onChange={set('state')} maxLength={2} /></label>
          <label className="pf__field"><span>ZIP</span><input value={form.zip} onChange={set('zip')} /></label>
          <label className="pf__field"><span>County</span><input value={form.county} onChange={set('county')} /></label>
          <label className="pf__field"><span>Subdivision</span><input value={form.subdivision} onChange={set('subdivision')} /></label>
          <label className="pf__field"><span>Lot</span><input value={form.lot_number} onChange={set('lot_number')} /></label>
          <label className="pf__field"><span>Abstract no.</span><input value={form.abstract_number} onChange={set('abstract_number')} /></label>
          <label className="pf__field"><span>Acreage</span><input type="number" step="0.01" value={form.acreage} onChange={set('acreage')} /></label>
        </fieldset>

        <fieldset className="pf__set">
          <legend>Notes</legend>
          <label className="pf__field pf__field--wide">
            <span className="pf__sr">Notes</span>
            <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Anything the crew should know about this engagement" />
          </label>
        </fieldset>

        <div className="pf__foot">
          <Link href="/admin/projects" className="proj-page__btn proj-page__btn--secondary">Cancel</Link>
          <button type="submit" className="proj-page__btn proj-page__btn--primary" disabled={saving} data-testid="proj-save">
            <Check size={15} aria-hidden /> {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}
