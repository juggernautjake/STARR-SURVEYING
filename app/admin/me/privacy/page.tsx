// app/admin/me/privacy/page.tsx
//
// employee-pond Slice E12b — per-user privacy settings UI. Lets a
// signed-in user flip which fields are visible to non-admin co-
// workers on the new pond viewer + every future surface that
// consumes `filterEmployeeView`.
'use client';

import '../../styles/EmailCompose.css';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  DEFAULT_EMPLOYEE_PRIVACY,
  type EmployeePrivacy,
} from '@/lib/employee-pond/visibility';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Field {
  key: keyof EmployeePrivacy;
  label: string;
  hint: string;
}

interface Group {
  title: string;
  fields: Field[];
}

const GROUPS: Group[] = [
  {
    title: 'Contact',
    fields: [
      { key: 'show_full_name_to_employees', label: 'Show my full name', hint: 'Otherwise co-workers see "Employee" on the pond.' },
      { key: 'show_email_to_employees', label: 'Show my email', hint: 'Email is always shown to admins.' },
      { key: 'show_phone_to_employees', label: 'Show my phone', hint: 'Field crews + dispatchers might call you.' },
    ],
  },
  {
    title: 'Personal',
    fields: [
      { key: 'show_dob_to_employees', label: 'Show my date of birth', hint: 'Off by default. Admins can always see it.' },
      { key: 'show_gender_to_employees', label: 'Show my gender', hint: 'Off by default.' },
      { key: 'show_address_to_employees', label: 'Show my address', hint: 'Off by default.' },
    ],
  },
  {
    title: 'Employment',
    fields: [
      { key: 'show_hire_date_to_employees', label: 'Show my hire date', hint: 'Helps team-mates see seniority.' },
      { key: 'show_job_title_to_employees', label: 'Show my job title', hint: 'Surveyor, Drawer, etc.' },
      { key: 'show_employment_type_to_employees', label: 'Show my employment type', hint: 'Full time / part time.' },
    ],
  },
  {
    title: 'Activity',
    fields: [
      { key: 'show_photos_to_employees', label: 'Show my profile photo + job photos', hint: 'Used for your pond orb avatar.' },
      { key: 'show_jobs_history_to_employees', label: 'Show my past job assignments', hint: 'Which jobs you\'ve been on, no internals.' },
      { key: 'show_hours_to_employees', label: 'Show my recent hours', hint: 'Off by default — pay-adjacent data.' },
      { key: 'show_bonuses_to_employees', label: 'Show my bonuses received', hint: 'Off by default — admins always see this.' },
    ],
  },
];

export default function PrivacySettingsPage() {
  const { data: session, status } = useSession();
  const [privacy, setPrivacy] = useState<EmployeePrivacy>(DEFAULT_EMPLOYEE_PRIVACY);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/employees/privacy', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { privacy: EmployeePrivacy };
        if (cancelled) return;
        setPrivacy(data.privacy);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggle = useCallback((key: keyof EmployeePrivacy) => {
    setPrivacy((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/employees/privacy', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(privacy),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error ?? `Server ${res.status}`);
        setSaveState('error');
        return;
      }
      setSaveState('saved');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setSaveState('error');
    }
  }, [privacy]);

  if (status === 'loading') return null;
  if (!session?.user) return null;

  return (
    <div className="email-compose" data-testid="privacy-settings-page">
      <header className="email-compose__header">
        <Link href="/admin/me" className="email-compose__back">
          ← Hub
        </Link>
        <h1 className="email-compose__title">Privacy</h1>
      </header>

      <p
        style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}
      >
        These toggles control what non-admin co-workers can see about you on
        the new employee pond. <strong>Admins</strong> (and the developer /
        tech-support / equipment-manager roles) can always see every field,
        and salary + payout history are <strong>never</strong> shown to
        non-admins regardless of these toggles.
      </p>

      {!loaded && <p data-testid="privacy-loading">Loading current settings…</p>}

      {loaded && (
        <form
          className="email-compose__form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          data-testid="privacy-form"
        >
          {GROUPS.map((group) => (
            <section key={group.title} data-testid={`privacy-group-${group.title.toLowerCase()}`}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{group.title}</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
                {group.fields.map((f) => (
                  <li
                    key={f.key}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      padding: '8px 0',
                      borderBottom: '1px solid #F3F4F6',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={privacy[f.key]}
                      onChange={() => toggle(f.key)}
                      data-testid={`privacy-toggle-${f.key}`}
                      style={{ width: 22, height: 22, accentColor: 'var(--color-brand-navy)' }}
                    />
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                        {f.label}
                      </strong>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {f.hint}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {saveState === 'saved' && (
            <p
              className="email-compose__status email-compose__status--success"
              role="status"
              data-testid="privacy-save-success"
            >
              ✓ Saved.
            </p>
          )}
          {saveState === 'error' && (
            <p
              className="email-compose__status email-compose__status--error"
              role="alert"
              data-testid="privacy-save-error"
            >
              {errorMsg || 'Failed to save.'}
            </p>
          )}

          <div className="email-compose__actions">
            <button
              type="submit"
              className="email-compose__send"
              data-testid="privacy-save"
              disabled={saveState === 'saving'}
            >
              {saveState === 'saving' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
