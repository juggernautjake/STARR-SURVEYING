'use client';

// app/admin/settings/HoursNotificationSetting.tsx
//
// H-12 of HOURS_TO_PAYOUT_2026-08-05.
//
// Hours-submitted notifications go to everyone who can decide hours. The firm has five such people,
// so one crew member logging a Tuesday produces five bells — and a stream somebody has learned to
// ignore stops working for the one person who did want it.
//
// This is the opt-out. It renders NOTHING for somebody the setting does not apply to: a toggle that
// changes nothing is worse than no toggle, because it teaches people the settings page lies.

import { useCallback, useEffect, useState } from 'react';

interface Pref {
  applies: boolean;
  notify_on_submit: boolean;
  isDefault: boolean;
}

export default function HoursNotificationSetting() {
  const [pref, setPref] = useState<Pref | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/me/hours-notifications');
      if (res.ok) setPref(await res.json());
    } catch {
      // Silent: a settings panel that fails to load is better absent than shown as "off", which
      // would read as a choice the person never made.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/me/hours-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_on_submit: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not save that.');
        return;
      }
      setPref((p) => (p ? { ...p, notify_on_submit: next, isDefault: false } : p));
    } finally {
      setSaving(false);
    }
  }, []);

  // Not an approver: the setting genuinely does not apply, so it is not shown.
  if (!pref?.applies) return null;

  return (
    <div className="job-detail__section" style={{ marginTop: '1rem' }}>
      <h3>Hours submitted</h3>
      <p className="job-detail__section-desc">
        You can approve hours, so you are told when somebody submits or updates them. The
        notification carries the hours, what they are worth, and a link straight to that person&rsquo;s
        entries.
      </p>

      {error && <div className="tl-pay-error">{error}</div>}

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <input
          type="checkbox"
          checked={pref.notify_on_submit}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          Notify me when hours are submitted
          {/* Said out loud. An unchecked-looking default would read as "you opted out". */}
          {pref.isDefault && <em style={{ opacity: 0.7 }}> — currently the default</em>}
        </span>
      </label>

      {!pref.notify_on_submit && (
        <p className="job-detail__section-desc" style={{ marginTop: '0.5rem' }}>
          You will not be told when hours arrive. They still appear on Hours Approval, and somebody
          still has to decide them.
        </p>
      )}
    </div>
  );
}
