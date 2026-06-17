// app/admin/employees/manage/[email]/history/page.tsx
//
// employee-pond Slice E14 — admin "everything" page for one
// employee. Loads the activity-history feed, renders bonuses +
// current/past salary + payouts in tabs. Self-hosted view + admin
// view share the same component; the API gates what's returned, so
// the page just renders whatever lands in the response.
'use client';

import '../../../../styles/EmailCompose.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ACTIVITY_TABLES,
  currentSalaryRow,
  formatCents,
  sumBonusesSince,
  type EmployeeBonus,
  type EmployeePayout,
  type EmployeeSalaryHistoryRow,
} from '@/lib/employee-pond/activity-history';

interface HistoryPayload {
  target_email: string;
  viewer_sees_everything: boolean;
  bonuses: EmployeeBonus[];
  salary_history: EmployeeSalaryHistoryRow[];
  payouts: EmployeePayout[];
}

type Tab = 'overview' | 'bonuses' | 'salary' | 'payouts';

export default function EmployeeHistoryPage() {
  const params = useParams<{ email: string }>();
  const rawEmail = params?.email ?? '';
  const email = decodeURIComponent(Array.isArray(rawEmail) ? rawEmail[0] : rawEmail);

  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/admin/employees/${encodeURIComponent(email)}/history`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setError(body.error ?? `Server ${res.status}`);
          return;
        }
        const payload = (await res.json()) as HistoryPayload;
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const seesAll = data?.viewer_sees_everything ?? false;
  const ytdCutoff = `${new Date().getFullYear()}-01-01T00:00:00Z`;
  const ytdBonuses = data ? sumBonusesSince(data.bonuses, ytdCutoff) : 0;
  const current = data ? currentSalaryRow(data.salary_history) : null;

  return (
    <div className="email-compose" data-testid="employee-history-page">
      <header className="email-compose__header">
        <Link
          href={`/admin/employees/manage?email=${encodeURIComponent(email)}`}
          className="email-compose__back"
        >
          ← Back to profile
        </Link>
        <h1 className="email-compose__title">Activity history</h1>
      </header>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        Viewing <strong>{email}</strong>
        {seesAll ? '' : ' — limited view (privacy contract enforced).'}
      </p>

      {loading && <p data-testid="employee-history-loading">Loading…</p>}
      {error && (
        <p
          className="email-compose__status email-compose__status--error"
          role="alert"
          data-testid="employee-history-error"
        >
          {error}
        </p>
      )}

      {data && !loading && (
        <>
          <nav
            className="employee-history__tabs"
            role="tablist"
            aria-label="History sections"
            data-testid="employee-history-tabs"
            style={{ display: 'flex', gap: 'var(--space-2)' }}
          >
            {(['overview', 'bonuses', 'salary', 'payouts'] as Tab[]).map((t) => {
              const isAdminOnly = t === 'salary' || t === 'payouts';
              if (isAdminOnly && !seesAll) return null;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  data-testid={`employee-history-tab-${t}`}
                  data-current={tab === t ? 'true' : undefined}
                  onClick={() => setTab(t)}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: tab === t ? 'var(--color-brand-navy)' : 'transparent',
                    color:
                      tab === t
                        ? 'var(--color-text-on-brand)'
                        : 'var(--color-text-primary)',
                    border: '1px solid #E5E7EB',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    minHeight: 40,
                    fontWeight: 500,
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </nav>

          {tab === 'overview' && (
            <section data-testid="employee-history-overview">
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-2)' }}>
                Overview
              </h2>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
                <dt style={{ color: 'var(--color-text-tertiary)' }}>Bonuses (YTD)</dt>
                <dd style={{ margin: 0, fontWeight: 600 }} data-testid="overview-ytd-bonuses">
                  {data.bonuses.length === 0 && !seesAll
                    ? '— (privacy)'
                    : formatCents(ytdBonuses)}
                </dd>
                {seesAll && (
                  <>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>Current salary</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }} data-testid="overview-current-salary">
                      {current
                        ? current.base_annual_salary_cents != null
                          ? `${formatCents(current.base_annual_salary_cents)} / yr`
                          : `${formatCents(current.base_hourly_rate_cents)} / hr`
                        : '— (no records)'}
                    </dd>
                    <dt style={{ color: 'var(--color-text-tertiary)' }}>Recent payouts</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }} data-testid="overview-payout-count">
                      {data.payouts.length} on file
                    </dd>
                  </>
                )}
              </dl>
              {!seesAll && (
                <p
                  style={{
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--text-xs)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  Salary + payouts are admin-only. To see them, the viewer needs an
                  admin / developer / tech-support / equipment-manager role.
                </p>
              )}
            </section>
          )}

          {tab === 'bonuses' && (
            <section data-testid="employee-history-bonuses">
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-2)' }}>
                Bonuses
              </h2>
              {data.bonuses.length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)' }}>
                  No bonuses on file (or hidden by privacy settings).
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {data.bonuses.map((b) => (
                    <li
                      key={b.id}
                      data-testid="bonus-row"
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        padding: 'var(--space-2) 0',
                      }}
                    >
                      <strong>{formatCents(b.amount_cents)}</strong>
                      {' — '}
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {b.reason}
                      </span>
                      <span
                        style={{
                          color: 'var(--color-text-tertiary)',
                          fontSize: 'var(--text-xs)',
                          marginLeft: 'var(--space-2)',
                        }}
                      >
                        {new Date(b.awarded_at).toLocaleDateString()}
                        {b.awarded_by && ` — by ${b.awarded_by}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'salary' && seesAll && (
            <section data-testid="employee-history-salary">
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-2)' }}>
                Salary history
              </h2>
              {data.salary_history.length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)' }}>
                  No salary history rows on file for this employee.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {data.salary_history.map((s) => (
                    <li
                      key={s.id}
                      data-testid="salary-row"
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        padding: 'var(--space-2) 0',
                      }}
                    >
                      <strong>
                        {s.base_annual_salary_cents != null
                          ? `${formatCents(s.base_annual_salary_cents)} / yr`
                          : `${formatCents(s.base_hourly_rate_cents)} / hr`}
                      </strong>
                      <span
                        style={{
                          color: 'var(--color-text-tertiary)',
                          fontSize: 'var(--text-xs)',
                          marginLeft: 'var(--space-2)',
                        }}
                      >
                        From {new Date(s.effective_from).toLocaleDateString()}
                        {s.effective_to
                          ? ` to ${new Date(s.effective_to).toLocaleDateString()}`
                          : ' (current)'}
                        {s.change_reason && ` — ${s.change_reason}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'payouts' && seesAll && (
            <section data-testid="employee-history-payouts">
              <h2 style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-2)' }}>
                Payout history
              </h2>
              {data.payouts.length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)' }}>
                  No payouts recorded.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {data.payouts.map((p) => (
                    <li
                      key={p.id}
                      data-testid="payout-row"
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        padding: 'var(--space-2) 0',
                      }}
                    >
                      <strong>{formatCents(p.net_cents)}</strong>
                      <span
                        style={{
                          color: 'var(--color-text-secondary)',
                          marginLeft: 'var(--space-2)',
                        }}
                      >
                        (gross {formatCents(p.gross_cents)})
                      </span>
                      <span
                        style={{
                          color: 'var(--color-text-tertiary)',
                          fontSize: 'var(--text-xs)',
                          marginLeft: 'var(--space-2)',
                        }}
                      >
                        Paid {new Date(p.paid_at).toLocaleDateString()} via{' '}
                        {p.method.replace('_', ' ')}
                        {p.reference && ` — ref ${p.reference}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
        Tables read: {Object.values(ACTIVITY_TABLES).join(', ')}.
      </p>
    </div>
  );
}
