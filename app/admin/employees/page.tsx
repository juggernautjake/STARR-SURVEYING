// app/admin/employees/page.tsx — Employee list showing real registered users
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import type { UserRole } from '@/lib/auth';
// employee-pond Slice E1 — alternative viewer behind a view toggle.
import EmployeePond from './EmployeePond';
import '../styles/EmployeePond.css';

const VIEW_PREF_KEY = 'admin/employees/view';
type EmployeeView = 'list' | 'pond';

function readSavedView(): EmployeeView {
  if (typeof window === 'undefined') return 'list';
  const v = window.localStorage.getItem(VIEW_PREF_KEY);
  return v === 'pond' ? 'pond' : 'list';
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  researcher: 'Researcher',
  drawer: 'Drawer',
  field_crew: 'Field Crew',
  employee: 'Employee',
  guest: 'Guest',
  tech_support: 'Tech Support',
  equipment_manager: 'Equipment Manager',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#DC2626',
  developer: '#7C3AED',
  teacher: '#2563EB',
  student: '#059669',
  researcher: '#D97706',
  drawer: '#0891B2',
  field_crew: '#65A30D',
  employee: '#6B7280',
  guest: '#9CA3AF',
  tech_support: '#EA580C',
  equipment_manager: '#0D9488',
};

// Job title labels from the employee_profiles payroll table
const JOB_TITLE_LABELS: Record<string, string> = {
  rpls: 'RPLS', party_chief: 'Party Chief', sit: 'SIT',
  survey_technician: 'Survey Tech', survey_drafter: 'Drafter',
  rod_person: 'Rod Person', instrument_operator: 'Instrument Op',
  office_tech: 'Office Tech', admin: 'Admin', intern: 'Intern',
};

interface CompanyEmployee {
  // From registered_users
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  is_approved: boolean;
  is_banned: boolean;
  avatar_url: string | null;
  last_sign_in: string | null;
  created_at: string;
  // From employee_profiles (joined, may be null)
  job_title: string | null;
  hire_date: string | null;
  hourly_rate: number | null;
  is_active: boolean | null;
  salary_type: string | null;
}

export default function EmployeesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { reportPageError } = usePageError('EmployeesPage');

  const userRoles = (session?.user?.roles || []) as UserRole[];
  const isAdmin = userRoles.includes('admin');
  const isDev = userRoles.includes('developer');
  const isTechSupport = userRoles.includes('tech_support');
  const canView = isAdmin || isDev || isTechSupport;

  const [employees, setEmployees] = useState<CompanyEmployee[]>([]);
  // Slice E1 — list / pond view toggle, persisted in localStorage.
  const [view, setView] = useState<EmployeeView>('list');
  useEffect(() => {
    setView(readSavedView());
  }, []);
  const setViewAndPersist = useCallback((next: EmployeeView) => {
    setView(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_PREF_KEY, next);
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/employees/list');
      if (!res.ok) throw new Error('Failed to load employees');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load employees'));
    } finally {
      setLoading(false);
    }
  }, [reportPageError]);

  useEffect(() => { if (canView) loadEmployees(); }, [canView, loadEmployees]);

  if (!session?.user) return null;
  if (!canView) return null;

  const filtered = employees.filter(e => {
    // emp-search-prefix-2026-06-21 — user feedback: the old substring
    // .includes() filter kept everyone in the result set whenever the
    // typed letters appeared *anywhere* in the name / email / role
    // (e.g. typing "or" matched "Director" inside a role label).
    // Tighten to a prefix match on first name, last name, or email
    // so typing "ja" surfaces "Jacob …" / "… Jackson" /
    // "jacobmaddux@…" and nothing else. Empty search short-circuits
    // so we don't reject everyone when the box is empty.
    if (search) {
      const q = search.toLowerCase().trim();
      if (q) {
        const name = (e.name || '').toLowerCase();
        const email = e.email.toLowerCase();
        const parts = name.split(/\s+/).filter(Boolean);
        const firstName = parts[0] ?? '';
        const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
        const matches =
          firstName.startsWith(q) ||
          lastName.startsWith(q) ||
          email.startsWith(q);
        if (!matches) return false;
      }
    }
    if (roleFilter !== 'all' && !(e.roles || []).includes(roleFilter)) return false;
    if (statusFilter === 'active' && e.is_banned) return false;
    if (statusFilter === 'inactive' && !e.is_banned && e.is_active !== false) return false;
    return true;
  });

  // Collect all roles that exist across employees
  const allEmployeeRoles = [...new Set(employees.flatMap(e => e.roles))].sort();
  const activeCount = employees.filter(e => !e.is_banned && e.is_active !== false).length;
  const withProfileCount = employees.filter(e => e.job_title).length;

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <h2 className="jobs-page__title">Employees</h2>
          <span className="jobs-page__count">{employees.length} team members</span>
        </div>
        {/* Slice E1 — list / pond view toggle. */}
        <div
          className="employees-page__view-toggle"
          role="group"
          aria-label="Employee view"
          data-testid="employees-view-toggle"
        >
          {(['list', 'pond'] as EmployeeView[]).map((v) => (
            <button
              key={v}
              type="button"
              data-action={`view-${v}`}
              data-current={view === v ? 'true' : undefined}
              onClick={() => setViewAndPersist(v)}
            >
              {/* The internal value stays 'pond' so users on the
                  previous build don't lose their saved preference;
                  only the visible label flips per user feedback. */}
              {v === 'list' ? 'List' : 'Interactive'}
            </button>
          ))}
        </div>
      </div>

      {/* Slice E1 — pond view replaces the rest of the page when
          active; keeps the title + view toggle visible above it. */}
      {view === 'pond' ? (
        <EmployeePond
          employees={employees.map((e) => ({
            id: e.id,
            email: e.email,
            name: e.name,
            roles: e.roles,
            avatar_url: e.avatar_url,
            job_title: e.job_title,
            hire_date: e.hire_date,
          }))}
        />
      ) : (
      <>
      {/* Summary stats */}
      <div className="jobs-page__my-summary">
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{activeCount}</span>
          <span className="jobs-page__my-stat-label">Active</span>
        </div>
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{employees.length - activeCount}</span>
          <span className="jobs-page__my-stat-label">Inactive/Banned</span>
        </div>
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{withProfileCount}</span>
          <span className="jobs-page__my-stat-label">With Payroll Profile</span>
        </div>
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{allEmployeeRoles.length}</span>
          <span className="jobs-page__my-stat-label">Roles in Use</span>
        </div>
      </div>

      {/* Search and filter */}
      <div className="jobs-page__controls">
        <form className="jobs-page__search-form" onSubmit={e => e.preventDefault()}>
          <input
            className="jobs-page__search"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </form>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {/* Slice P5 — pin both selects to the 36px baseline shared
              by `.jobs-page__search` so the role/status filters sit
              flush with the search input next door instead of
              rendering ~2px taller from their default padding. */}
          <select
            className="job-form__select"
            style={{ width: 'auto', minWidth: '140px', height: 36, boxSizing: 'border-box' }}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
          >
            <option value="all">All Roles</option>
            {allEmployeeRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r as UserRole] || r}</option>)}
          </select>
          <select
            className="job-form__select"
            style={{ width: 'auto', minWidth: '120px', height: 36, boxSizing: 'border-box' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Employee grid */}
      {loading ? (
        <div className="tl-loading">Loading employees...</div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">&#x1F465;</span>
          <h3>No employees found</h3>
          <p>{search ? 'Try a different search term' : 'No company employees have signed in yet.'}</p>
        </div>
      ) : (
        // emp-list-refactor-2026-06-21 — was rendering inside
        // `.jobs-page__grid` + `.job-card` (jobs-page CSS hijacked
        // for employees) with inline styles fighting class styles,
        // a 28 px avatar, and inconsistent typography (0.65 / 0.68 /
        // 0.7 / 0.85 rem). Replaced with a purpose-built
        // `emp-list__*` BEM card: 44 px avatar, 3-region grid
        // (identity / meta / status+badges), single info line for
        // job title · rate · tenure, hover lift on clickable rows.
        // Styles live in the <style jsx> block at the bottom of
        // the file so this slice is fully self-contained.
        <div className="emp-list__grid">
          {filtered.map(emp => {
            const primaryRole = (emp.roles || []).find(r => r !== 'employee') || 'employee';
            const isActive = !emp.is_banned && emp.is_active !== false;
            const otherRoles = (emp.roles || []).filter(r => r !== 'employee' && r !== primaryRole);
            const displayName = emp.name || emp.email.split('@')[0];
            const initials = displayName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
            const clickable = isAdmin;

            const metaParts: string[] = [];
            if (emp.job_title) metaParts.push(JOB_TITLE_LABELS[emp.job_title] || emp.job_title);
            if (emp.hourly_rate != null) metaParts.push(`$${emp.hourly_rate.toFixed(2)}/hr`);
            if (emp.hire_date) {
              metaParts.push(`Since ${new Date(emp.hire_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`);
            } else if (emp.last_sign_in) {
              metaParts.push(`Last login ${new Date(emp.last_sign_in).toLocaleDateString()}`);
            }

            return (
              <div
                key={emp.id}
                className={`emp-list__card ${clickable ? 'emp-list__card--clickable' : ''} ${!isActive ? 'emp-list__card--inactive' : ''}`}
                onClick={() => {
                  if (!clickable) return;
                  if (emp.job_title) {
                    router.push(`/admin/employees/manage?email=${encodeURIComponent(emp.email)}`);
                  } else {
                    router.push(`/admin/users`);
                  }
                }}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!clickable) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    (e.currentTarget as HTMLDivElement).click();
                  }
                }}
              >
                <div className="emp-list__avatar" aria-hidden="true">
                  {emp.avatar_url ? (
                    <img src={emp.avatar_url} alt="" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div className="emp-list__identity">
                  <h3 className="emp-list__name">{displayName}</h3>
                  <p className="emp-list__email">{emp.email}</p>
                  {metaParts.length > 0 && (
                    <p className="emp-list__meta">
                      {metaParts.map((part, i) => (
                        <span key={i}>
                          {i > 0 && <span className="emp-list__meta-sep" aria-hidden="true">·</span>}
                          {part}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                <div className="emp-list__side">
                  <div className="emp-list__badges">
                    <span
                      className="emp-list__badge emp-list__badge--primary"
                      style={{ background: ROLE_COLORS[primaryRole] || '#6B7280' }}
                    >
                      {ROLE_LABELS[primaryRole as UserRole] || primaryRole}
                    </span>
                    {otherRoles.slice(0, 2).map(r => (
                      <span
                        key={r}
                        className="emp-list__badge emp-list__badge--ghost"
                        style={{
                          color: ROLE_COLORS[r] || '#6B7280',
                          borderColor: (ROLE_COLORS[r] || '#6B7280') + '40',
                          background: (ROLE_COLORS[r] || '#6B7280') + '10',
                        }}
                      >
                        {ROLE_LABELS[r as UserRole] || r}
                      </span>
                    ))}
                    {otherRoles.length > 2 && (
                      <span className="emp-list__badge emp-list__badge--ghost emp-list__badge--more">
                        +{otherRoles.length - 2}
                      </span>
                    )}
                  </div>
                  <span
                    className={`emp-list__status emp-list__status--${emp.is_banned ? 'banned' : isActive ? 'active' : 'inactive'}`}
                  >
                    <span className="emp-list__status-dot" aria-hidden="true" />
                    {emp.is_banned ? 'Banned' : isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      <style jsx>{`
        .emp-list__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 0.85rem;
        }
        .emp-list__card {
          display: grid;
          grid-template-columns: 44px 1fr auto;
          gap: 0.85rem;
          align-items: center;
          padding: 0.9rem 1rem;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
        }
        .emp-list__card--clickable {
          cursor: pointer;
        }
        .emp-list__card--clickable:hover {
          border-color: #1D3095;
          box-shadow: 0 1px 0 rgba(29, 48, 149, 0.06), 0 4px 14px -8px rgba(29, 48, 149, 0.25);
        }
        .emp-list__card--clickable:focus-visible {
          outline: 2px solid #1D3095;
          outline-offset: 2px;
        }
        .emp-list__card--clickable:active {
          transform: translateY(1px);
        }
        .emp-list__card--inactive {
          opacity: 0.7;
        }

        .emp-list__avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #F3F4F6;
          color: #4B5563;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          overflow: hidden;
          flex-shrink: 0;
        }
        .emp-list__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .emp-list__identity {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .emp-list__name {
          margin: 0;
          font-family: 'Sora', 'Inter', sans-serif;
          font-size: 0.98rem;
          font-weight: 600;
          color: #0F1419;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .emp-list__email {
          margin: 0;
          font-size: 0.8rem;
          color: #6B7280;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .emp-list__meta {
          margin: 0.2rem 0 0;
          font-size: 0.78rem;
          color: #4B5563;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .emp-list__meta-sep {
          margin: 0 0.4rem;
          color: #D1D5DB;
        }

        .emp-list__side {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.45rem;
          flex-shrink: 0;
        }

        .emp-list__badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          justify-content: flex-end;
        }
        .emp-list__badge {
          display: inline-flex;
          align-items: center;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          line-height: 1.2;
        }
        .emp-list__badge--primary {
          color: #FFFFFF;
        }
        .emp-list__badge--ghost {
          border: 1px solid currentColor;
        }
        .emp-list__badge--more {
          color: #6B7280;
          border-color: #E5E7EB;
          background: #F9FAFB;
        }

        .emp-list__status {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #6B7280;
        }
        .emp-list__status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .emp-list__status--active { color: #059669; }
        .emp-list__status--inactive { color: #9CA3AF; }
        .emp-list__status--banned { color: #DC2626; }

        @media (max-width: 640px) {
          .emp-list__card {
            grid-template-columns: 44px 1fr;
          }
          .emp-list__side {
            grid-column: 1 / -1;
            align-items: flex-start;
          }
          .emp-list__badges {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
