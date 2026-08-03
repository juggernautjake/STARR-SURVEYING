'use client';
// app/AndrewAsh/studio/coaching/StudentList.tsx — who is learning, and where they are up to.
//
// ── "LESSON DONE" IS ONE TAP ────────────────────────────────────────────────────────────────────
//
// It is the most frequent write on this page and it happens right after a lesson ends, usually on a
// phone, usually while the student is still putting their coat on. Anything that requires typing a
// number gets done "later", and later is when the count drifts and Andrew has to reconstruct how many
// lessons somebody has left from memory.
//
// The remaining count is shown as a bar because "3 of 4" is a fact and a nearly-empty bar is a
// prompt — it is the cue to ask whether they want to book another block, which is the single highest-
// value conversation in a coaching business.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Minus, Plus, UserPlus } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
  packageName: string | null;
  goals: string;
  notes: string;
  status: string;
  sessionsPurchased: number;
  sessionsUsed: number;
}

const STATUSES = ['active', 'paused', 'completed', 'prospective'];

export default function StudentList({
  students,
  clients,
  packages,
}: {
  students: Student[];
  clients: { id: string; name: string }[];
  packages: { id: string; name: string; sessionCount: number }[];
}): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [goals, setGoals] = useState('');
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  async function call(method: string, body: Record<string, unknown> | null, key: string, query = ''): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/coaching${query}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {students.length === 0 && !adding ? (
        <div className="vaEmptyPanel">
          <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>No students yet.</p>
          <p style={{ margin: '0 0 18px', fontSize: '0.875rem', maxWidth: '52ch', marginInline: 'auto' }}>
            The fastest first students are where you already are — a choir director, a school theatre
            programme, the UMHB music department. One conversation is worth a month of advertising.
          </p>
          {clients.length > 0 && (
            <button type="button" className="vaBtn vaBtnSolid vaBtnSm" onClick={() => setAdding(true)}>
              <UserPlus size={13} aria-hidden /> Add a student
            </button>
          )}
        </div>
      ) : (
        <>
          <table className="vaDataTable">
            <thead>
              <tr>
                <th>Student</th>
                <th>Package</th>
                <th>Lessons left</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const left = Math.max(0, s.sessionsPurchased - s.sessionsUsed);
                const pct = s.sessionsPurchased > 0 ? (s.sessionsUsed / s.sessionsPurchased) * 100 : 0;
                return (
                  <tr key={s.id} style={s.status === 'active' ? undefined : { opacity: 0.6 }}>
                    <td data-label="Student">
                      <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{s.name}</span>
                      {s.goals && (
                        <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                          {s.goals.slice(0, 70)}
                        </span>
                      )}
                    </td>
                    <td data-label="Package">{s.packageName ?? '—'}</td>
                    <td data-label="Lessons left">
                      <span style={{ color: left === 0 ? 'var(--va-danger)' : 'var(--va-text)', fontWeight: 600 }}>
                        {left} of {s.sessionsPurchased}
                      </span>
                      <span className="vaCatBar" style={{ marginLeft: 0, maxWidth: 120 }} aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      {left === 0 && s.status === 'active' && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--va-danger)', marginTop: 3 }}>
                          Ask about another block
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <select
                        className="vaSelect"
                        style={{ padding: '5px 26px 5px 8px', fontSize: '0.75rem' }}
                        value={s.status}
                        onChange={(e) => void call('PATCH', { kind: 'student', id: s.id, status: e.target.value }, `st-${s.id}`)}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                    <td data-label="">
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="vaBtn vaBtnSolid vaBtnSm"
                          disabled={busy === `log-${s.id}`}
                          onClick={() => void call('PATCH', { kind: 'student', id: s.id, logSession: true }, `log-${s.id}`)}
                        >
                          {busy === `log-${s.id}` ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Plus size={12} aria-hidden />}
                          Lesson done
                        </button>
                        {s.sessionsUsed > 0 && (
                          <button
                            type="button"
                            className="vaBtn vaBtnGhost vaBtnSm"
                            title="Undo the last one"
                            disabled={busy === `un-${s.id}`}
                            onClick={() => void call('PATCH', { kind: 'student', id: s.id, unlogSession: true }, `un-${s.id}`)}
                          >
                            <Minus size={12} aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          className="vaBtn vaBtnGhost vaBtnSm"
                          onClick={() => {
                            setOpenNotes(openNotes === s.id ? null : s.id);
                            setNoteDraft(s.notes);
                          }}
                        >
                          Notes
                        </button>
                      </span>

                      {openNotes === s.id && (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            className="vaTextarea"
                            rows={4}
                            value={noteDraft}
                            placeholder="What you worked on, what to pick up next time, exercises set."
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <div className="vaStudioActions">
                            <button
                              type="button"
                              className="vaBtn vaBtnSolid vaBtnSm"
                              disabled={busy === `n-${s.id}`}
                              onClick={async () => {
                                const ok = await call('PATCH', { kind: 'student', id: s.id, notes: noteDraft }, `n-${s.id}`);
                                if (ok) setOpenNotes(null);
                              }}
                            >
                              <Check size={13} aria-hidden /> Save notes
                            </button>
                            <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpenNotes(null)}>
                              Cancel
                            </button>
                          </div>
                          <p className="vaHint">
                            Read these before the next lesson. It is the difference between a teacher
                            and someone who turns up.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!adding && clients.length > 0 && (
            <button type="button" className="vaBtn vaBtnOutline vaBtnSm" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
              <UserPlus size={13} aria-hidden /> Add a student
            </button>
          )}
        </>
      )}

      {clients.length === 0 && (
        <p className="vaHint" style={{ marginTop: 14 }}>
          Students come from clients. Add someone in Clients with &ldquo;coaching&rdquo; as what they
          work with you on, and they will appear here.
        </p>
      )}

      {adding && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--va-line)', paddingTop: 18 }}>
          <div className="vaFieldRow vaFieldRow2">
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-sd-client">Who</label>
              <select id="va-sd-client" className="vaSelect" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-sd-pkg">Package</label>
              <select
                id="va-sd-pkg"
                className="vaSelect"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
              >
                <option value="">None yet</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-sd-goals">What do they want to work on?</label>
            <textarea id="va-sd-goals" className="vaTextarea" rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} />
          </div>
          <div className="vaStudioActions">
            <button
              type="button"
              className="vaBtn vaBtnSolid vaBtnSm"
              disabled={busy === 'add' || !clientId}
              onClick={async () => {
                const pkg = packages.find((p) => p.id === packageId);
                const ok = await call(
                  'POST',
                  {
                    kind: 'student',
                    clientId,
                    packageId: packageId || null,
                    goals,
                    // Lessons purchased default to the package's count — the whole point of choosing
                    // a package is that it says how many.
                    sessionsPurchased: pkg?.sessionCount ?? 0,
                  },
                  'add',
                );
                if (ok) {
                  setAdding(false);
                  setClientId('');
                  setPackageId('');
                  setGoals('');
                }
              }}
            >
              {busy === 'add' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <UserPlus size={14} aria-hidden />}
              Add them
            </button>
            <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
