'use client';

// app/admin/research/components/RerunDialog.tsx — a re-run you can actually edit (plan C4).
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────────
//
// A two-button confirm:
//
//     [ Update Parameters First ]   [ Re-run with Same Parameters ]
//
// "Same parameters" started immediately. "Update parameters first" did not open anything — it sent
// the operator back to the Property Information stage to edit the PROJECT, then walk forward again.
// So there was no way to change a setting for one attempt, and no way at all to change the one the
// owner named: "whether or not it uses texasfile". That switch was write-once at project creation,
// set in a modal most people fill in before they know what the property needs.
//
// And the dialog's warning was wrong in the direction that loses work:
//
//     "All data from the previous run will be permanently deleted, including:
//        · Pipeline-fetched documents and screenshots"
//
// It was telling the truth about the code — the reset ran a DELETE — and the code was doing the
// opposite of what was asked for. A run cut short at minute 20 has usually already BOUGHT
// documents, and deleting those throws away money that was already spent. Re-runs now supersede,
// so the old files stay: attributed, downloadable, and one toggle away.
//
// ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────────────────
//
// Seeds itself from WHAT THE PREVIOUS RUN WAS TOLD — not from the project's current values, which
// can have been edited since — and shows every field the run can be given, with what changed.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import RunFileAttachments, { type RunFile } from './RunFileAttachments';
import { RefreshCw, AlertTriangle, X, Info } from 'lucide-react';
import type { RunSettingsInput, StartRunInput } from './useRunState';

export interface PreviousRun {
  run_number?: number | null;
  trigger?: string | null;
  status?: string | null;
  stop_reason?: string | null;
  settings?: Record<string, unknown> | null;
  inputs?: Record<string, unknown> | null;
  cost_usd?: number | string | null;
  documentCount?: number | null;
  started_at?: string | null;
}

export interface RerunDialogProps {
  projectId: string;
  /** The project's current values, used only where the previous run recorded nothing. */
  projectDefaults: {
    address: string;
    county: string;
    parcelId: string;
    ownerName: string;
    allowPaidDocuments: boolean;
  };
  onCancel: () => void;
  /** Called with everything the run should be given. The caller owns the reset + start. */
  onConfirm: (input: StartRunInput) => void;
}

interface FormState {
  address: string;
  county: string;
  parcelId: string;
  ownerName: string;
  operatorNotes: string;
  allowPaidDocuments: boolean;
  maxResearchTimeMinutes: number;
  maxCostUsd: number;
  mode: 'free' | 'paid';
  refreshImagery: boolean;
}

/** The defaults a run gets when nothing says otherwise. Kept here so the dialog can show them as
 *  defaults rather than presenting them as the operator's own past choices. */
const FALLBACK = { minutes: 30, costUsd: 2, mode: 'paid' as const };

/** The run length an operator may choose. Mirrors RUN_MINUTES in worker/src/research/run-phases.ts
 *  — the progress bar paces itself to this number, so the two must agree or the bar is calibrated
 *  to a length nobody can pick. 15 is the floor because a measured Bell run spent 18 minutes in the
 *  clerk and retrieval phases alone; anything shorter always stops early. */
const RUN_MINUTES = { min: 15, default: 30, max: 60 };

export default function RerunDialog({
  projectId, projectDefaults, onCancel, onConfirm,
}: RerunDialogProps) {
  const [prev, setPrev] = useState<PreviousRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  // ── Seed from the previous run ────────────────────────────────────────────────────────────────
  //
  // ── THE BUG THIS REF EXISTS FOR ─────────────────────────────────────────────────────────────
  //
  // `projectDefaults` is built as an object literal at the call site:
  //
  //     <RerunDialog projectDefaults={{ address: …, county: … }} … />
  //
  // so it is a NEW object on every render of the page. With it in this effect's dependency array
  // the effect re-ran on every render, and its own cleanup set `cancelled = true` before the fetch
  // resolved — so `setForm` was never reached. The dialog opened, showed its title and the words
  // "Reading what the last run was told…", and never rendered a single field.
  //
  // Nothing caught it. It typechecks, it lints, and every unit test asserting the fields exist
  // reads the SOURCE, where they plainly do. It took opening the dialog in a browser, which is why
  // that is a required step here and not an optional one.
  //
  // The defaults are read through a ref so their identity cannot retrigger the effect, and the
  // effect keys on `projectId` alone — the only input that should ever restart it.
  const defaultsRef = useRef(projectDefaults);
  defaultsRef.current = projectDefaults;

  useEffect(() => {
    let cancelled = false;
    const projectDefaults = defaultsRef.current;
    (async () => {
      let latest: PreviousRun | null = null;
      let failed = false;
      try {
        const res = await fetch(`/api/admin/research/${projectId}/runs`);
        if (res.ok) {
          const data = await res.json() as { latest?: PreviousRun | null };
          latest = data.latest ?? null;
        } else {
          failed = true;
        }
      } catch { failed = true; }
      if (cancelled) return;

      const s = (latest?.settings ?? {}) as Record<string, unknown>;
      const i = (latest?.inputs ?? {}) as Record<string, unknown>;
      const str = (v: unknown, fallback: string) =>
        typeof v === 'string' && v.trim() ? v : fallback;
      const num = (v: unknown, fallback: number) =>
        Number.isFinite(Number(v)) ? Number(v) : fallback;

      setPrev(latest);
      setLoadFailed(failed);
      setForm({
        address: str(i.address, projectDefaults.address),
        county: str(i.county, projectDefaults.county),
        parcelId: str(i.parcelId ?? i.propertyId, projectDefaults.parcelId),
        ownerName: str(i.ownerName, projectDefaults.ownerName),
        // Notes are deliberately NOT carried over. They describe what the operator knew when they
        // started that run; re-presenting them as this run's notes makes stale context look fresh.
        operatorNotes: '',
        allowPaidDocuments:
          typeof s.allowPaidDocuments === 'boolean'
            ? s.allowPaidDocuments
            : projectDefaults.allowPaidDocuments,
        maxResearchTimeMinutes: Math.min(RUN_MINUTES.max, Math.max(RUN_MINUTES.min,
          num(s.maxResearchTimeMinutes, FALLBACK.minutes))),
        maxCostUsd: num(s.maxCostUsd, FALLBACK.costUsd),
        mode: s.mode === 'free' ? 'free' : FALLBACK.mode,
        // Off by default even if the last run used it: 19 of 53 duplicate rows measured in
        // production were the same screenshot re-taken by a later run.
        refreshImagery: false,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // G2. Kept out of FormState on purpose. FormState is seeded from what the PREVIOUS run was
  // told, and re-presenting a previous run's attachments as this one's would be the same
  // mistake the operator notes avoid: stale context wearing a fresh label. A file is attached to
  // the attempt in front of you.
  const [attachments, setAttachments] = useState<RunFile[]>([]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  // ── What is about to change ───────────────────────────────────────────────────────────────────
  //
  // Shown because a re-run is a decision made against a memory of the last one, and the memory is
  // usually wrong about the ceilings. Comparing against what the RUN was told, not the project.
  const changes = useMemo(() => {
    if (!form || !prev) return [];
    const s = (prev.settings ?? {}) as Record<string, unknown>;
    const i = (prev.inputs ?? {}) as Record<string, unknown>;
    const out: string[] = [];
    const cmp = (label: string, before: unknown, after: unknown) => {
      const b = before === undefined || before === null || before === '' ? null : String(before);
      const a = after === undefined || after === null || after === '' ? null : String(after);
      if (b !== a) out.push(`${label}: ${b ?? '(none)'} → ${a ?? '(none)'}`);
    };
    cmp('Address', i.address, form.address);
    cmp('County', i.county, form.county);
    cmp('Parcel ID', i.parcelId ?? i.propertyId, form.parcelId);
    cmp('Owner', i.ownerName, form.ownerName);
    if (typeof s.allowPaidDocuments === 'boolean' && s.allowPaidDocuments !== form.allowPaidDocuments) {
      out.push(`Paid documents: ${s.allowPaidDocuments ? 'on' : 'OFF'} → ${form.allowPaidDocuments ? 'on' : 'OFF'}`);
    }
    if (s.maxResearchTimeMinutes !== undefined) cmp('Time ceiling (min)', s.maxResearchTimeMinutes, form.maxResearchTimeMinutes);
    if (s.maxCostUsd !== undefined) cmp('Cost ceiling ($)', s.maxCostUsd, form.maxCostUsd);
    if (s.mode !== undefined) cmp('Mode', s.mode, form.mode);
    if (form.operatorNotes.trim()) out.push('New starting information added');
    // Attaching a survey changes what the run is given as much as editing a field does. Without
    // this the dialog would report "nothing changed" and record the run as `rerun_same`.
    if (attachments.length > 0) {
      out.push(`${attachments.length} file(s) attached to this run`);
    }
    if (form.refreshImagery) out.push('Imagery will be re-captured');
    return out;
    // `attachments.length` and not `attachments`: the array identity changes on every keystroke-free
    // re-render, and the summary only cares how many there are. Omitting it entirely would leave the
    // dialog reporting "nothing changed" while a survey sits attached to the run.
  }, [form, prev, attachments.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const settings: RunSettingsInput = {
      allowPaidDocuments: form.allowPaidDocuments,
      maxResearchTimeMinutes: form.maxResearchTimeMinutes,
      maxCostUsd: form.maxCostUsd,
      mode: form.mode,
      refreshImagery: form.refreshImagery,
    };
    onConfirm({
      address: form.address,
      county: form.county,
      parcelId: form.parcelId,
      ownerName: form.ownerName,
      operatorNotes: form.operatorNotes,
      // The worker has parsed `userFiles` since it was written and nothing ever sent one.
      userFiles: attachments.length > 0 ? attachments : undefined,
      settings,
      // `rerun_edited` vs `rerun_same` is what the run list uses to explain a thinner report six
      // weeks later, so it is derived from whether anything actually changed rather than from
      // which button was pressed.
      trigger: changes.length > 0 ? 'rerun_edited' : 'rerun_same',
    });
  }

  return (
    <div className="rrd" role="dialog" aria-modal="true" aria-labelledby="rrd-title">
      <RerunDialogStyles />
      <form className="rrd__card" onSubmit={submit}>
        <header className="rrd__head">
          <h3 id="rrd-title" className="rrd__title">
            <RefreshCw size={16} aria-hidden /> Re-run research
          </h3>
          <button type="button" className="rrd__close" onClick={onCancel} aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </header>

        {loading && <p className="rrd__loading">Reading what the last run was told…</p>}

        {loadFailed && (
          <p className="rrd__note rrd__note--warn">
            <AlertTriangle size={14} aria-hidden />
            The previous run&apos;s settings could not be read, so the fields below are seeded from
            the project instead. Check the ceilings before starting — they may not be what the last
            run used.
          </p>
        )}

        {form && (
          <>
            {prev && (
              <p className="rrd__prev">
                Last run{prev.run_number ? ` (run ${prev.run_number})` : ''}
                {prev.documentCount != null && ` found ${prev.documentCount} document(s)`}
                {prev.cost_usd != null && ` and spent $${Number(prev.cost_usd).toFixed(2)}`}
                {prev.stop_reason === 'budget_reached' && ' before stopping at its ceiling'}.
              </p>
            )}

            {/* ── What the run is told ───────────────────────────────────────────────────── */}
            <fieldset className="rrd__group">
              <legend className="rrd__legend">Starting information</legend>

              {/* ── F4: the same intake the NEW-project form has ──────────────────────────────
                  This was a plain text box while the new-project form next door had Google Places
                  autocomplete filling city, county, state and ZIP from one selection. A re-run is
                  exactly where a corrected address gets typed — it is the whole reason the dialog
                  is editable — so it was the one place that most needed the structure and had none.

                  The county is the field that matters. It routes the entire run, and a re-run typed
                  with the wrong county researches the wrong courthouse and reports it as a finding
                  about the property. Selecting a suggestion fills it rather than leaving it to
                  agree with the address by hand.

                  It degrades to plain typing when the key is absent or refused, which is the same
                  behaviour the component gives the new-project form. */}
              <label className="rrd__field">
                <span className="rrd__label">Property address</span>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(val) => set('address', val)}
                  onSelect={(details) => {
                    if (details.address) set('address', details.address);
                    // Only overwrite the county when Google actually resolved one. An empty string
                    // here would silently clear a county the operator had typed correctly.
                    if (details.county) set('county', details.county);
                  }}
                  className="rrd__input"
                  placeholder="Property address"
                  biasTexas
                />
              </label>

              <div className="rrd__row">
                <label className="rrd__field">
                  <span className="rrd__label">County</span>
                  <input className="rrd__input" value={form.county}
                         onChange={(e) => set('county', e.target.value)} />
                </label>
                <label className="rrd__field">
                  <span className="rrd__label">Parcel / property ID</span>
                  <input className="rrd__input" value={form.parcelId}
                         onChange={(e) => set('parcelId', e.target.value)} />
                </label>
              </div>

              <label className="rrd__field">
                <span className="rrd__label">Owner name</span>
                {/* The worker's clerk search runs an owner-name query. This field fell back to a
                    project column that does not exist for months, so that search never ran. */}
                <input className="rrd__input" value={form.ownerName}
                       onChange={(e) => set('ownerName', e.target.value)} />
              </label>

              <label className="rrd__field">
                <span className="rrd__label">
                  Anything else this run should know
                  <span className="rrd__hint">
                    The surveyor&apos;s name, a neighbouring owner, an instrument number you already
                    have — there was no field for this at all, so it had nowhere to go.
                  </span>
                </span>
                <textarea className="rrd__input rrd__input--area" rows={3}
                          value={form.operatorNotes}
                          onChange={(e) => set('operatorNotes', e.target.value)} />
              </label>

              <RunFileAttachments
                files={attachments}
                onChange={setAttachments}
                label="Files to start this run with"
              />
            </fieldset>

            {/* ── What the run may do ────────────────────────────────────────────────────── */}
            <fieldset className="rrd__group">
              <legend className="rrd__legend">Settings for this run</legend>

              <label className="rrd__check">
                <input type="checkbox" checked={form.allowPaidDocuments}
                       onChange={(e) => set('allowPaidDocuments', e.target.checked)} />
                <span>
                  <strong>Allow paid documents</strong> (TexasFile and the other paid vendors)
                  <span className="rrd__hint">
                    Off means the run completes from free county sources only, and the report says
                    anything paid-only was skipped <em>by choice</em> — which is not the same as the
                    county having no such record. This applies to this run alone; the project keeps
                    its own default.
                  </span>
                </span>
              </label>

              <div className="rrd__row">
                <label className="rrd__field">
                  <span className="rrd__label">
                    How long this run may take
                    <span className="rrd__hint">
                      {RUN_MINUTES.min}–{RUN_MINUTES.max} minutes, {RUN_MINUTES.default} by default. The progress bar paces itself to
                      this, so a shorter run reaches the same milestones sooner rather than racing
                      ahead and stalling.
                    </span>
                  </span>
                  <input className="rrd__input" type="number" min={RUN_MINUTES.min} max={RUN_MINUTES.max}
                         value={form.maxResearchTimeMinutes}
                         onChange={(e) => set('maxResearchTimeMinutes', Number(e.target.value))} />
                </label>
                <label className="rrd__field">
                  <span className="rrd__label">Cost ceiling (USD)</span>
                  <input className="rrd__input" type="number" min={0} max={100} step={0.25}
                         value={form.maxCostUsd}
                         onChange={(e) => set('maxCostUsd', Number(e.target.value))} />
                </label>
              </div>

              {form.maxCostUsd === 0 && form.allowPaidDocuments && (
                // The two are separate switches and $0 is the stronger of them, so the dialog says
                // what will actually happen rather than letting the run discover it.
                <p className="rrd__note rrd__note--info">
                  <Info size={14} aria-hidden />
                  A $0.00 ceiling is the same instruction as switching paid documents off. Nothing
                  will be purchased.
                </p>
              )}

              <label className="rrd__field">
                <span className="rrd__label">Source plan</span>
                <select className="rrd__input" value={form.mode}
                        onChange={(e) => set('mode', e.target.value as 'free' | 'paid')}>
                  <option value="paid">Free sources first, then escalate to paid</option>
                  <option value="free">Free sources only — never touch a paid source</option>
                </select>
                <span className="rrd__hint">
                  Separate from the switch above: the plan picks where to look, the switch is a veto
                  on spending. Paid plan + paid documents off is a dry run.
                </span>
              </label>

              <label className="rrd__check">
                <input type="checkbox" checked={form.refreshImagery}
                       onChange={(e) => set('refreshImagery', e.target.checked)} />
                <span>
                  <strong>Re-capture imagery and maps</strong>
                  <span className="rrd__hint">
                    Off by default — a re-taken screenshot is the single most duplicated thing in
                    this database. Turn it on when something on the ground has actually changed.
                  </span>
                </span>
              </label>
            </fieldset>

            {/* ── What happens ───────────────────────────────────────────────────────────── */}
            <div className="rrd__summary">
              <p className="rrd__summary-title">This will:</p>
              <ul className="rrd__summary-list">
                <li>Research everything again from scratch.</li>
                {/* The old dialog promised the opposite, and the code delivered on the promise. */}
                <li>
                  <strong>Keep every document from previous runs.</strong> They are marked as
                  superseded, not deleted, and stay downloadable — a run that was cut short has
                  usually already paid for some of them.
                </li>
                <li>Skip re-buying anything a previous run already purchased.</li>
                <li>Clear the extracted data points and discrepancies, which this run regenerates.</li>
              </ul>
              {changes.length > 0 && (
                <>
                  <p className="rrd__summary-title">Changing from the last run:</p>
                  <ul className="rrd__summary-list rrd__summary-list--changes">
                    {changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </>
              )}
              {changes.length === 0 && prev && (
                <p className="rrd__summary-same">
                  Nothing is changing — this repeats the last run exactly.
                </p>
              )}
            </div>

            <div className="rrd__actions">
              <button type="button" className="rrd__btn" onClick={onCancel}>Cancel</button>
              <button type="submit" className="rrd__btn rrd__btn--go">
                <RefreshCw size={14} aria-hidden />
                {changes.length > 0 ? 'Start edited re-run' : 'Start re-run'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function RerunDialogStyles() {
  return (
    <style>{`
.rrd {
  position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,0.5); padding: 1rem; overflow-y: auto;
}
.rrd__card {
  background: var(--theme-bg-elevated, #fff); border-radius: 12px; padding: 1.25rem 1.5rem;
  max-width: 40rem; width: 100%; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 0.9rem;
}
.rrd__head { display: flex; align-items: center; gap: 0.5rem; }
.rrd__title {
  margin: 0; flex: 1 1 auto; display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 1.05rem; color: var(--theme-fg-primary, #111827);
}
.rrd__close {
  border: none; background: none; cursor: pointer; padding: 0.25rem; border-radius: 6px;
  color: var(--theme-fg-muted, #6B7280);
}
.rrd__close:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
.rrd__loading { margin: 0; font-size: 0.85rem; color: var(--theme-fg-muted, #6B7280); }
.rrd__prev { margin: 0; font-size: 0.82rem; color: var(--theme-fg-secondary, #374151); }

.rrd__group {
  border: 1px solid var(--theme-border, #E5E7EB); border-radius: 9px; padding: 0.85rem; margin: 0;
  /* A <fieldset> defaults to min-width: min-content, which is a value it computes from its own
     contents and which no amount of width:100% on the children can override. At 390px this made
     the fieldset 383px inside a 328px card — a 56px overflow that every descendant inherited, so
     the offender list read like eight separate bugs instead of one.
     Measured in a browser at 390px; a passing test suite says nothing about it. */
  min-width: 0;
}
.rrd__legend { padding: 0 0.35rem; font-size: 0.8rem; font-weight: 650; color: var(--theme-fg-primary, #111827); }
.rrd__row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.rrd__field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.7rem; }
.rrd__label { font-size: 0.8rem; font-weight: 600; color: var(--theme-fg-secondary, #374151); }
.rrd__hint {
  display: block; margin-top: 0.15rem; font-size: 0.74rem; font-weight: 400; line-height: 1.45;
  color: var(--theme-fg-muted, #6B7280);
}
.rrd__input {
  padding: 0.45rem 0.6rem; border-radius: 7px; font-size: 0.85rem; width: 100%;
  border: 1px solid var(--theme-border, #D1D5DB);
  background: var(--theme-bg-elevated, #fff); color: var(--theme-fg-primary, #111827);
}
.rrd__input:focus-visible { outline: 2px solid #2563EB; outline-offset: 0; }
.rrd__input--area { resize: vertical; font-family: inherit; }
.rrd__check { display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.7rem; font-size: 0.82rem; }
.rrd__check input { margin-top: 0.2rem; flex: 0 0 auto; }

.rrd__note {
  display: flex; gap: 0.4rem; align-items: flex-start; margin: 0 0 0.6rem;
  padding: 0.5rem 0.65rem; border-radius: 7px; font-size: 0.78rem; line-height: 1.5;
}
.rrd__note--warn { border: 1px solid #FCD34D; background: var(--color-warning-surface, #FFFBEB); color: var(--color-warning-text, #92400E); }
.rrd__note--info { border: 1px solid #93C5FD; background: #EFF6FF; color: #1D4ED8; }

.rrd__summary {
  border: 1px solid var(--theme-border, #E5E7EB); border-radius: 9px; padding: 0.75rem 0.9rem;
  background: color-mix(in srgb, var(--theme-fg-muted, #6B7280) 5%, transparent);
}
.rrd__summary-title { margin: 0 0 0.3rem; font-size: 0.8rem; font-weight: 650; color: var(--theme-fg-primary, #111827); }
.rrd__summary-list { margin: 0 0 0.6rem; padding-left: 1.1rem; font-size: 0.79rem; line-height: 1.6; color: var(--theme-fg-secondary, #374151); }
.rrd__summary-list--changes { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.74rem; }
.rrd__summary-same { margin: 0; font-size: 0.79rem; color: var(--theme-fg-muted, #6B7280); }

.rrd__actions { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
.rrd__btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.5rem 0.95rem; border-radius: 7px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
  border: 1px solid var(--theme-border, #D1D5DB);
  background: var(--theme-bg-elevated, #fff); color: var(--theme-fg-primary, #111827);
}
.rrd__btn:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
.rrd__btn--go { background: #2563EB; border-color: #2563EB; color: #fff; }

@media (max-width: 640px) {
  .rrd__row { grid-template-columns: 1fr; }
  .rrd__card { padding: 1rem; }
}
`}</style>
  );
}
