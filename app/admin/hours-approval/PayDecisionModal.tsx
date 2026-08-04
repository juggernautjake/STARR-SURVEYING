'use client';

// app/admin/hours-approval/PayDecisionModal.tsx
//
// DECIDE WHAT A DAY IS WORTH (owner request, 2026-08-04)
// ═════════════════════════════════════════════════════
//
// *"Whenever hours come in, the boss should be able to see what that employee's base pay is
// automatically, and should have a reference for all of the other activities' pay levels too in
// case they want to apply those pay rates for different parts of the day or something. Like,
// someone might draw for a couple hours, and also work in the field for about 6 hours. They can
// submit that they worked 8 hours, but the boss might choose to pay the rate for drawing for 2
// hours and the field work rate for 6 hours, or he might want to just give them the base pay for
// the whole time, or he will pay them some unique amount. The boss… can add notes to the payout."*
//
// Everything in that paragraph is on this screen, and nothing that is not:
//
//   • the employee's agreed base pay, stated at the top, always, without being asked for;
//   • every activity rate **priced for this person** — grade, seniority and credentials included,
//     never the firm's list price, since the whole point is deciding what THIS person is owed;
//   • split the day into as many blocks as you like, each on its own rate;
//   • or type a unique amount on any block;
//   • or leave a block unpriced, which pays nothing yet and says so rather than paying zero;
//   • a note on the payout, which the employee sees.
//
// It opens on the answer the rules already gave, so agreeing is one click and typing is only for
// disagreeing. The running total is always visible against what the standard rates would have paid,
// because "am I paying more or less than usual" is the question an approver actually has.

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ResolvedRate {
  rate: number | null;
  source: 'manual' | 'override' | 'activity' | 'base' | 'unset';
  explanation: string;
  floorApplied: boolean;
  outOfBand: { band: { min: number; max: number }; direction: 'below' | 'above' } | null;
}

interface Block {
  hours: number;
  work_type: string | null;
  rate: number | null;
  source: ResolvedRate['source'];
  label: string;
  explanation: string;
}

interface MenuActivity {
  work_type: string;
  label: string;
  icon: string | null;
  base_rate: number;
  resolved: ResolvedRate;
}

interface DecisionPayload {
  log: { id: string; log_date: string; description: string; hours: number; adjusted_hours: number | null; total_pay: number | null };
  payable_hours: number;
  person: {
    email: string; name: string | null; base_pay: number | null;
    tier_label: string | null; years_employed: number; has_profile: boolean;
    band: { min: number; max: number } | null;
  };
  menu: { base: ResolvedRate; activities: MenuActivity[] };
  decision: { payout_note: string | null; decided_by: string; decided_at: string } | null;
  suggested_blocks: Block[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** The choice a block is priced by. `__base` and `__manual` are UI-only; they map to rate + source. */
const BASE_CHOICE = '__base';
const MANUAL_CHOICE = '__manual';
const UNDECIDED_CHOICE = '__undecided';

export default function PayDecisionModal({
  timeLogId,
  onClose,
  onSaved,
}: {
  timeLogId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<DecisionPayload | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/time-logs/pay-decision?id=${timeLogId}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(body.error || 'Could not load this entry.'); return; }
        setData(body);
        setBlocks(body.suggested_blocks ?? []);
        setNote(body.decision?.payout_note ?? '');
      } catch {
        if (!cancelled) setError('Could not load this entry.');
      }
    })();
    return () => { cancelled = true; };
  }, [timeLogId]);

  const totals = useMemo(() => {
    let paid = 0, paidHours = 0, undecided = 0;
    for (const b of blocks) {
      if (!Number.isFinite(b.hours) || b.hours <= 0) continue;
      if (b.rate === null) { undecided += b.hours; continue; }
      paid += b.hours * b.rate;
      paidHours += b.hours;
    }
    return {
      paid: Math.round(paid * 100) / 100,
      hours: Math.round((paidHours + undecided) * 100) / 100,
      undecided: Math.round(undecided * 100) / 100,
    };
  }, [blocks]);

  const updateBlock = useCallback((index: number, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }, []);

  /** Re-price a block when the approver changes what it is being paid as. */
  const choosePricing = useCallback((index: number, choice: string) => {
    if (!data) return;
    if (choice === MANUAL_CHOICE) {
      updateBlock(index, {
        work_type: null, source: 'manual',
        label: 'Set by hand',
        // Seeded from whatever the block was already worth, so switching to a manual amount starts
        // from the current number instead of blanking it and losing the reference point.
        rate: blocks[index]?.rate ?? data.menu.base.rate ?? 0,
        explanation: 'Set by hand for this entry.',
      });
      return;
    }
    if (choice === UNDECIDED_CHOICE) {
      updateBlock(index, {
        work_type: null, source: 'unset', rate: null, label: 'Not decided',
        explanation: 'Left undecided — pays nothing until somebody sets a rate.',
      });
      return;
    }
    if (choice === BASE_CHOICE) {
      updateBlock(index, {
        work_type: null, source: data.menu.base.source, rate: data.menu.base.rate,
        label: 'Base pay', explanation: data.menu.base.explanation,
      });
      return;
    }
    const activity = data.menu.activities.find((a) => a.work_type === choice);
    if (!activity) return;
    updateBlock(index, {
      work_type: activity.work_type, source: activity.resolved.source,
      rate: activity.resolved.rate, label: activity.label,
      explanation: activity.resolved.explanation,
    });
  }, [data, blocks, updateBlock]);

  const addBlock = useCallback(() => {
    if (!data) return;
    // The new block takes whatever hours are still unaccounted for, so the common split — "2 of the
    // 8 were drafting" — needs one number typed rather than two.
    const remaining = Math.max(0, Math.round((data.payable_hours - totals.hours) * 100) / 100);
    setBlocks((prev) => [...prev, {
      hours: remaining,
      work_type: null,
      source: data.menu.base.source,
      rate: data.menu.base.rate,
      label: 'Base pay',
      explanation: data.menu.base.explanation,
    }]);
  }, [data, totals.hours]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/time-logs/pay-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_log_id: timeLogId, blocks, payout_note: note }),
      });
      const body = await res.json();
      // The server's refusal names both numbers ("adds up to 6 hours but the entry is for 8"), so
      // it is shown verbatim rather than replaced with a generic failure.
      if (!res.ok) { setError(body.error || 'Could not save this decision.'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Could not save this decision.');
    } finally {
      setSaving(false);
    }
  }, [timeLogId, blocks, note, onSaved, onClose]);

  const withdraw = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/time-logs/pay-decision?id=${timeLogId}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json(); setError(b.error || 'Could not withdraw.'); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [timeLogId, onSaved, onClose]);

  const hoursMatch = data ? Math.abs(totals.hours - data.payable_hours) < 0.01 : true;

  return (
    <div className="tl-modal-overlay" onClick={onClose}>
      <div className="tl-modal tl-modal--pay" onClick={(e) => e.stopPropagation()}>
        <h3>Set pay for these hours</h3>

        {error && <div className="tl-pay-error">{error}</div>}
        {!data && !error && <p className="tl-pay-loading">Loading…</p>}

        {data && (
          <>
            {/* Stated without being asked for — the owner's "should be able to see what that
                employee's base pay is automatically". */}
            <div className="tl-pay-who">
              <strong>{data.person.name ?? data.person.email}</strong>
              {data.person.base_pay != null
                ? <span> — {money(data.person.base_pay)}/hr agreed base pay</span>
                : <span className="tl-pay-who__warn"> — no agreed pay rate set</span>}
              {data.person.tier_label && <span> · {data.person.tier_label}</span>}
              {data.person.base_pay != null && (
                <span> · {data.person.years_employed} {data.person.years_employed === 1 ? 'year' : 'years'} in</span>
              )}
              {data.person.band && (
                <span className="tl-pay-who__band">
                  Usual range for this grade: {money(data.person.band.min)}–{money(data.person.band.max)}/hr
                </span>
              )}
            </div>

            <div className="tl-pay-entry">
              {data.log.log_date} · {data.payable_hours}h · {data.log.description}
            </div>

            <div className="tl-pay-blocks">
              {blocks.map((b, i) => (
                <div key={i} className="tl-pay-block">
                  <div className="tl-pay-block__row">
                    <label className="tl-pay-block__hours">
                      <span>Hours</span>
                      <input
                        type="number" min="0" max="24" step="0.25"
                        value={b.hours || ''}
                        onChange={(e) => updateBlock(i, { hours: parseFloat(e.target.value) || 0 })}
                      />
                    </label>

                    <label className="tl-pay-block__pricing">
                      <span>Paid as</span>
                      <select
                        value={
                          b.source === 'manual' ? MANUAL_CHOICE
                            : b.source === 'unset' ? UNDECIDED_CHOICE
                            : b.work_type ?? BASE_CHOICE
                        }
                        onChange={(e) => choosePricing(i, e.target.value)}
                      >
                        <option value={BASE_CHOICE}>
                          Base pay{data.menu.base.rate != null ? ` — ${money(data.menu.base.rate)}/hr` : ' — not set'}
                        </option>
                        {/* Every activity, priced for this person. This is the "reference for all of
                            the other activities' pay levels" the owner asked for. */}
                        {data.menu.activities.map((a) => (
                          <option key={a.work_type} value={a.work_type}>
                            {a.label}{a.resolved.rate != null ? ` — ${money(a.resolved.rate)}/hr` : ''}
                          </option>
                        ))}
                        <option value={MANUAL_CHOICE}>A unique amount…</option>
                        <option value={UNDECIDED_CHOICE}>Leave undecided</option>
                      </select>
                    </label>

                    {b.source === 'manual' && (
                      <label className="tl-pay-block__rate">
                        <span>$/hr</span>
                        <input
                          type="number" min="0" step="0.25"
                          value={b.rate ?? ''}
                          onChange={(e) => updateBlock(i, {
                            rate: e.target.value === '' ? null : parseFloat(e.target.value),
                          })}
                        />
                      </label>
                    )}

                    <span className="tl-pay-block__subtotal">
                      {b.rate != null ? money(b.rate * (b.hours || 0)) : '—'}
                    </span>

                    {blocks.length > 1 && (
                      <button
                        className="tl-btn tl-btn--sm tl-btn--danger"
                        onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="tl-pay-block__why">{b.explanation}</div>
                </div>
              ))}
            </div>

            <button className="tl-btn tl-btn--sm" onClick={addBlock}>+ Split off more hours</button>

            <div className={`tl-pay-total ${hoursMatch ? '' : 'tl-pay-total--mismatch'}`}>
              <span>{totals.hours}h of {data.payable_hours}h accounted for</span>
              <strong>{money(totals.paid)}</strong>
              {totals.undecided > 0 && <span className="tl-pay-total__undecided">{totals.undecided}h left undecided</span>}
              {data.log.total_pay != null && (
                <span className="tl-pay-total__vs">
                  Standard rates would pay {money(data.log.total_pay)}
                </span>
              )}
              {!hoursMatch && (
                <span className="tl-pay-total__warn">
                  The blocks must add up to {data.payable_hours}h before this can be saved.
                </span>
              )}
            </div>

            <label className="tl-pay-note">
              <span>Note on the payout (the employee sees this)</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid drafting rate for the plat work, field rate for the rest."
              />
            </label>

            {data.decision && (
              <p className="tl-pay-prior">
                Currently set by {data.decision.decided_by} on {new Date(data.decision.decided_at).toLocaleDateString()}.
              </p>
            )}

            <div className="tl-modal__actions">
              {data.decision && (
                <button className="tl-btn tl-btn--danger" onClick={withdraw} disabled={saving}>
                  Withdraw decision
                </button>
              )}
              <button className="tl-btn" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="tl-btn tl-btn--primary" onClick={save} disabled={saving || !hoursMatch}>
                {saving ? 'Saving…' : 'Save pay decision'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
