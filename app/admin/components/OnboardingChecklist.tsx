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
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Circle, Lock } from 'lucide-react';
import type { OnboardingState } from '@/lib/saas/onboarding';

/**
 * Tag a step's destination so it knows it was reached from the setup checklist.
 *
 * Owner, 2026-08-04: *"whenever I input the firm's details and hit save, there is no like, 'NEXT'
 * button that will direct me to the next place I need to go."* The checklist sent people out and
 * had no way to bring them back — every step was a one-way trip ending on a settings page with no
 * indication that anything followed it.
 *
 * A query parameter rather than a wrapper route: the destinations are real pages people also reach
 * normally, and they must not change for those visitors.
 */
function withReturn(href: string): string {
  return href.includes('#')
    ? href.replace('#', href.includes('?') ? '&setup=1#' : '?setup=1#')
    : `${href}${href.includes('?') ? '&' : '?'}setup=1`;
}

export default function OnboardingChecklist() {
  // ── Owners and admins only (owner request, 2026-08-04) ──────────────────────────────────────
  //
  // Every step this card offers leads somewhere a field-crew member cannot open: org settings,
  // invites, rates. So for everyone else it was a to-do list of things they are not permitted to
  // do, sitting at the top of the first screen they see, with a count that could never move however
  // long they looked at it.
  //
  // Read from the session rather than fetched, so a crew member costs no request at all.
  const { data: session } = useSession();
  const roles: string[] = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
  const mayComplete = roles.includes('admin') || roles.includes('owner') || roles.includes('developer');

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

  useEffect(() => { if (mayComplete) load(); }, [load, mayComplete]);

  // Nothing to say: still loading, failed, or the firm is set up.
  // `state.ready` is the disappearance the owner asked for, and it was already the behaviour — what
  // was missing is that the card never named WHICH field was blank, so "meet the requirements" had
  // no visible finish line. See `missing` below.
  if (!mayComplete || !state || failed || state.ready) return null;

  const { next, steps, requiredDone, requiredTotal } = state;

  return (
    <section
      aria-label="Set up your firm"
      style={{ border: '1px solid var(--color-info-text)', background: 'var(--color-info-surface)', borderRadius: 12, padding: 16, marginBottom: 20 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-info-text)' }}>
            {/* NAMES the essentials (owner, 2026-08-04: *"what are the essentials? It doesn't
                say… and it is showing a lot more than 2 things not done"*).
                Two of the eight steps are required; the other six are optional and were listed
                identically, so the count and the list contradicted each other on screen. */}
            Setting up · {requiredDone} of {requiredTotal} essentials done
            <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
              {' '}— the essentials are{' '}
              {steps.filter((s) => s.required).map((s, i, all) => (
                <span key={s.id}>
                  <strong style={{ textDecoration: s.done ? 'line-through' : undefined }}>{s.title}</strong>
                  {i < all.length - 1 ? ' and ' : ''}
                </span>
              ))}
              . Everything else is optional.
            </span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
            {next ? next.title : 'Almost there'}
          </div>
          {next && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{next.why}</div>}
          {/* WHAT is blank, not just why it matters. Without this the card states a goal and a
              score and never the gap, so a firm with a name but no phone sees "0 of 2 done" and no
              way to work out which half is missing. */}
          {next && next.missing.length > 0 && (
            <div style={{ fontSize: 13, marginTop: 6 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Still needed: </span>
              <strong>{next.missing.join(' · ')}</strong>
            </div>
          )}
        </div>
        {next && (
          <Link
            href={withReturn(next.href)}
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
                {!s.done && !s.blocked && s.missing.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Needs: {s.missing.join(' · ')}
                  </div>
                )}
                {!s.done && s.blocked && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Do “{steps.find((x) => x.id === s.blockedBy[0])?.title ?? 'the earlier step'}” first
                  </div>
                )}
              </div>
              {!s.done && !s.blocked && <Link href={withReturn(s.href)} style={{ fontSize: 13, fontWeight: 600 }}>Start</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
