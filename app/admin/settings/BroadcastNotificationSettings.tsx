'use client';

// app/admin/settings/BroadcastNotificationSettings.tsx
//
// WHICH OF THE FIRM-WIDE NOTIFICATIONS YOU WANT
// ═════════════════════════════════════════════
//
// Most notifications are about you — an assignment, a decision on your hours — and there is nothing
// to choose. These are the other kind: a customer phoned, a query arrived, gear did not come back.
// Everyone who can act on one of those gets it, which is right, and some of them will not want
// every one, which is also right.
//
// It renders NOTHING when no kind applies to your roles. The same rule `HoursNotificationSetting`
// states next to it: a toggle that changes nothing is worse than no toggle, because it teaches
// people the settings page lies. `hours.submitted` is deliberately absent here — it has its own
// panel, and two switches for one setting is worse than one.

import { useCallback, useEffect, useState } from 'react';

interface Kind {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export default function BroadcastNotificationSettings() {
  const [kinds, setKinds] = useState<Kind[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/me/notifications');
      if (res.ok) setKinds(((await res.json()) as { kinds: Kind[] }).kinds);
    } catch {
      // Silent, and the panel stays hidden. Rendering it as a set of OFF switches would show the
      // person a choice they never made.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (id: string, next: boolean) => {
    setSaving(id);
    setError(null);
    // Moved immediately and put back on failure: a checkbox that waits on the network feels broken.
    setKinds((ks) => ks?.map((k) => (k.id === id ? { ...k, enabled: next } : k)) ?? ks);
    try {
      const res = await fetch('/api/admin/me/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: id, enabled: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Could not save that.');
        setKinds((ks) => ks?.map((k) => (k.id === id ? { ...k, enabled: !next } : k)) ?? ks);
      }
    } catch {
      setError('Could not save that.');
      setKinds((ks) => ks?.map((k) => (k.id === id ? { ...k, enabled: !next } : k)) ?? ks);
    } finally {
      setSaving(null);
    }
  }, []);

  if (!kinds?.length) return null;

  return (
    <div className="job-detail__section" style={{ marginTop: '1rem' }}>
      <h3>Firm-wide notifications</h3>
      <p className="job-detail__section-desc">
        These are the ones that are not about you personally. Everyone who can act on them is told;
        turn off any you would rather not hear about. Turning one off changes nothing for anybody
        else, and the work still appears on its own page.
      </p>

      {error && <div className="tl-pay-error">{error}</div>}

      {kinds.map((k) => (
        <label key={k.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.7rem' }}>
          <input
            type="checkbox"
            id={`notif-${k.id}`}
            checked={k.enabled}
            disabled={saving === k.id}
            onChange={(e) => void toggle(k.id, e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            <strong>{k.label}</strong>
            <br />
            <span style={{ opacity: 0.75, fontSize: '0.9em' }}>{k.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
