// app/admin/jobs/[id]/JobPhaseScheduler.tsx
//
// job-calendar Slice C4 — per-job 3-phase scheduler. Daddy clicks
// "Schedule" on a job, picks day(s) for Research / Field Work /
// Drawing & Deliverables, and each pick lands on the org calendar
// at /admin/calendar.
//
// Reads existing `schedule_events` rows tied to this `job_id` and
// renders the already-scheduled phases. POSTs new phase events
// through the existing /api/admin/schedule endpoint (no new API
// needed — the endpoint already accepts `event_type` + `job_id`).
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PHASES,
  PHASE_TITLE_PREFIX,
  buildPhaseEventRowsForDays,
  validatePhaseDraft,
  type Phase,
} from '@/lib/calendar/phase-event';

interface ScheduleEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  job_id: string | null;
  assigned_to: string;
}

interface Props {
  jobId: string;
  jobName: string;
  jobAddress: string | null | undefined;
  /** Email of the user driving the page (default assignee for new
   *  phases). */
  selfEmail: string;
}

const PHASE_HINT: Record<Phase, string> = {
  research: 'Days for office research — deeds, plats, prior surveys.',
  field_work: 'Days the crew will be on site collecting data.',
  drawing_deliverables: 'Days for CAD, legal review, and delivery.',
};

function fmtLocalDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Chicago',
    });
  } catch {
    return iso;
  }
}

export default function JobPhaseScheduler({ jobId, jobName, jobAddress, selfEmail }: Props) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPhase, setSavingPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftDays, setDraftDays] = useState<Record<Phase, string>>({
    research: '',
    field_work: '',
    drawing_deliverables: '',
  });
  const [draftAssignees, setDraftAssignees] = useState<Record<Phase, string>>({
    research: selfEmail,
    field_work: selfEmail,
    drawing_deliverables: selfEmail,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Wide window — pull up to a year out so the panel shows every
      // phase already on the books for this job.
      const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const to = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/schedule?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = (await res.json()) as { events: ScheduleEvent[] };
      setEvents((data.events ?? []).filter((e) => e.job_id === jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventsByPhase = useMemo(() => {
    const out: Record<Phase, ScheduleEvent[]> = {
      research: [],
      field_work: [],
      drawing_deliverables: [],
    };
    for (const ev of events) {
      if ((PHASES as readonly string[]).includes(ev.event_type)) {
        out[ev.event_type as Phase].push(ev);
      }
    }
    for (const phase of PHASES) {
      out[phase].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return out;
  }, [events]);

  async function schedulePhase(phase: Phase) {
    setError(null);
    const rawDays = draftDays[phase];
    // Multiple days comma- or whitespace-separated.
    const dayIsoList = rawDays
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const assignee = draftAssignees[phase].trim();
    const err = validatePhaseDraft({
      jobId,
      jobName,
      phase,
      assignedTo: assignee,
      dayIsoList,
    });
    if (err) {
      setError(err);
      return;
    }
    setSavingPhase(phase);
    try {
      const rows = buildPhaseEventRowsForDays(
        { jobId, jobName, phase, assignedTo: assignee, location: jobAddress ?? null },
        dayIsoList,
      );
      for (const row of rows) {
        const res = await fetch('/api/admin/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(row),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          // Skip conflicts gracefully — keep going on the rest of
          // the days so the user doesn't lose work on a single bad
          // overlap.
          if (body.error === 'schedule_conflict') {
            console.warn(`[phase-scheduler] conflict on ${row.start_time} — skipping`);
            continue;
          }
          throw new Error(body.error ?? `Server ${res.status}`);
        }
      }
      setDraftDays((s) => ({ ...s, [phase]: '' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPhase(null);
    }
  }

  async function removeEvent(id: string) {
    if (!confirm('Remove this scheduled phase?')) return;
    try {
      const res = await fetch(`/api/admin/schedule?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="job-phase-scheduler" data-testid="job-phase-scheduler">
      <div className="job-phase-scheduler__intro">
        <h3>Schedule the three phases</h3>
        <p>
          Pick day(s) for each phase. Each pick lands on the{' '}
          <a href="/admin/calendar">org calendar</a> for everyone to see.
          Day-before + day-of reminders will fire to the assignee.
        </p>
      </div>
      {error && (
        <div className="job-phase-scheduler__error" role="alert" data-state="error">
          {error}
        </div>
      )}
      {PHASES.map((phase) => {
        const scheduled = eventsByPhase[phase];
        return (
          <section
            key={phase}
            className="job-phase-scheduler__section"
            data-phase={phase}
          >
            <header className="job-phase-scheduler__section-header">
              <h4>{PHASE_TITLE_PREFIX[phase]}</h4>
              <span className="job-phase-scheduler__hint">{PHASE_HINT[phase]}</span>
            </header>

            <div className="job-phase-scheduler__scheduled">
              {loading ? (
                <p data-state="loading">Loading…</p>
              ) : scheduled.length === 0 ? (
                <p data-state="empty" style={{ color: 'var(--color-text-tertiary)' }}>
                  Not yet scheduled.
                </p>
              ) : (
                <ul>
                  {scheduled.map((ev) => (
                    <li key={ev.id}>
                      <span>{fmtLocalDay(ev.start_time)}</span>
                      <span style={{ color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        → {ev.assigned_to}
                      </span>
                      <button
                        type="button"
                        data-action="remove-phase-event"
                        onClick={() => void removeEvent(ev.id)}
                        style={{ marginLeft: 8 }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="job-phase-scheduler__form">
              <label>
                Day(s) — YYYY-MM-DD, comma- or space-separated:
                <input
                  type="text"
                  data-testid={`phase-days-${phase}`}
                  value={draftDays[phase]}
                  placeholder="2026-06-20, 2026-06-21"
                  onChange={(e) => setDraftDays((s) => ({ ...s, [phase]: e.target.value }))}
                />
              </label>
              <label>
                Assignee email:
                <input
                  type="email"
                  data-testid={`phase-assignee-${phase}`}
                  value={draftAssignees[phase]}
                  onChange={(e) => setDraftAssignees((s) => ({ ...s, [phase]: e.target.value }))}
                />
              </label>
              <button
                type="button"
                data-action={`schedule-${phase}`}
                disabled={savingPhase === phase}
                onClick={() => void schedulePhase(phase)}
              >
                {savingPhase === phase ? 'Scheduling…' : `Schedule ${PHASE_TITLE_PREFIX[phase]}`}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
