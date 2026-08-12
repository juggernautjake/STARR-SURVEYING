'use client';
// app/admin/components/jobs/JobRefPicker.tsx
//
// Pick the job something belongs to — and create it here if it does not exist yet.
//
// THE PROBLEM THIS REPLACES
//
// The receipt-capture page asked for a "Job number (optional)" as free text and posted it into
// `receipts.job_id`, a UUID column. Typing `24-103` — the literal thing the label asked for — failed
// on insert. The only input the field accepted was a UUID nobody carries in their head, so in
// practice every receipt was filed against no job at all.
//
// THE PART THAT IS NOT A BUG FIX
//
// Owner, 2026-08-11: *"it might be that we have not created a job yet on the backend, but that we
// are working on that job… it should prompt us if we want to create a new job to place that file or
// receipt into so we can find it later."*
//
// Crews start work before the office types the job in. So "no such job" is offered as a NEXT STEP,
// not an error: the picker shows a Create panel seeded with whatever was typed, takes the few facts
// the person actually knows standing in a parking lot (number, name, client, address), and hands
// back a real job id — without leaving the page, which matters because the thing they would abandon
// is a photo of a receipt they are about to throw away.
//
// WHY IT IS SHARED
//
// Receipts and job files ask the same question, and the same answer has to be reachable from both.
// Two copies would drift the moment one of them learned something the other did not — the defect
// this repo has fixed more times than any other.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, FolderPlus, Loader2, Search, X } from 'lucide-react';

import './JobRefPicker.css';

export interface JobRefOption {
  id: string;
  name: string;
  job_number: string | null;
  client_name?: string | null;
  address?: string | null;
  stage?: string | null;
}

interface JobRefPickerProps {
  /** Currently selected job, or null for unassigned. */
  value: JobRefOption | null;
  onChange: (job: JobRefOption | null) => void;
  label?: string;
  /** Shown under the control. */
  hint?: string;
  disabled?: boolean;
  /** Text for the "no job" option. Null hides it (job becomes required). */
  clearLabel?: string | null;
  /** Rendered small, for table rows and expanded receipt panels. */
  compact?: boolean;
}

export function jobRefLabel(job: JobRefOption): string {
  return job.job_number ? `${job.job_number} · ${job.name}` : job.name;
}

const SEARCH_DEBOUNCE_MS = 250;

export default function JobRefPicker({
  value,
  onChange,
  label = 'Job',
  hint,
  disabled = false,
  clearLabel = 'No job — office / overhead expense',
  compact = false,
}: JobRefPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JobRefOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced type-ahead. `cancelled` rather than an AbortController because an out-of-order
  // response is the whole risk here — a slow "he" landing after a fast "henry" would repaint the
  // list with results for text that is no longer in the box.
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/jobs/resolve?q=${encodeURIComponent(term)}`);
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { jobs?: JobRefOption[] };
          if (!cancelled) setResults(data.jobs ?? []);
        } catch {
          // A failed search must not look like "no such job" — that would push someone into
          // creating a duplicate of a job that exists. The Create panel stays available either way,
          // but the empty-state copy below distinguishes the two cases.
          if (!cancelled) setResults([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  // Click-away closes the dropdown. Pointerdown rather than click so a tap that starts outside is
  // caught before the browser decides what it was — on a phone, a click listener here loses to a
  // scroll gesture and leaves the panel open over the content.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const select = useCallback(
    (job: JobRefOption | null) => {
      onChange(job);
      setOpen(false);
      setCreating(false);
      setQuery('');
    },
    [onChange],
  );

  return (
    <div className={`jobref${compact ? ' jobref--compact' : ''}`} ref={wrapRef}>
      {label ? <span className="jobref__label">{label}</span> : null}

      {value ? (
        <div className="jobref__selected">
          <Check size={14} aria-hidden className="jobref__selected-tick" />
          <span className="jobref__selected-text">{jobRefLabel(value)}</span>
          <button
            type="button"
            className="jobref__clear"
            onClick={() => select(null)}
            disabled={disabled}
            aria-label="Clear the selected job"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="jobref__control">
          <Search size={15} aria-hidden className="jobref__search-icon" />
          <input
            type="text"
            className="jobref__input"
            value={query}
            placeholder="Job number, name, client or address"
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
          />
          {searching ? <Loader2 size={15} className="jobref__spinner" aria-hidden /> : null}
        </div>
      )}

      {open && !value ? (
        <div className="jobref__panel" id={listId} role="listbox">
          {creating ? (
            <CreateJobPanel
              seed={query.trim()}
              onCancel={() => setCreating(false)}
              onCreated={(job) => select(job)}
            />
          ) : (
            <>
              {clearLabel ? (
                <button type="button" className="jobref__option jobref__option--none" onClick={() => select(null)}>
                  {clearLabel}
                </button>
              ) : null}

              {results.map((job) => (
                <button
                  type="button"
                  key={job.id}
                  className="jobref__option"
                  role="option"
                  aria-selected={false}
                  onClick={() => select(job)}
                >
                  <span className="jobref__option-title">{jobRefLabel(job)}</span>
                  {job.client_name || job.address ? (
                    <span className="jobref__option-sub">
                      {[job.client_name, job.address].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </button>
              ))}

              {query.trim() && !searching && results.length === 0 ? (
                <p className="jobref__empty">
                  No job matches &ldquo;{query.trim()}&rdquo;.
                </p>
              ) : null}

              {/* Always offered, not only on an empty result. Somebody who searched "Henry" and got
                  three old Henry jobs may still be standing on a brand-new fourth one, and hiding
                  Create behind "no results" is how they end up filing against the wrong one. */}
              <button
                type="button"
                className="jobref__create-cta"
                onClick={() => setCreating(true)}
              >
                <FolderPlus size={15} aria-hidden />
                {query.trim() ? `Create job “${query.trim()}”` : 'Create a new job'}
              </button>
            </>
          )}
        </div>
      ) : null}

      {hint ? <span className="jobref__hint">{hint}</span> : null}
    </div>
  );
}

// ── Create panel ────────────────────────────────────────────────────────────────────────────────

/**
 * The minimum a job needs to exist, and nothing more.
 *
 * Only `name` is required — that matches `/api/admin/jobs`, which generates the job number when one
 * is not supplied. Asking a field crew for a survey type, an acreage and a deadline before they can
 * file a fuel receipt would send them back to filing it against nothing, which is the behaviour this
 * whole component exists to end. The office fills in the rest later on the job page.
 *
 * The seed is smart about what was typed: `24-103` looks like a job number, anything else reads as a
 * name. Getting that backwards would create a job literally named "24-103" with an auto-generated
 * number beside it, and the duplicate would not be found by the next person who searched for it.
 */
function CreateJobPanel({
  seed,
  onCancel,
  onCreated,
}: {
  seed: string;
  onCancel: () => void;
  onCreated: (job: JobRefOption) => void;
}) {
  const seedLooksLikeNumber = /^\d{2,4}[-–]?\d{1,5}$/.test(seed);
  const [jobNumber, setJobNumber] = useState(seedLooksLikeNumber ? seed : '');
  const [name, setName] = useState(seedLooksLikeNumber ? '' : seed);
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          job_number: jobNumber.trim() || undefined,
          client_name: clientName.trim() || undefined,
          address: address.trim() || undefined,
          notes: 'Created from the field while filing a receipt or file.',
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { job?: JobRefOption; error?: string }
        | null;
      if (!res.ok || !data?.job) {
        throw new Error(data?.error ?? `Could not create the job (${res.status})`);
      }
      onCreated(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="jobref__create">
      <p className="jobref__create-title">New job</p>
      <p className="jobref__create-blurb">
        This makes the job folder now so the upload has somewhere to live. The office can fill in
        the rest later.
      </p>

      <label className="jobref__field">
        <span>Job name *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Henry tract boundary"
          autoFocus
          disabled={busy}
        />
      </label>

      <label className="jobref__field">
        <span>Job number</span>
        <input
          type="text"
          value={jobNumber}
          onChange={(e) => setJobNumber(e.target.value)}
          placeholder="Leave blank and one is assigned"
          disabled={busy}
        />
      </label>

      <label className="jobref__field">
        <span>Client</span>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="jobref__field">
        <span>Address / location</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={busy}
        />
      </label>

      {error ? <p className="jobref__error" role="alert">{error}</p> : null}

      <div className="jobref__create-actions">
        <button type="button" className="jobref__btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="jobref__btn jobref__btn--primary"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
        >
          {busy ? 'Creating…' : 'Create job & use it'}
        </button>
      </div>
    </div>
  );
}
