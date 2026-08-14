// app/admin/jobs/[id]/JobInstructions.tsx — what the field crew is told to do, written from the job.
//
// Owner, 2026-08-13: *"the notes and instructions for the field crew … an admin or secretary or the
// owner or a researcher can all manage it well and easily."*
//
// ── WHY THIS EXISTS WHEN THE FEATURE ALREADY DID ────────────────────────────────────────────────
//
// `/api/admin/jobs/[id]/instructions` has had GET and PUT since 2026-07-18, and it is good: it
// resolves `[label](job-file:<id>)` embeds against the job's files server-side so web and mobile
// render the same thing, and it reports links pointing at files that no longer exist. Its only
// caller was `work-mode/field_crew` — the crew's own screen.
//
// So the people the API explicitly authorises to WRITE — an org admin, and the job's lead RPLS —
// had nowhere to write from unless they opened the field crew's workspace and pretended to be it.
// The instructions were readable by the crew and unreachable by the office, which is the half of
// the feature nobody notices is missing, because the half that exists works.
//
// ── THE FILE PICKER IS THE POINT ────────────────────────────────────────────────────────────────
//
// Instructions that say "see the plat" are worse than useless on a truck with no signal. The embed
// syntax exists so a line can carry the file itself, and nobody is going to hand-type
// `[Plat](job-file:9f2c…)`. Inserting one is a click here, which is what makes the file-management
// integration real rather than documented.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Link2, Loader2, AlertTriangle, Check } from 'lucide-react';

interface JobFileLite {
  id: string;
  file_name: string;
  section?: string;
}

interface Props {
  jobId: string;
  /** The job's files, already loaded by the page — offered as embeds. */
  files: readonly JobFileLite[];
}

interface LoadedState {
  instructions: string;
  canEdit: boolean;
}

export default function JobInstructions({ jobId, files }: Props) {
  const [state, setState] = useState<LoadedState | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Files referenced by the text that are no longer on the job. Returned by the save. */
  const [brokenRefs, setBrokenRefs] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/instructions`);
      const json = (await res.json()) as LoadedState & { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not load the instructions (HTTP ${res.status}).`);
      setState(json);
      setDraft(json.instructions ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/instructions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: draft }),
      });
      const json = (await res.json()) as { error?: string; brokenRefs?: string[] };
      if (!res.ok) throw new Error(json.error || `Save failed (HTTP ${res.status}).`);
      setBrokenRefs(json.brokenRefs ?? []);
      // Said out loud, because the crew reads this on a phone and a save that looks like it worked
      // and did not is how somebody drives to a site with last week's instructions.
      setNotice('Saved. The field crew sees this in Work Mode.');
      setState((s) => (s ? { ...s, instructions: draft } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  /** Append an embed for a file. Appended rather than inserted at the caret: the textarea is
   *  uncontrolled about selection and guessing a caret position that has moved is worse than a
   *  predictable place the author can then drag. */
  const insertFile = (f: JobFileLite) => {
    const label = f.file_name.replace(/\.[a-z0-9]+$/i, '');
    setDraft((d) => `${d}${d && !d.endsWith('\n') ? '\n' : ''}[${label}](job-file:${f.id})\n`);
    setNotice(null);
  };

  if (error && !state) {
    return <p className="admin-error" role="alert">{error}</p>;
  }
  if (!state) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>Loading the instructions…</p>;
  }

  const dirty = draft !== state.instructions;

  return (
    <div className="job-detail__section">
      <h3><FileText size={15} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Field crew instructions</h3>
      <p className="job-detail__section-desc">
        What the crew needs to know before they leave — access, monuments to look for, what to shoot,
        who to call. This is the text they see in Work Mode on their phone. Attach a file from this
        job and it travels with the instruction rather than being described in words.
      </p>

      {!state.canEdit && (
        <div className="job-detail__section" role="note" style={bandStyle}>
          Only the job’s lead RPLS or an admin can change these. You are seeing them read-only.
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setNotice(null); }}
        disabled={!state.canEdit || saving}
        rows={14}
        aria-label="Field crew instructions"
        placeholder={'e.g.\n1. Gate code 4471 — call Dwayne (254-555-0102) if the lock is changed.\n2. Recover the 1/2" iron rod at the NE corner — see the plat below.\n3. Shoot the fence line; it does not follow the deed call.'}
        style={textareaStyle}
      />

      {files.length > 0 && state.canEdit && (
        <div style={{ marginTop: '0.6rem' }}>
          <div style={pickerLabelStyle}>
            <Link2 size={13} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
            Attach a file from this job
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {files.slice(0, 24).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => insertFile(f)}
                disabled={saving}
                style={chipStyle}
                title={`Insert a link to ${f.file_name}`}
              >
                {f.file_name}
              </button>
            ))}
          </div>
        </div>
      )}
      {files.length === 0 && state.canEdit && (
        <p style={{ ...pickerLabelStyle, marginTop: '0.6rem' }}>
          No files on this job yet — upload one on the Files tab and it becomes attachable here.
        </p>
      )}

      {state.canEdit && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} style={primaryBtn}>
            {saving ? <Loader2 size={13} className="spin" style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} /> : null}
            {saving ? 'Saving…' : dirty ? 'Save instructions' : 'Saved'}
          </button>
          {dirty && !saving && (
            <button type="button" onClick={() => { setDraft(state.instructions); setNotice(null); }} style={ghostBtn}>
              Discard changes
            </button>
          )}
          {notice && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-success-text)' }}>
              <Check size={13} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />{notice}
            </span>
          )}
        </div>
      )}

      {error && <p className="admin-error" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}

      {/* Reported by the save, because a link that points at a deleted file renders as plain text on
          the crew's phone — it fails by looking fine. */}
      {brokenRefs.length > 0 && (
        <div role="alert" style={{ ...bandStyle, borderLeftColor: 'var(--color-warning)', marginTop: '0.6rem' }}>
          <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
          {brokenRefs.length} attached file{brokenRefs.length === 1 ? '' : 's'} no longer exist
          {brokenRefs.length === 1 ? 's' : ''} on this job. Those links will show as plain text to the
          crew — re-attach them from the list above.
        </div>
      )}
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.6rem 0.7rem',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)',
  fontSize: '0.87rem',
  lineHeight: 1.55,
  fontFamily: 'inherit',
  resize: 'vertical',
};

const pickerLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)',
  marginBottom: '0.35rem',
};

const chipStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  borderRadius: 999,
  padding: '0.25rem 0.65rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const primaryBtn: React.CSSProperties = {
  border: '1px solid var(--color-brand-navy)',
  background: 'var(--color-brand-navy)',
  color: 'var(--color-text-on-brand)',
  borderRadius: 6,
  padding: '0.4rem 0.9rem',
  fontSize: '0.83rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  borderRadius: 6,
  padding: '0.4rem 0.8rem',
  fontSize: '0.83rem',
  cursor: 'pointer',
};

const bandStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderLeft: '4px solid var(--color-info)',
  borderRadius: 6,
  padding: '0.55rem 0.7rem',
  fontSize: '0.83rem',
  lineHeight: 1.45,
  color: 'var(--color-text-secondary)',
};
