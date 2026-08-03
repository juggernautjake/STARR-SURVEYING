// app/admin/research/components/RotationPanel.tsx — put the record survey on the grid you are shooting.
//
// The owner asked for this by name: *"if we have an older survey where the bearings are 1–3 degrees
// off of our GPS recordings from the actual field, we can input our recordings and correctly rotate
// the original."* The arithmetic has existed since Phase I / S4 and had no way in — no route, no
// page, no button. This is the way in.
//
// Two things about the UI are deliberate rather than decorative:
//
//   The result leads with **what cannot be checked**. A one-line backsight and a two-corner fit both
//   produce a clean-looking rotation with no redundancy behind it, and that is the shape of a
//   confident wrong answer. `unchecked` is rendered as a banner above the number, not as a footnote.
//
//   Rotated bearings are shown BESIDE the record ones, never replacing them. A rotated bearing on a
//   plat is a misrecital of the record.
'use client';

import { useState } from 'react';

interface RecordCallInput {
  bearing: string | null;
  distance: number | null;
}

interface RotationResponse {
  ok: boolean;
  reason?: string;
  nextStep?: string;
  basis?: 'ties' | 'backsight';
  rotationDeg?: number;
  rotationLabel?: string;
  appliedScale?: number;
  observedScale?: number | null;
  unchecked?: boolean;
  statement?: string;
  lineChecks?: string[];
  caveats?: string[];
  rotated?: Array<{
    index: number; recordBearing: string; rotatedBearing: string;
    rotatedAzimuthDeg: number; distance: number;
  }>;
  skipped?: Array<{ index: number; reason: string }>;
  fit?: {
    rmsResidual: number;
    worst: { label: string; distance: number } | null;
    residuals: Array<{ label: string; dn: number; de: number; distance: number }>;
  } | null;
}

interface TieRow { label: string; callIndex: string; n: string; e: string }

interface RotationPanelProps {
  projectId: string;
  /** The record description, as the viewer already holds it. */
  calls: RecordCallInput[];
  isOpen: boolean;
  onClose: () => void;
}

const emptyTie = (): TieRow => ({ label: '', callIndex: '', n: '', e: '' });

export default function RotationPanel({ projectId, calls, isOpen, onClose }: RotationPanelProps) {
  const [mode, setMode] = useState<'ties' | 'backsight'>('ties');
  const [ties, setTies] = useState<TieRow[]>([emptyTie(), emptyTie()]);
  const [recordBearing, setRecordBearing] = useState('');
  const [measuredBearing, setMeasuredBearing] = useState('');
  const [fitScale, setFitScale] = useState(false);
  const [result, setResult] = useState<RotationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const setTie = (i: number, patch: Partial<TieRow>) =>
    setTies((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const basis = mode === 'backsight'
        ? { kind: 'backsight' as const, recordBearing, measuredBearing }
        : {
            kind: 'ties' as const,
            fitScale,
            ties: ties
              .filter((t) => t.callIndex !== '' && t.n !== '' && t.e !== '')
              .map((t) => ({
                label: t.label || `Corner ${t.callIndex}`,
                // The form is 1-based because the calls are shown 1-based everywhere else; the
                // service is 0-based. Converting here rather than in the service keeps ONE
                // convention on each side of the boundary.
                callIndex: Number(t.callIndex) - 1,
                measured: { n: Number(t.n), e: Number(t.e) },
              })),
          };

      const res = await fetch(`/api/admin/research/${projectId}/rotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calls, basis }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setResult((await res.json()) as RotationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg bg-gray-900 border border-gray-700 text-gray-100">
        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">Rotate record onto field work</h2>
            <p className="text-xs text-gray-400">
              Expresses the record in the basis you are measuring in. The shape is untouched.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">✕</button>
        </header>

        <div className="p-5 space-y-5">
          {/* ── Basis ── */}
          <div className="flex gap-4 text-sm">
            {(['ties', 'backsight'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rotationMode" checked={mode === m} onChange={() => setMode(m)} />
                <span>{m === 'ties' ? 'Tied corners (GPS)' : 'Backsight (robotic)'}</span>
              </label>
            ))}
          </div>

          {mode === 'ties' ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                Each row ties one record corner to where you measured it. The call number is the call
                that <em>arrives</em> at that corner. Two corners give a rotation; three or more give
                a rotation you can check.
              </p>
              <div className="grid grid-cols-[1fr_5rem_1fr_1fr] gap-2 text-xs text-gray-400">
                <span>Label</span><span>Call #</span><span>Measured N (ft)</span><span>Measured E (ft)</span>
              </div>
              {ties.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_1fr_1fr] gap-2">
                  <input value={t.label} onChange={(e) => setTie(i, { label: e.target.value })}
                    placeholder="IRF at fence" className="bg-gray-800 rounded px-2 py-1 text-sm" />
                  <input value={t.callIndex} onChange={(e) => setTie(i, { callIndex: e.target.value })}
                    inputMode="numeric" placeholder="1" className="bg-gray-800 rounded px-2 py-1 text-sm" />
                  <input value={t.n} onChange={(e) => setTie(i, { n: e.target.value })}
                    inputMode="decimal" placeholder="10234567.12" className="bg-gray-800 rounded px-2 py-1 text-sm" />
                  <input value={t.e} onChange={(e) => setTie(i, { e: e.target.value })}
                    inputMode="decimal" placeholder="3145678.90" className="bg-gray-800 rounded px-2 py-1 text-sm" />
                </div>
              ))}
              <button onClick={() => setTies((p) => [...p, emptyTie()])}
                className="text-sm text-blue-400 hover:text-blue-300">+ Add corner</button>

              <label className="flex items-start gap-2 pt-2 text-sm cursor-pointer">
                <input type="checkbox" checked={fitScale} onChange={(e) => setFitScale(e.target.checked)}
                  className="mt-1" />
                <span>
                  Also solve for scale
                  <span className="block text-xs text-gray-400">
                    Off by default. A floating scale absorbs the two things a distance disagreement is
                    usually telling you — grid vs ground, or varas read as feet. The ratio is reported
                    either way; this only decides whether it is <em>applied</em>.
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                One line held as the basis, the way a robotic setup does. Exact by construction, and
                therefore unverifiable — if the backsight is on the wrong monument, everything rotates
                with it.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-xs text-gray-400 mb-1">Record calls this line</span>
                  <input value={recordBearing} onChange={(e) => setRecordBearing(e.target.value)}
                    placeholder={'N 0°00\'00" E'} className="w-full bg-gray-800 rounded px-2 py-1" />
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-gray-400 mb-1">You are holding</span>
                  <input value={measuredBearing} onChange={(e) => setMeasuredBearing(e.target.value)}
                    placeholder={'N 1°42\'18" E'} className="w-full bg-gray-800 rounded px-2 py-1" />
                </label>
              </div>
            </div>
          )}

          <button onClick={run} disabled={busy}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium">
            {busy ? 'Solving…' : 'Compute rotation'}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* ── Result ── */}
          {result && !result.ok && (
            <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm">
              <p className="font-medium text-amber-300">No rotation was computed.</p>
              <p className="text-amber-100/90 mt-1">{result.reason}</p>
              {result.nextStep && <p className="text-amber-200/80 mt-1">{result.nextStep}</p>}
            </div>
          )}

          {result?.ok && (
            <div className="space-y-3">
              {/* Above the number, deliberately: an unchecked fit is the shape of a confident wrong
                  answer, and a footnote is where that gets missed. */}
              {result.unchecked && (
                <div className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm">
                  <p className="font-medium text-amber-300">Nothing here can check this rotation.</p>
                  <p className="text-amber-100/90 mt-1">{result.nextStep}</p>
                </div>
              )}

              <div className="rounded border border-gray-700 bg-gray-850 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400">Rotation</p>
                <p className="text-2xl font-semibold">{result.rotationLabel}</p>
                <p className="text-sm text-gray-300 mt-2">{result.statement}</p>
                {result.fit && (
                  <p className="text-sm text-gray-400 mt-2">
                    RMS residual {result.fit.rmsResidual.toFixed(3)} ft
                    {result.fit.worst && ` · worst: ${result.fit.worst.label} at ${result.fit.worst.distance.toFixed(3)} ft`}
                  </p>
                )}
                {result.observedScale != null && (
                  <p className="text-sm text-gray-400 mt-1">
                    Observed scale {result.observedScale.toFixed(7)}
                    {result.appliedScale === 1 && ' (not applied)'}
                  </p>
                )}
              </div>

              {result.lineChecks && result.lineChecks.length > 0 && (
                <ul className="text-sm text-gray-300 space-y-1">
                  {result.lineChecks.map((c, i) => <li key={i}>• {c}</li>)}
                </ul>
              )}

              {result.rotated && result.rotated.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">
                    Record vs rotated — the record call is never replaced
                  </p>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-400">
                      <tr><th className="text-left py-1">#</th><th className="text-left">Record</th>
                        <th className="text-left">Rotated</th><th className="text-right">Distance</th></tr>
                    </thead>
                    <tbody>
                      {result.rotated.map((c) => (
                        <tr key={c.index} className="border-t border-gray-800">
                          <td className="py-1 text-gray-400">{c.index + 1}</td>
                          <td className="font-mono text-xs">{c.recordBearing}</td>
                          <td className="font-mono text-xs text-blue-300">{c.rotatedBearing}</td>
                          <td className="text-right text-gray-300">
                            {Number.isFinite(c.distance) ? c.distance.toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.skipped && result.skipped.length > 0 && (
                <ul className="text-sm text-amber-300/90 space-y-1">
                  {result.skipped.map((s) => <li key={s.index}>• {s.reason}</li>)}
                </ul>
              )}

              {result.caveats && result.caveats.length > 0 && (
                <ul className="text-xs text-gray-400 space-y-1 border-t border-gray-800 pt-3">
                  {result.caveats.map((c, i) => <li key={i}>• {c}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
