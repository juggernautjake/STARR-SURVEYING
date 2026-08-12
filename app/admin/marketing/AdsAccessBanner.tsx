'use client';
// app/admin/marketing/AdsAccessBanner.tsx — says whether the ad numbers are live. A6.
//
// Owner: *"I think we should be google ad basic verified or whatever it is. Please check."*
//
// ── IT ANSWERS THE QUESTION IN THE PLACE THE QUESTION IS ASKED ──────────────────────────────────
//
// The answer lives in Google's console, not in this codebase, so it is probed on demand (see
// `lib/integrations/google-ads/access-level.ts`). Putting it on the advertising page rather than in
// a settings screen is the point: every figure below this line is only as live as this line says it
// is, and a dashboard showing manually-typed spend while implying it came from Google is worse than
// one that admits the connection is not up.
//
// It renders NOTHING while checking and nothing when everything works. A green "all good" banner on
// a page somebody visits daily is furniture within a week — the states worth interrupting for are
// the ones with an action attached.

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PlugZap } from 'lucide-react';

interface AccessReport {
  state: 'working' | 'test-access-only' | 'token-not-configured' | 'not-connected' | 'wrong-customer' | 'unknown';
  summary: string;
  action: string;
  raw?: string;
}

export default function AdsAccessBanner(): React.ReactElement | null {
  const [report, setReport] = useState<AccessReport | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/marketing/access-check');
        if (!res.ok) return; // a non-admin or a transient failure: stay silent rather than alarm
        const data = (await res.json()) as AccessReport;
        if (!cancelled) setReport(data);
      } catch {
        /* the banner is context, never the point of the page */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <p className="mkt-access mkt-access--quiet">
        <Loader2 size={13} className="mkt-access__spin" aria-hidden /> Checking the Google Ads
        connection…
      </p>
    );
  }
  if (!report || report.state === 'working') return null;

  const isNotConnected = report.state === 'not-connected' || report.state === 'token-not-configured';

  return (
    <div className={`mkt-access mkt-access--${report.state}`} role="note">
      <strong className="mkt-access__head">
        {isNotConnected ? <PlugZap size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}
        {report.state === 'test-access-only'
          ? 'Not Basic-access approved yet'
          : isNotConnected
            ? 'Google Ads is not connected'
            : 'The Google Ads connection is not working'}
      </strong>
      <span className="mkt-access__body">{report.summary}</span>
      {report.action ? <span className="mkt-access__action">{report.action}</span> : null}
      {report.raw ? (
        // Google's own words, collapsed. A classifier that hides the raw error is impossible to
        // debug on the day it guesses wrong.
        <details className="mkt-access__raw">
          <summary>What Google said</summary>
          <code>{report.raw}</code>
        </details>
      ) : null}
    </div>
  );
}
