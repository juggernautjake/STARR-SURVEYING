// app/admin/settings/JobNotificationSettings.tsx — slice N4 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// ── WHY THIS SHIPS WITH N3 AND NOT AFTER IT ─────────────────────────────────────────────────────
//
// N3 turned twelve silent job mutations into twelve notified ones, which is what the owner asked
// for. On a busy job that is a phone buzzing all afternoon, and a phone that buzzes all afternoon
// gets muted — taking the one notification that mattered with it.
//
// So the page is arranged around the actual choice, which is not "on or off". It is **now** vs
// **in one message at the end of the day**. Both are "you are told"; only `off` loses anything, and
// it is deliberately the least prominent of the three.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Clock, BellOff, Loader2, Check } from 'lucide-react';

type Channel = 'immediate' | 'digest' | 'off';

interface Loaded {
  channels: Record<string, Channel>;
  digestHour: number;
  explicit: string[];
}

/** The events, in the order somebody thinks about them: what changes my day, then the record of
 *  work. Each label says what happened in the words the notification itself uses. */
const EVENTS: { kind: string; label: string; hint: string }[] = [
  { kind: 'stage_changed', label: 'The job moves to a new stage', hint: 'Research → field work → drawing → delivery.' },
  { kind: 'schedule_changed', label: 'A day is scheduled or moved', hint: 'The one that gets somebody to the wrong site on the wrong day.' },
  { kind: 'briefing_published', label: 'A briefing is posted', hint: 'The recording and notes that go through the whole job.' },
  { kind: 'instructions_changed', label: 'The crew instructions change', hint: 'What Work Mode shows on the truck.' },
  { kind: 'team_changed', label: 'Somebody joins or leaves the crew', hint: 'Including who the crew lead is.' },
  { kind: 'deliverable_sealed', label: 'A deliverable is sealed', hint: 'A licensed surveyor has taken responsibility for it.' },
  { kind: 'deliverable_issued', label: 'A deliverable is issued', hint: 'It went to the client.' },
  { kind: 'payment_recorded', label: 'Money is received or refunded', hint: 'And what is still outstanding.' },
  { kind: 'deliverable_created', label: 'A deliverable is added', hint: 'Before it is sealed or issued.' },
  { kind: 'file_uploaded', label: 'A file is added', hint: 'Drawings, documents, field data.' },
  { kind: 'photo_uploaded', label: 'A photo is added', hint: 'Corners, monuments, site conditions.' },
  { kind: 'briefing_appended', label: 'Something is added to a posted briefing', hint: 'The quieter follow-up to a briefing you have already been told about.' },
  { kind: 'receipt_linked', label: 'An expense is linked to the job', hint: 'Fuel, materials, plotting.' },
];

const CHOICES: { value: Channel; label: string; Icon: typeof Bell }[] = [
  { value: 'immediate', label: 'Right away', Icon: Bell },
  { value: 'digest', label: 'Daily summary', Icon: Clock },
  { value: 'off', label: 'Never', Icon: BellOff },
];

export default function JobNotificationSettings() {
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/me/job-notifications');
      const json = (await res.json()) as Loaded & { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not load your settings (HTTP ${res.status}).`);
      setState(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: { channels?: Record<string, Channel>; digestHour?: number }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/me/job-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as Loaded & { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not save (HTTP ${res.status}).`);
      setState(json);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Re-read rather than leaving the optimistic value on screen: a switch that shows a setting
      // the server rejected is the worst possible state for this particular page.
      await load();
    } finally {
      setSaving(false);
    }
  };

  const setChannel = (kind: string, value: Channel) => {
    setState((s) => (s ? { ...s, channels: { ...s.channels, [kind]: value } } : s));
    void save({ channels: { [kind]: value } });
  };

  if (!state && error) return <p className="admin-error" role="alert">{error}</p>;
  if (!state) return <p style={muted}>Loading your notification settings…</p>;

  const offCount = EVENTS.filter((e) => state.channels[e.kind] === 'off').length;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.95rem' }}>Jobs you are on</h4>
      <p className="job-detail__section-desc" style={{ marginTop: 0 }}>
        When something happens on a job you are assigned to, how would you like to hear about it?
        “Daily summary” still tells you everything — it arrives once, in one message, with a link
        per line.
      </p>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <div style={{ marginTop: '0.9rem' }}>
        {EVENTS.map((ev) => {
          const value = state.channels[ev.kind] ?? 'immediate';
          return (
            <div key={ev.kind} style={rowStyle}>
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <div style={{ fontSize: '0.87rem', fontWeight: 500 }}>{ev.label}</div>
                <div style={{ ...muted, marginTop: 2 }}>{ev.hint}</div>
              </div>
              <div role="group" aria-label={ev.label} style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
                {CHOICES.map((c, i) => {
                  const on = value === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      disabled={saving}
                      aria-pressed={on}
                      onClick={() => setChannel(ev.kind, c.value)}
                      title={c.label}
                      style={segStyle(on, i === 0, i === CHOICES.length - 1, c.value === 'off')}
                    >
                      <c.Icon size={12} />
                      <span style={{ marginLeft: '0.25rem' }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...rowStyle, borderBottom: 'none', marginTop: '0.6rem' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: '0.87rem', fontWeight: 500 }}>Send my daily summary at</div>
          <div style={{ ...muted, marginTop: 2 }}>Central time. Everything set to “daily summary” arrives then.</div>
        </div>
        <select
          value={state.digestHour}
          disabled={saving}
          aria-label="Daily summary hour"
          onChange={(e) => {
            const hour = Number(e.target.value);
            setState((s) => (s ? { ...s, digestHour: hour } : s));
            void save({ digestHour: hour });
          }}
          style={selectStyle}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{hourLabel(h)}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
        {saving && <span style={muted}><Loader2 size={12} className="spin" /> Saving…</span>}
        {!saving && savedAt && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-success-text)' }}>
            <Check size={12} style={{ verticalAlign: '-2px' }} /> Saved
          </span>
        )}
        {/* Said out loud, because "never" is the one choice that loses information and the person
            who set four of them in March will not remember in June. */}
        {offCount > 0 && (
          <span style={muted}>
            {offCount} of these {offCount === 1 ? 'is' : 'are'} set to never — you will not hear about
            {offCount === 1 ? ' it' : ' them'} at all, on any job.
          </span>
        )}
      </div>
    </div>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h}:00 am` : `${h - 12}:00 pm`;
}

const rowStyle: React.CSSProperties = {
  display: 'flex', gap: '0.8rem', alignItems: 'center', justifyContent: 'space-between',
  flexWrap: 'wrap', padding: '0.55rem 0', borderBottom: '1px solid var(--color-border)',
};
const muted: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--color-text-tertiary)', lineHeight: 1.45 };
const selectStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
  fontSize: '0.82rem', fontFamily: 'inherit',
};

/** A segmented control. `off` gets a warning tint when selected rather than the brand colour —
 *  choosing to hear nothing should not look like the approved answer. */
function segStyle(on: boolean, first: boolean, last: boolean, isOff: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    border: '1px solid var(--color-border)',
    borderRightWidth: last ? 1 : 0,
    borderRadius: first ? '6px 0 0 6px' : last ? '0 6px 6px 0' : 0,
    padding: '0.3rem 0.6rem', fontSize: '0.76rem', cursor: 'pointer',
    fontWeight: on ? 600 : 400,
    background: on ? (isOff ? 'var(--color-warning-surface)' : 'var(--color-brand-navy)') : 'var(--color-surface)',
    color: on ? (isOff ? 'var(--color-warning-text)' : 'var(--color-text-on-brand)') : 'var(--color-text-secondary)',
  };
}
