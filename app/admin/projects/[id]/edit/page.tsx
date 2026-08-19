// app/admin/projects/[id]/edit/page.tsx — correct a project after it exists.
//
// ── WHY THIS WAS THE GAP WORTH CLOSING ──────────────────────────────────────────────────────────
//
// The PATCH route accepted every field from the day it was written, and the only UI that ever called
// it set `status`. So a project was create-only: a typo in the client's name, a wrong county, a
// changed phone number — none of them could be fixed from the product.
//
// That is worse here than on an ordinary record, because a project's client and site are the values
// every NEW job inherits. An uncorrectable typo does not sit still; it propagates into every job
// created afterwards, and each of those copies is what ends up on a drawing.
//
// ── WHAT EDITING DOES *NOT* DO ──────────────────────────────────────────────────────────────────
//
// It does not touch the jobs already inside the project. Inheritance happens once, at creation, and
// a job's copy is then its own — see `lib/projects/model.ts`. Pushing an edit down would overwrite
// a job whose address was deliberately different (the adjoining parcel, the buyer rather than the
// seller), and that job's own record is the one that gets printed. The page says so, rather than
// leaving somebody to assume either behaviour.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FolderKanban, ArrowLeft, Check, Archive, ArchiveRestore } from 'lucide-react';
import { usePageError } from '../../../hooks/usePageError';

const FIELDS = [
  'name', 'description',
  'client_name', 'client_company', 'client_email', 'client_phone',
  'address', 'city', 'state', 'zip', 'county',
  'subdivision', 'abstract_number', 'lot_number', 'acreage',
  'notes',
] as const;

type Form = Record<(typeof FIELDS)[number], string>;

const EMPTY: Form = FIELDS.reduce((a, f) => ({ ...a, [f]: '' }), {} as Form);

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { reportPageError } = usePageError('EditProjectPage');
  const [error, setErrorText] = useState<string | null>(null);
  const setError = useCallback((m: string) => { setErrorText(m); reportPageError(m); }, [reportPageError]);

  const [form, setForm] = useState<Form>(EMPTY);
  const [number, setNumber] = useState<string>('');
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/projects/${id}`);
      setLoading(false);
      if (!res.ok) { setError('Could not load that project.'); return; }
      const { project } = await res.json();
      setNumber(project.project_number ?? '');
      setArchived(Boolean(project.is_archived));
      setForm(FIELDS.reduce((a, f) => ({
        ...a,
        // `null` and `0` both have to survive the round trip as something an input can hold, and an
        // absent value must become '' rather than the string "null".
        [f]: project[f] === null || project[f] === undefined ? '' : String(project[f]),
      }), {} as Form));
    })();
  }, [id, setError]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('A project name is required.'); return; }
    setSaving(true);
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        // A cleared box means "no longer known", which is null — not the empty string, which would
        // read as a real value of nothing and print as a blank line on a report.
        ...Object.fromEntries(FIELDS.map((f) => [f, form[f].trim() === '' ? null : form[f]])),
        acreage: form.acreage.trim() ? Number.parseFloat(form.acreage) : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not save the project.');
      return;
    }
    router.push(`/admin/projects/${id}`);
  }

  async function toggleArchive() {
    setSaving(true);
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: !archived }),
    });
    setSaving(false);
    if (!res.ok) { setError('Could not change the archive state.'); return; }
    setArchived(!archived);
  }

  if (loading) {
    return <div className="proj-page"><div className="proj-page__loading"><p>Loading project…</p></div></div>;
  }

  return (
    <div className="proj-page">
      <div className="proj-page__header">
        <div className="proj-page__header-left">
          <h1 className="proj-page__title"><FolderKanban size={20} aria-hidden /> Edit {number || 'project'}</h1>
        </div>
        <div className="proj-page__header-actions">
          <Link href={`/admin/projects/${id}`} className="proj-page__btn proj-page__btn--secondary">
            <ArrowLeft size={15} aria-hidden /> Back to project
          </Link>
        </div>
      </div>

      <form onSubmit={save} className="pf">
        {error && <div className="proj-page__error" role="alert">{error}</div>}
        <p className="pf__lead">
          These are the project&rsquo;s own details. Changing them does <strong>not</strong> change
          the jobs already inside it — each job kept its own copy when it was created, and that copy
          is what appears on its drawings. New jobs will inherit whatever you save here.
        </p>

        <fieldset className="pf__set">
          <legend>The project</legend>
          <label className="pf__field pf__field--wide">
            <span>Project name *</span>
            <input value={form.name} onChange={set('name')} required data-testid="proj-edit-name" />
          </label>
          <label className="pf__field pf__field--wide">
            <span>Description</span>
            <textarea value={form.description} onChange={set('description')} rows={2} />
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
            <textarea value={form.notes} onChange={set('notes')} rows={3} />
          </label>
        </fieldset>

        <fieldset className="pf__set">
          <legend>Archive</legend>
          <div className="pf__field pf__field--wide">
            <button type="button" className="proj-page__btn proj-page__btn--secondary" onClick={toggleArchive} disabled={saving} data-testid="proj-archive">
              {archived ? <><ArchiveRestore size={15} aria-hidden /> Un-archive</> : <><Archive size={15} aria-hidden /> Archive project</>}
            </button>
            <p className="pd__note">
              {archived
                ? 'This project is archived — it is hidden from the main list until un-archived.'
                : 'Archiving hides it from the main list without deleting anything. Its jobs are untouched.'}
            </p>
          </div>
        </fieldset>

        <div className="pf__foot">
          <Link href={`/admin/projects/${id}`} className="proj-page__btn proj-page__btn--secondary">Cancel</Link>
          <button type="submit" className="proj-page__btn proj-page__btn--primary" disabled={saving} data-testid="proj-edit-save">
            <Check size={15} aria-hidden /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
