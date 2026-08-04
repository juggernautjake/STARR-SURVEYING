'use client';
// app/admin/components/OnboardingChecklist.tsx — the first-run path (audit item 8i, Phase 4 #19).
//
// One card, one next step, and a way to see the rest. Deliberately not a modal takeover: a firm that
// wants to look around before setting anything up should be able to, and a wizard nobody can dismiss
// is the fastest way to make people close the tab.
//
// ── IT DISAPPEARS ON ITS OWN ────────────────────────────────────────────────────────────────────
//
// No "don't show this again" checkbox, because the state is measured rather than remembered (see the
// API's header). When the required steps are done the card stops rendering, and if somebody later
// removes their only teammate it comes back — which is correct, and which a dismissal flag would
// suppress exactly when it mattered.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Circle, Lock } from 'lucide-react';
import type { OnboardingState } from '@/lib/saas/onboarding';

export default function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/onboarding', { cache: 'no-store' });
      if (!r.ok) { setFailed(true); return; }
      const j = await r.json();
      setState(j.state ?? null);
    } catch {
      // Silent. Unlike the compliance and receivables pages, a checklist that fails to load is not
      // dangerous to be missing — and an error banner about a setup helper on top of whatever else
      // is broken is noise at the worst moment.
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Nothing to say: still loading, failed, or the firm is set up.
  if (!state || failed || state.ready) return null;

  const { next, steps, requiredDone, requiredTotal } = state;

  return (
    <section
      aria-label="Set up your firm"
      style={{ border: '1px solid var(--color-info-text)', background: 'var(--color-info-surface)', borderRadius: 12, padding: 16, marginBottom: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-info-text)' }}>
            Setting up · {requiredDone} of {requiredTotal} essentials done
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
            {next ? next.title : 'Almost there'}
          </div>
          {next && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{next.why}</div>}
        </div>
        {next && (
          <Link
            href={next.href}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-info-text)', color: 'var(--color-bg-card)', textDecoration: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}
          >
            {next.done ? 'Review' : 'Set up'} <ArrowRight size={15} aria-hidden />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          // PWA W6f — 39px, one pixel under the 40px control floor. Worth the line rather than
          // rounding down to "close enough": the floor is a floor, and a rule with a tolerance is a
          // rule nobody can check. `minHeight` leaves the padding and the text where they are.
          style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 8, minHeight: 40, padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}
        >
          All steps <ChevronDown size={14} aria-hidden style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>

      {expanded && (
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {steps.map((s) => (
            <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
              {s.done
                ? <Check size={16} aria-hidden style={{ color: 'var(--color-success-text)' }} />
                : s.blocked
                  // Shown, not hidden. A step you cannot start yet is information; a step that is
                  // not there at all reads as a feature the product does not have.
                  ? <Lock size={15} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
                  : <Circle size={15} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--color-text-secondary)' : undefined }}>
                  {s.title}
                  {!s.required && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}> · optional</span>}
                </div>
                {!s.done && s.blocked && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Do “{steps.find((x) => x.id === s.blockedBy[0])?.title ?? 'the earlier step'}” first
                  </div>
                )}
              </div>
              {!s.done && !s.blocked && <Link href={s.href} style={{ fontSize: 13, fontWeight: 600 }}>Start</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
