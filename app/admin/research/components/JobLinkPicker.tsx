'use client';

// app/admin/research/components/JobLinkPicker.tsx — attach a research project to a job (Phase J1).
//
// ── A COLUMN WITH NO UI, AND NO WAY TO CHANGE IT ────────────────────────────────────────────────
//
// `research_projects.job_id` has existed since `seeds/090_research_tables.sql`, with an index on it
// (`idx_research_projects_job`) and a comment saying "optional link to a jobs record". Measured
// 2026-08-31: **zero `.tsx` under `app/admin/research` mentioned it**, and the PATCH route's
// allowlist did not include it — so even the API could only set it at creation, where nothing sent
// it either.
//
// A column, an index and a create-time parameter, and no way in the product to use any of them.
// Owner: *"can link the research to a specific job if they want"*.
//
// ── WHY A SEARCH RATHER THAN A `<select>` ───────────────────────────────────────────────────────
//
// A dropdown of every job is fine at two jobs and useless at two hundred, and the thing somebody
// knows is the job NUMBER or the address — not its position in a list. So: type, see matches, pick
// one. The same shape the project search already uses, debounced the same way.
//
// ── AND IT SHOWS WHAT IS LINKED, NOT JUST THAT SOMETHING IS ─────────────────────────────────────
//
// A picker that renders "Linked" and nothing else makes you open another tab to find out to what.
// The current link is a real link, with the job number and address on it.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './JobLinkPicker.css';

export interface JobSummary {
  id: string;
  job_number?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  stage?: string | null;
}

export interface JobLinkPickerProps {
  /** The currently linked job id, or null. */
  value: string | null;
  onChange: (jobId: string | null) => void;
  /** Rendered when a job is linked, so the label does not need a second fetch. */
  linked?: JobSummary | null;
  disabled?: boolean;
  id?: string;
}

/** One line that names a job the way a person would. Never empty — see the note in document-rows. */
export function jobLabel(job: JobSummary): string {
  const num = (job.job_number ?? '').trim();
  const name = (job.name ?? '').trim();
  const where = [job.address, job.city].filter(Boolean).join(', ').trim();
  const head = [num, name].filter(Boolean).join(' — ');
  if (head && where) return `${head} · ${where}`;
  return head || where || `Job ${job.id.slice(0, 8)}`;
}

export default function JobLinkPicker({
  value, onChange, linked, disabled, id = 'job-link',
}: JobLinkPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JobSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs?limit=8&search=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { jobs?: JobSummary[] } | JobSummary[];
      setResults(Array.isArray(body) ? body : (body.jobs ?? []));
    } catch (err) {
      // Said out loud rather than rendered as "no matches". They are different answers to
      // "which jobs are there", and one of them means try again.
      setError(String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(query), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, search]);

  if (value && linked) {
    return (
      <div className="job-link job-link--set">
        <span className="job-link__label">Linked to</span>
        <a className="job-link__current" href={`/admin/jobs/${value}`}>{jobLabel(linked)}</a>
        <button
          type="button"
          className="job-link__clear"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className="job-link">
      <label className="job-link__label" htmlFor={id}>Link to a job (optional)</label>
      <input
        id={id}
        className="job-link__input"
        type="text"
        placeholder="Job number, name or address…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={`${id}-results`}
      />
      {searching && <div className="job-link__note">Searching…</div>}
      {error && <div className="job-link__note job-link__note--error" role="alert">Could not search jobs: {error}</div>}
      {open && !searching && !error && query.trim() !== '' && results.length === 0 && (
        <div className="job-link__note">No job matches “{query}”.</div>
      )}
      {open && results.length > 0 && (
        <ul className="job-link__results" id={`${id}-results`} role="listbox">
          {results.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                className="job-link__result"
                role="option"
                aria-selected={false}
                onClick={() => { onChange(job.id); setOpen(false); setQuery(''); }}
              >
                {jobLabel(job)}
                {job.stage && <span className="job-link__stage">{job.stage}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
