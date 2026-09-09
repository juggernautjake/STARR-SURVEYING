'use client';

// app/admin/research/components/NewResearchProjectModal.tsx — the intake form for a research project.
//
// ── THE DRAWING (owner, 2026-09-09: "Initial Research Information Input Modal.pdf") ─────────────
//
// Six sections in one scrolling column, each a rounded card with its title on the border and an
// "ⓘ More Info" button at the bottom right that opens a short explanation:
//
//   1. Project name        optional — auto-named from the address or Property ID when blank
//   2. Where is it?        street number & name, unit, city, state, ZIP, county
//   3. Additional Information   Property ID, then "+ Add Info" → a category picker; each category
//                          renders its own field shape with an ENFORCED format (lib/research/intake-info.ts)
//   4. File Upload         deeds, plats, surveys, photos — listed with size and a View button
//   5. Link to a project   search projects, confirm one, tick the jobs it relates to
//   6. Additional Notes    prose for the AI
//
// ── WHAT THIS FORM DOES NOT DO, ON PURPOSE ──────────────────────────────────────────────────────
//
// Owner, same day: "The modal should not handle all of the settings, but should just be used to take
// in information and set things up." So the spend gate, the run budget and the readiness verdict
// that the previous form carried are gone from here — they belong to the research page, where the
// run is configured. And the analysis of the attached files and notes is NOT done here either: "we
// will push back the analysis of any initial notes or documents to the start of the actual research
// run. The first thing that the system will do is take any user-given info and analyze it fully."
// The form's whole job is to store everything, in the shape that analysis will read.
//
// ── WHAT IT KEEPS FROM THE OLD FORM ─────────────────────────────────────────────────────────────
//
// The street number and name are separate fields under one label, because that is how every county
// appraisal district indexes them (seed 624 — joining them is what made searches come back empty).
// The county is checked against the 254-county list as advice (CountyNote). The upload goes through
// the project page's own signed-URL uploader, so there is one size cap and one validation list. A
// job deep link (`?new=1&job=<id>`) still pre-fills the address and pre-links — now to the job's
// project AND the job — and says so when the job had no county on it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Info, FileText, Image as ImageIcon, Eye, Trash2, Search, Link2, Check,
  User, Users, Hash, BookOpen, Layers, Map as MapIcon, Landmark, Fingerprint, ScrollText,
  Ruler, MapPin, CalendarDays, Crosshair, Tag, Briefcase, Loader2, type LucideIcon,
} from 'lucide-react';
import { checkCounty } from '@/lib/research/county-input';
import CountyNote, { countyDescribedBy, isCountyInvalid } from './CountyNote';
import { checkScope } from '@/lib/research/scope';
import ScopeNotice from './ScopeNotice';
import { composeAddress, splitFullAddress } from '@/lib/research/property-address';
import {
  INFO_CATEGORIES, INFO_CATEGORY_BY_ID, US_STATES, checkLine, linesToSupplemental,
  type IntakeInfoLine, type InfoCategoryId, type InfoFieldSpec,
} from '@/lib/research/intake-info';
import { uploadDocuments, validateFiles, formatFileSize, ACCEPT_ATTRIBUTE } from './upload-documents';
import { usePageError } from '../../hooks/usePageError';
import './NewResearchProjectModal.css';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  project_number?: string | null;
  name?: string | null;
  client_name?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  status?: string | null;
}

export interface LinkableJob {
  id: string;
  job_number?: string | null;
  name?: string | null;
  survey_type?: string | null;
  stage?: string | null;
  address?: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
}

export interface NewResearchProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** `?new=1&job=<id>` — pre-fill from the job and pre-link its project and itself. */
  jobIdFromLink?: string | null;
}

interface FormState {
  name: string;
  street_number: string;
  street_name: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcel_id: string;
  intake_notes: string;
  project_id: string | null;
  job_ids: string[];
}

const EMPTY_FORM: FormState = {
  name: '', street_number: '', street_name: '', unit: '', city: '', state: 'TX', zip: '',
  county: '', parcel_id: '', intake_notes: '', project_id: null, job_ids: [],
};

const CATEGORY_ICON: Record<InfoCategoryId, LucideIcon> = {
  owner_current: User, owner_previous: Users, instrument: Hash, volume_page: BookOpen,
  cabinet_slide: Layers, subdivision: MapIcon, abstract: Landmark, geo_id: Fingerprint,
  legal_description: ScrollText, acreage: Ruler, prior_address: MapPin, recorded_date: CalendarDays,
  coordinates: Crosshair, other: Tag,
};

// ── Small pieces ──────────────────────────────────────────────────────────

/** The "ⓘ More Info" button at a section's bottom right, and the card it opens. The card renders
 *  IN FLOW under the section's fields rather than floating: the form is a scrolling column, and a
 *  floating card above the first section or below the last was clipped by the scroll area. */
function SectionInfo({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: (open: boolean) => void; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onToggle(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onToggle]);
  return (
    <>
      {open ? (
        <div className="nrp-info__card" role="dialog" aria-label={title}>
          <div className="nrp-info__head">
            <strong>{title}</strong>
            <button type="button" className="nrp-info__close" onClick={() => onToggle(false)} aria-label="Close">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="nrp-info__body">{children}</div>
        </div>
      ) : null}
      <div className="nrp-info">
        <button
          type="button"
          className={`nrp-info__btn${open ? ' nrp-info__btn--open' : ''}`}
          onClick={() => onToggle(!open)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Info size={14} aria-hidden="true" />
          More Info
        </button>
      </div>
    </>
  );
}

function Section({ title, step, children, info, infoTitle }: {
  title: string; step: number; children: React.ReactNode; info: React.ReactNode; infoTitle?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section className="nrp-section" aria-labelledby={`nrp-section-${step}`}>
      <h3 className="nrp-section__title" id={`nrp-section-${step}`}>
        <span className="nrp-section__step" aria-hidden="true">{step}</span>
        {title}
      </h3>
      <div className="nrp-section__body">{children}</div>
      <SectionInfo title={infoTitle ?? title} open={infoOpen} onToggle={setInfoOpen}>{info}</SectionInfo>
    </section>
  );
}

function Label({ htmlFor, children, required, optional }: { htmlFor: string; children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <label className="nrp-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="nrp-label__req" aria-label="required">*</span> : null}
      {optional ? <span className="nrp-label__opt">optional</span> : null}
    </label>
  );
}

// ── Additional information lines ──────────────────────────────────────────

function InfoLineField({ line, field, error, onChange }: {
  line: IntakeInfoLine; field: InfoFieldSpec; error?: string;
  onChange: (key: string, value: string) => void;
}) {
  const id = `nrp-line-${line.key}-${field.key}`;
  return (
    <span className={`nrp-line__field nrp-line__field--${field.width}`}>
      <input
        id={id}
        className={`nrp-input${error ? ' nrp-input--invalid' : ''}`}
        type={field.type ?? 'text'}
        inputMode={field.inputMode}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        maxLength={field.maxLength}
        autoComplete="off"
        value={line.values[field.key] ?? ''}
        onChange={(e) => onChange(field.key, field.sanitize(e.target.value))}
      />
      {error ? <span className="nrp-line__err" id={`${id}-err`}>{error}</span> : null}
    </span>
  );
}

function InfoLines({ lines, onChange, showErrors }: { lines: IntakeInfoLine[]; onChange: (l: IntakeInfoLine[]) => void; showErrors: boolean }) {
  const [picking, setPicking] = useState(false);
  const counter = useRef(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    const onClick = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicking(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPicking(false); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey, true); };
  }, [picking]);

  const add = (category: InfoCategoryId) => {
    counter.current += 1;
    onChange([...lines, { key: `l${counter.current}`, category, values: {} }]);
    setPicking(false);
  };
  const update = (key: string, fieldKey: string, value: string) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, values: { ...l.values, [fieldKey]: value } } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  return (
    <div className="nrp-lines" data-testid="intake-info">
      {lines.map((line) => {
        const spec = INFO_CATEGORY_BY_ID[line.category];
        const check = checkLine(line);
        const Icon = CATEGORY_ICON[line.category];
        const showErr = showErrors || (!check.empty && !check.ok);
        return (
          <div key={line.key} className={`nrp-line${showErr && !check.ok ? ' nrp-line--invalid' : ''}`} data-testid={`intake-line-${line.category}`}>
            <span className="nrp-line__kind">
              <Icon size={13} aria-hidden="true" />
              {spec.label}
            </span>
            <span className="nrp-line__fields">
              {spec.fields.map((f, i) => (
                <React.Fragment key={f.key}>
                  {i > 0 && spec.joiner ? <span className="nrp-line__joiner" aria-hidden="true">{spec.joiner}</span> : null}
                  <InfoLineField
                    line={line}
                    field={f}
                    error={showErr ? check.errors[f.key] : undefined}
                    onChange={(k, v) => update(line.key, k, v)}
                  />
                </React.Fragment>
              ))}
            </span>
            <button type="button" className="nrp-line__remove" onClick={() => remove(line.key)} aria-label={`Remove ${spec.label}`} title="Remove">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}

      <div className="nrp-picker-anchor" ref={pickerRef}>
        <button
          type="button"
          className={`nrp-add${picking ? ' nrp-add--open' : ''}`}
          onClick={() => setPicking((p) => !p)}
          aria-haspopup="menu"
          aria-expanded={picking}
          data-testid="add-info"
        >
          <Plus size={15} aria-hidden="true" />
          Add Info
        </button>
        {picking ? (
          <div className="nrp-picker" role="menu" aria-label="What kind of information?" data-testid="info-picker">
            <div className="nrp-picker__title">What kind of information?</div>
            <div className="nrp-picker__grid">
              {INFO_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c.id];
                return (
                  <button key={c.id} type="button" role="menuitem" className="nrp-picker__item" onClick={() => add(c.id)}>
                    <span className="nrp-picker__icon"><Icon size={16} aria-hidden="true" /></span>
                    <span className="nrp-picker__text">
                      <span className="nrp-picker__label">{c.label}</span>
                      <span className="nrp-picker__hint">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Files ─────────────────────────────────────────────────────────────────

function isImage(f: File): boolean {
  return f.type.startsWith('image/') || /\.(png|jpe?g|tiff?|webp|bmp|gif|heic|heif)$/i.test(f.name);
}

function viewFile(f: File) {
  const url = URL.createObjectURL(f);
  window.open(url, '_blank', 'noopener');
  // The tab holds its own reference once opened; the URL only needs to outlive the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function FileList({ files, errors, onAdd, onRemove }: {
  files: File[]; errors: string[]; onAdd: (picked: File[]) => void; onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`nrp-files${dragging ? ' nrp-files--dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onAdd(Array.from(e.dataTransfer.files ?? [])); }}
    >
      {files.length > 0 ? (
        <ul className="nrp-files__list">
          {files.map((f, i) => {
            const Icon = isImage(f) ? ImageIcon : FileText;
            return (
              <li key={`${f.name}-${f.size}`} className="nrp-file">
                <Icon size={16} className="nrp-file__icon" aria-hidden="true" />
                <span className="nrp-file__name" title={f.name}>{f.name}</span>
                <span className="nrp-file__size">{formatFileSize(f.size)}</span>
                <button type="button" className="nrp-file__view" onClick={() => viewFile(f)}>
                  <Eye size={13} aria-hidden="true" />
                  View
                </button>
                <button type="button" className="nrp-file__remove" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`} title="Remove">
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="nrp-files__empty">No files yet. Drop them here, or add them below — up to 50 MB each.</p>
      )}
      {errors.map((err) => (
        <p key={err} className="nrp-error" role="alert">{err}</p>
      ))}
      <input
        ref={inputRef}
        id="np-files"
        className="nrp-files__input"
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        onChange={(e) => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button type="button" className="nrp-add" onClick={() => inputRef.current?.click()} data-testid="add-files">
        <Plus size={15} aria-hidden="true" />
        Add Files
      </button>
    </div>
  );
}

// ── Project + jobs ────────────────────────────────────────────────────────

export function projectLabel(p: ProjectSummary): string {
  const num = (p.project_number ?? '').trim();
  const name = (p.name ?? '').trim();
  return [num, name].filter(Boolean).join(' — ') || `Project ${p.id.slice(0, 8)}`;
}

function projectWhere(p: ProjectSummary): string {
  return [p.client_name, [p.address, p.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

function jobLine(j: LinkableJob): string {
  const num = (j.job_number ?? '').trim();
  const name = (j.name ?? '').trim() || (j.survey_type ?? '').trim();
  return [num, name].filter(Boolean).join(' — ') || `Job ${j.id.slice(0, 8)}`;
}

function ProjectLinker({ linked, jobs, jobsLoading, jobIds, onLink, onUnlink, onJobs, disabled }: {
  linked: ProjectSummary | null;
  jobs: LinkableJob[];
  jobsLoading: boolean;
  jobIds: string[];
  onLink: (p: ProjectSummary) => void;
  onUnlink: () => void;
  onJobs: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<ProjectSummary | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '40' });
      if (q.trim()) params.set('search', q.trim());
      const res = await fetch(`/api/admin/projects?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { projects?: ProjectSummary[] };
      setResults(body.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (linked) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(query), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, linked, search]);

  if (linked) {
    const live = jobs.filter((j) => !j.deleted_at);
    const all = live.length > 0 && live.every((j) => jobIds.includes(j.id));
    return (
      <div className="nrp-linked">
        <div className="nrp-linked__head">
          <span className="nrp-linked__badge"><Link2 size={13} aria-hidden="true" /> Linked to</span>
          <a className="nrp-linked__name" href={`/admin/projects/${linked.id}`} target="_blank" rel="noreferrer">{projectLabel(linked)}</a>
          {projectWhere(linked) ? <span className="nrp-linked__where">{projectWhere(linked)}</span> : null}
          <button type="button" className="nrp-linked__unlink" onClick={onUnlink} disabled={disabled}>Unlink</button>
        </div>
        <div className="nrp-jobs">
          <div className="nrp-jobs__head">
            <span className="nrp-jobs__title"><Briefcase size={13} aria-hidden="true" /> Which jobs does this research relate to?</span>
            {live.length > 1 ? (
              <label className="nrp-jobs__all">
                <input type="checkbox" checked={all} disabled={disabled} onChange={(e) => onJobs(e.target.checked ? live.map((j) => j.id) : [])} />
                All jobs
              </label>
            ) : null}
          </div>
          {jobsLoading ? <p className="nrp-muted"><Loader2 size={13} className="nrp-spin" aria-hidden="true" /> Loading the project&apos;s jobs…</p> : null}
          {!jobsLoading && live.length === 0 ? (
            <p className="nrp-muted">This project has no jobs yet. The research is linked to the project itself.</p>
          ) : null}
          {live.length > 0 ? (
            <ul className="nrp-jobs__list">
              {live.map((j) => {
                const on = jobIds.includes(j.id);
                return (
                  <li key={j.id}>
                    <label className={`nrp-job${on ? ' nrp-job--on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={disabled}
                        onChange={(e) => onJobs(e.target.checked ? [...jobIds, j.id] : jobIds.filter((id) => id !== j.id))}
                      />
                      <span className="nrp-job__text">
                        <span className="nrp-job__name">{jobLine(j)}</span>
                        <span className="nrp-job__meta">
                          {[j.stage, j.address].filter(Boolean).join(' · ')}
                          {j.is_archived ? ' · archived' : ''}
                        </span>
                      </span>
                      {on ? <Check size={14} className="nrp-job__check" aria-hidden="true" /> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="nrp-linker">
      <div className="nrp-search">
        <Search size={15} className="nrp-search__icon" aria-hidden="true" />
        <input
          id="np-project-search"
          className="nrp-input nrp-search__input"
          type="search"
          placeholder="Search projects by number, name, client or address…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCandidate(null); }}
          disabled={disabled}
          autoComplete="off"
          aria-label="Search projects"
        />
      </div>
      {error ? <p className="nrp-error" role="alert">Could not load projects: {error}</p> : null}
      <ul className="nrp-projects" role="listbox" aria-label="Projects">
        {searching && results.length === 0 ? <li className="nrp-muted nrp-projects__note">Searching…</li> : null}
        {!searching && !error && results.length === 0 ? (
          <li className="nrp-muted nrp-projects__note">{query.trim() ? `No project matches “${query}”.` : 'No projects yet.'}</li>
        ) : null}
        {results.map((p) => {
          const picked = candidate?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={picked}
                className={`nrp-project${picked ? ' nrp-project--picked' : ''}`}
                onClick={() => setCandidate(picked ? null : p)}
                disabled={disabled}
              >
                <span className="nrp-project__name">{projectLabel(p)}</span>
                <span className="nrp-project__where">{projectWhere(p) || '—'}</span>
                {p.status ? <span className="nrp-project__status">{p.status}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {candidate ? (
        <div className="nrp-confirm" role="status">
          <span>Link this research to <strong>{projectLabel(candidate)}</strong>?</span>
          <button type="button" className="nrp-confirm__yes" onClick={() => { onLink(candidate); setCandidate(null); }} disabled={disabled}>
            <Check size={14} aria-hidden="true" /> Confirm link
          </button>
          <button type="button" className="nrp-confirm__no" onClick={() => setCandidate(null)} disabled={disabled}>Not this one</button>
        </div>
      ) : null}
    </div>
  );
}

// ── The modal ─────────────────────────────────────────────────────────────

export default function NewResearchProjectModal({ open, onClose, jobIdFromLink }: NewResearchProjectModalProps) {
  const router = useRouter();
  const { reportPageError } = usePageError('NewResearchProjectModal');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lines, setLines] = useState<IntakeInfoLine[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [linkedProject, setLinkedProject] = useState<ProjectSummary | null>(null);
  const [projectJobs, setProjectJobs] = useState<LinkableJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobHadNoCounty, setJobHadNoCounty] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Fresh every time it opens: the previous property's fields must not be the next one's defaults.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setLines([]);
    setFiles([]);
    setFileErrors([]);
    setLinkedProject(null);
    setProjectJobs([]);
    setJobHadNoCounty(false);
    setPhase('idle');
    setProgress(null);
    setUploadWarning(null);
    setCreatedProjectId(null);
    setSubmitAttempted(false);
    window.setTimeout(() => nameRef.current?.focus(), 30);
  }, [open]);

  const loadJobs = useCallback(async (projectId: string): Promise<LinkableJob[]> => {
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`);
      if (!res.ok) return [];
      const body = await res.json() as { jobs?: LinkableJob[] };
      const jobs = body.jobs ?? [];
      setProjectJobs(jobs);
      return jobs;
    } catch {
      return [];
    } finally {
      setJobsLoading(false);
    }
  }, []);

  // ── Arriving from a job (`?new=1&job=<id>`) ──────────────────────────────
  //
  // The job's address, county and state have already been checked by somebody, and the link is the
  // thing that gets forgotten when it has to be made afterwards. A failed lookup is silent: the form
  // still opens, empty, and somebody fills it in.
  useEffect(() => {
    if (!open || !jobIdFromLink) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/jobs?id=${jobIdFromLink}`);
        if (!res.ok) return;
        const { job } = await res.json() as {
          job?: { id: string; job_number?: string | null; name?: string | null; address?: string | null;
                  city?: string | null; state?: string | null; zip?: string | null; county?: string | null;
                  project_id?: string | null };
        };
        if (cancelled || !job) return;
        const street = splitFullAddress(job.address ?? '');
        setForm((p) => ({
          ...p,
          name: job.name?.trim() || job.address?.trim() || p.name,
          street_number: street.streetNumber || p.street_number,
          street_name: street.streetName || (job.address?.trim() ?? '') || p.street_name,
          unit: street.unit || p.unit,
          city: job.city?.trim() || street.city || p.city,
          county: job.county?.trim() || p.county,
          // An EMPTY field on the job must not blank a default — `state` starts as 'TX'.
          state: job.state?.trim() || p.state,
          zip: job.zip?.trim() || street.zip || p.zip,
          project_id: job.project_id ?? p.project_id,
          job_ids: [job.id],
        }));
        setJobHadNoCounty(!job.county?.trim());
        if (job.project_id) {
          const pres = await fetch(`/api/admin/projects/${job.project_id}`);
          if (pres.ok) {
            const body = await pres.json() as { project?: ProjectSummary; jobs?: LinkableJob[] };
            if (!cancelled && body.project) {
              setLinkedProject(body.project);
              setProjectJobs(body.jobs ?? []);
            }
          }
        }
      } catch { /* the modal still opens; somebody fills it in */ }
    })();
    return () => { cancelled = true; };
  }, [open, jobIdFromLink]);

  // ── Derived ──────────────────────────────────────────────────────────────
  // Only once there is a street or a city: the state defaults to TX, and composing from that alone
  // printed "Searching for TX" on an empty form.
  const composedAddress = (form.street_name.trim() || form.city.trim())
    ? composeAddress({
      streetNumber: form.street_number, streetName: form.street_name, unit: form.unit,
      city: form.city, state: form.state, zip: form.zip,
    })
    : '';
  const countyCheck = checkCounty(form.county);
  const lineChecks = useMemo(() => lines.map((l) => ({ line: l, check: checkLine(l) })), [lines]);
  const invalidLines = lineChecks.filter((x) => !x.check.ok && !x.check.empty).length;
  const emptyLines = lineChecks.filter((x) => x.check.empty).length;

  // The drawing marks the street, city, state, ZIP and county as required and the Property ID as
  // optional. County is the routing key, so it is always required; a Property ID pins a parcel
  // exactly — a rural tract may have no street address at all — so it stands in for the address.
  const hasFullAddress = Boolean(form.street_number.trim() && form.street_name.trim() && form.city.trim() && form.state.trim() && form.zip.trim());
  const hasIdentifier = hasFullAddress || Boolean(form.parcel_id.trim());
  const hasCounty = Boolean(form.county.trim());
  const missing: string[] = [];
  if (!hasIdentifier) missing.push('the street address (number, name, city, state, ZIP) or a Property ID');
  if (!hasCounty) missing.push('the county');
  if (invalidLines > 0) missing.push(`${invalidLines} piece${invalidLines === 1 ? '' : 's'} of additional information to be fixed or removed`);
  const canCreate = missing.length === 0 && phase === 'idle';

  // ── Files ────────────────────────────────────────────────────────────────
  const addFiles = (picked: File[]) => {
    const { valid, errors } = validateFiles(picked);
    setFileErrors(errors);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...valid.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!canCreate) return;
    const projectName = form.name.trim() || composedAddress || `Property ${form.parcel_id.trim()}`;
    // Store the canonical spelling when we recognise the county. Routing matches on the name, so
    // "bell county" and "Bell" must not become two different things. An unrecognised value is sent
    // through untouched: the warning has already been shown.
    const county = countyCheck.kind === 'ok' ? countyCheck.canonical : form.county;
    setPhase('creating');
    setProgress('Creating the research project…');
    try {
      const res = await fetch('/api/admin/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, county, name: projectName, supplemental: linesToSupplemental(lines) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        reportPageError(new Error(err.error || 'Failed to create project'), { element: 'create project' });
        setPhase('idle');
        setProgress(null);
        return;
      }
      const data = await res.json() as { project: { id: string } };
      setCreatedProjectId(data.project.id);

      // ── The operator's own documents ───────────────────────────────────────
      // After the insert, because a document row needs a project to belong to. Deliberately NOT
      // fatal: the project exists and is usable. What is not acceptable is silence — an operator
      // who attached four files and was shown nothing would believe the run received them.
      let uploadFailed = false;
      if (files.length > 0) {
        setPhase('uploading');
        setProgress(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
        try {
          const outcome = await uploadDocuments(data.project.id, files);
          if (outcome.errors.length > 0) {
            uploadFailed = true;
            setUploadWarning(
              `The project was created. ${outcome.errors.length} of your ${files.length} file(s) did not upload ` +
              `and are NOT part of this project — ${outcome.errors.join('; ')}. Add them from the project page.`,
            );
          }
        } catch (err) {
          uploadFailed = true;
          setUploadWarning(
            `The project was created, but none of your ${files.length} file(s) uploaded ` +
            `(${err instanceof Error ? err.message : String(err)}). Add them from the project page.`,
          );
        }
      }
      // A failed upload holds the navigation: routing now would render the warning for one frame.
      if (uploadFailed) {
        setPhase('idle');
        setProgress(null);
        return;
      }
      setProgress('Opening the research page…');
      onClose();
      router.push(`/admin/research/${data.project.id}`);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'create project' });
      setPhase('idle');
      setProgress(null);
    }
  }

  if (!open) return null;
  const busy = phase !== 'idle';

  return (
    // Closing is deliberate only — × , Cancel or Escape. Everything here is typed by hand, and a
    // stray click on the dimmed area must not throw it away.
    <div
      className="nrp-overlay"
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nrp-title"
    >
      <div className="nrp-modal">
        <header className="nrp-header">
          <h2 className="nrp-title" id="nrp-title">New Research Project</h2>
          <button type="button" className="nrp-close" onClick={onClose} aria-label="Close" title="Close without saving" disabled={busy}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="nrp-form" onSubmit={handleCreate} noValidate>
          <div className="nrp-scroll">
            {/* ══ 1. NAME ══════════════════════════════════════════════════════════════════ */}
            <Section
              step={1}
              title="Project name"
              info={<p>What this research is called on the list and in the report. Leave it blank and it is named from the address or the Property ID; you can rename it later on the project page.</p>}
            >
              <div className="nrp-field">
                <Label htmlFor="np-name" optional>Name</Label>
                <input
                  ref={nameRef}
                  id="np-name"
                  className="nrp-input"
                  type="text"
                  autoComplete="off"
                  placeholder={composedAddress || 'Named from the address or Property ID'}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  disabled={busy}
                />
              </div>
            </Section>

            {/* ══ 2. WHERE IS IT ═══════════════════════════════════════════════════════════ */}
            <Section
              step={2}
              title="Where is it?"
              info={(
                <>
                  <p>The property the run searches for. The street number and name are separate because that is how the county appraisal district indexes them; put the road only in the name — no city or ZIP.</p>
                  <p>The county is the routing key: it chooses which clerk and appraisal district are searched. A Property ID in the next section can stand in for the address on a tract that has none.</p>
                </>
              )}
            >
              <div className="nrp-row nrp-row--street">
                <div className="nrp-field">
                  <Label htmlFor="np-street-number" required>Street number &amp; name</Label>
                  <div className="nrp-street">
                    <input
                      id="np-street-number"
                      className="nrp-input nrp-street__number"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="309"
                      aria-label="Street number"
                      value={form.street_number}
                      onChange={(e) => set('street_number', e.target.value.replace(/[^0-9A-Za-z-]/g, ''))}
                      disabled={busy}
                    />
                    <input
                      id="np-street-name"
                      className="nrp-input nrp-street__name"
                      type="text"
                      autoComplete="off"
                      placeholder="N TRAVIS AVE"
                      aria-label="Street name"
                      value={form.street_name}
                      onChange={(e) => set('street_name', e.target.value)}
                      // A whole address pasted here is the mistake this layout exists to prevent:
                      // everything the paste contained goes to the field that owns it.
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (!v.includes(',')) return;
                        const a = splitFullAddress(v);
                        setForm((p) => ({
                          ...p,
                          street_number: p.street_number || a.streetNumber,
                          street_name: a.streetName,
                          unit: p.unit || a.unit,
                          city: p.city || a.city,
                          state: a.state || p.state,
                          zip: p.zip || a.zip,
                        }));
                      }}
                      disabled={busy}
                    />
                  </div>
                </div>
                <div className="nrp-field nrp-field--unit">
                  <Label htmlFor="np-unit">Unit #</Label>
                  <input id="np-unit" className="nrp-input" type="text" autoComplete="off" placeholder="ex: 123" value={form.unit} onChange={(e) => set('unit', e.target.value)} disabled={busy} />
                </div>
              </div>

              <div className="nrp-row nrp-row--csz">
                <div className="nrp-field">
                  <Label htmlFor="np-city" required>City</Label>
                  <input id="np-city" className="nrp-input" type="text" autoComplete="off" placeholder="Cameron" value={form.city} onChange={(e) => set('city', e.target.value)} disabled={busy} />
                </div>
                <div className="nrp-field nrp-field--state">
                  <Label htmlFor="np-state" required>State</Label>
                  <select id="np-state" className="nrp-input nrp-select" value={form.state} onChange={(e) => set('state', e.target.value)} disabled={busy}>
                    {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </div>
                <div className="nrp-field nrp-field--zip">
                  <Label htmlFor="np-zip" required>ZIP</Label>
                  <input id="np-zip" className="nrp-input" type="text" inputMode="numeric" autoComplete="off" maxLength={10} placeholder="ex: 12345" value={form.zip} onChange={(e) => set('zip', e.target.value.replace(/[^0-9-]/g, ''))} disabled={busy} />
                </div>
              </div>

              <div className="nrp-row nrp-row--county">
                <div className="nrp-field">
                  <Label htmlFor="np-county" required>County</Label>
                  <input
                    id="np-county"
                    className="nrp-input"
                    type="text"
                    autoComplete="off"
                    placeholder="Milam"
                    value={form.county}
                    onChange={(e) => set('county', e.target.value)}
                    aria-invalid={isCountyInvalid(countyCheck)}
                    aria-describedby={countyDescribedBy(countyCheck, 'county-check')}
                    disabled={busy}
                  />
                  <CountyNote check={countyCheck} id="county-check" typed={form.county} onPick={(s) => set('county', s)} />
                  {jobHadNoCounty && !form.county.trim() ? (
                    <div className="nrp-note nrp-note--warn" role="status">
                      This job has no county on it, so it could not be filled in. Research is routed by county — add it here.
                    </div>
                  ) : null}
                  <ScopeNotice scope={checkScope(form.state, form.county)} id="scope-create" />
                </div>
              </div>

              {composedAddress ? (
                <p className="nrp-preview" role="status">
                  <span className="nrp-preview__label">Searching for</span>
                  <strong>{composedAddress}</strong>
                </p>
              ) : null}
            </Section>

            {/* ══ 3. ADDITIONAL INFORMATION ════════════════════════════════════════════════ */}
            <Section
              step={3}
              title="Additional Information"
              info={(
                <>
                  <p>Anything you already know that pins the property or its records. The Property ID is the appraisal district&apos;s account number — the single strongest input, because it names one parcel exactly.</p>
                  <p><strong>+ Add Info</strong> asks what kind of fact you have and gives it a field of its own shape, so an instrument number arrives as an instrument number and a volume/page as two numbers. Each kind has a format it must match; the field says what is wrong while you type.</p>
                  <p>The run treats these as hints — they focus the search and raise confidence, and never reject a document on their own.</p>
                </>
              )}
            >
              <div className="nrp-row nrp-row--parcel">
                <div className="nrp-field nrp-field--parcel">
                  <Label htmlFor="np-parcel">Property ID</Label>
                  <input
                    id="np-parcel"
                    className="nrp-input"
                    type="text"
                    autoComplete="off"
                    placeholder="ex: 12345"
                    value={form.parcel_id}
                    onChange={(e) => set('parcel_id', e.target.value.replace(/[^0-9A-Za-z.\-]/g, ''))}
                    disabled={busy}
                  />
                </div>
              </div>
              <InfoLines lines={lines} onChange={setLines} showErrors={submitAttempted} />
              {emptyLines > 0 && submitAttempted ? (
                <p className="nrp-muted">{emptyLines} empty line{emptyLines === 1 ? '' : 's'} will be dropped.</p>
              ) : null}
            </Section>

            {/* ══ 4. FILE UPLOAD ═══════════════════════════════════════════════════════════ */}
            <Section
              step={4}
              title="File Upload"
              info={(
                <>
                  <p>Deeds, plats, prior surveys, title commitments, photographs — anything you already have. Each file is attached to the project and read by the AI when the research run starts, alongside what the run finds itself.</p>
                  <p>PDF, images, Word and text files, up to 50 MB each. <strong>View</strong> opens the file in a new tab so you can check it is the right one before it goes in.</p>
                </>
              )}
            >
              <FileList files={files} errors={fileErrors} onAdd={addFiles} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
            </Section>

            {/* ══ 5. LINK TO A PROJECT ═════════════════════════════════════════════════════ */}
            <Section
              step={5}
              title="Link to a project"
              infoTitle="Linking research to a project and its jobs"
              info={(
                <>
                  <p>Optional. Pick the engagement this research belongs to and confirm it; the project&apos;s jobs then appear and you tick the ones the research relates to — one, several or all. A project can hold many research projects.</p>
                  <p>Linking is what makes the research show up on the job, and what makes it billable. It can be changed later from the project page.</p>
                </>
              )}
            >
              <ProjectLinker
                linked={linkedProject}
                jobs={projectJobs}
                jobsLoading={jobsLoading}
                jobIds={form.job_ids}
                onLink={(p) => {
                  setLinkedProject(p);
                  setForm((f) => ({ ...f, project_id: p.id, job_ids: [] }));
                  setProjectJobs([]);
                  void loadJobs(p.id);
                }}
                onUnlink={() => { setLinkedProject(null); setProjectJobs([]); setForm((f) => ({ ...f, project_id: null, job_ids: [] })); }}
                onJobs={(ids) => set('job_ids', ids)}
                disabled={busy}
              />
            </Section>

            {/* ══ 6. ADDITIONAL NOTES ══════════════════════════════════════════════════════ */}
            <Section
              step={6}
              title="Additional Notes"
              info={(
                <>
                  <p>What you know that no record will say: a disputed line, a fence that does not match the deed, a seller&apos;s claim about acreage, a document you expect to exist. Written in your own words.</p>
                  <p>The AI reads these at the start of the run and decides what in them is worth acting on.</p>
                </>
              )}
            >
              <div className="nrp-field">
                <Label htmlFor="np-notes">Notes</Label>
                <textarea
                  id="np-notes"
                  className="nrp-input nrp-textarea"
                  placeholder="Type here… e.g. Verify the east boundary — the neighbour disputes the fence line. Seller says 2.3 acres. Look for easements or ROW along FM 436."
                  value={form.intake_notes}
                  onChange={(e) => set('intake_notes', e.target.value)}
                  rows={5}
                  disabled={busy}
                />
              </div>
            </Section>
          </div>

          <footer className="nrp-footer">
            {uploadWarning ? (
              <div className="nrp-warning" role="alert">
                {uploadWarning}
                {createdProjectId ? (
                  <button type="button" className="nrp-warning__go" onClick={() => { onClose(); router.push(`/admin/research/${createdProjectId}`); }}>
                    Open the project anyway
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="nrp-footer__row">
              <div className="nrp-footer__status" aria-live="polite">
                {progress ? (
                  <span className="nrp-footer__progress"><Loader2 size={14} className="nrp-spin" aria-hidden="true" /> {progress}</span>
                ) : submitAttempted && missing.length > 0 ? (
                  <span className="nrp-footer__missing">Still needed: {missing.join('; ')}.</span>
                ) : (
                  <span className="nrp-muted">Settings for the run — sources, budget, paid documents — are chosen on the next page.</span>
                )}
              </div>
              <button type="button" className="nrp-btn nrp-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="nrp-btn nrp-btn--primary" disabled={busy} title={canCreate ? undefined : 'Fill in the required fields first'}>
                {busy ? 'Working…' : 'Create research project'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
