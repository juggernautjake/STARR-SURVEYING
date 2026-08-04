'use client';
// app/admin/components/SetupReturnBanner.tsx — the way back from a setup step.
//
// Owner, 2026-08-04: *"whenever I input the firm's details and hit save, there is no like, 'NEXT'
// button that will direct me to the next place I need to go to continue completing the required
// info."*
//
// The checklist sent people out and had no way to bring them back. Every step was a one-way trip
// that ended on a settings page with nothing to say anything followed it — so finishing one step
// looked identical to wandering into settings, and the only route onward was remembering the Hub
// existed.
//
// ── WHY A BANNER AND NOT A WIZARD ───────────────────────────────────────────────────────────────
//
// A wizard owns the page: it hides the parts of settings the step did not ask about, and it traps
// somebody who came to change one thing. These destinations are ordinary pages people reach
// normally, and they must stay that way — the banner appears only for `?setup=1`, which is set by
// the checklist and by nothing else.
//
// It states the step's own finish condition rather than a generic "done?" — the checklist knows what
// is still blank, and repeating it here means the answer is on the screen where the work happens.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import type { OnboardingState } from '@/lib/saas/onboarding';

export default function SetupReturnBanner() {
  const [fromSetup, setFromSetup] = useState(false);
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== '1') return;
    setFromSetup(true);
    // Fetched fresh each time, so a save made on this page is reflected the moment the banner
    // re-reads it — the whole complaint was a step that stayed "not done" after being done.
    void fetch('/api/admin/onboarding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setState(j?.state ?? null))
      .catch(() => { /* the banner is a convenience; its absence is not an error */ });
  }, []);

  if (!fromSetup) return null;

  const next = state?.next ?? null;
  const done = state?.ready === true;

  return (
    <div
      role="status"
      style={{
        border: '1px solid var(--color-info-text)', background: 'var(--color-info-surface)',
        borderRadius: 10, padding: '12px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}
    >
      <ListChecks size={18} aria-hidden style={{ color: 'var(--color-info-text)' }} />
      <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
        {done ? (
          <><strong>That is everything essential.</strong> The setup card will not appear again.</>
        ) : next ? (
          <>
            <strong>Setting up.</strong> When you have saved here, the next step is{' '}
            <strong>{next.title}</strong>
            {next.missing.length > 0 && <> — it needs {next.missing.join(' · ')}</>}.
          </>
        ) : (
          <><strong>Setting up.</strong> Save your changes, then head back to the checklist.</>
        )}
      </div>
      {/* Two ways on, because they answer different questions: "what's next" and "how am I doing".
          A single button forces a guess about which one the reader wanted. */}
      {!done && next && (
        <Link
          href={`${next.href}${next.href.includes('?') ? '&' : '?'}setup=1`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            background: 'var(--color-info-text)', color: 'var(--color-bg-card)',
            padding: '8px 14px', borderRadius: 8, textDecoration: 'none', minHeight: 40,
          }}
        >
          Next: {next.title} <ArrowRight size={14} aria-hidden />
        </Link>
      )}
      <Link href="/admin/me" style={{ fontSize: 13, fontWeight: 600, minHeight: 40, display: 'inline-flex', alignItems: 'center' }}>
        Back to the checklist
      </Link>
    </div>
  );
}
