// app/admin/employees/page.tsx — Employee list showing real registered users
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
import type { UserRole } from '@/lib/auth';
import { matchesPersonPrefix } from '@/lib/admin/employee-search';
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
    // Prefix-match name/email (shared with the Interactive view) — typing
    // "e" must not surface "Audey". User request 2026-06-20.
    if (!matchesPersonPrefix(search, e.name || '', e.email)) return false;
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
      <div className="emp-list">
      {/* Summary stats */}
      <div className="emp-list__stats">
        <div className="emp-list__stat">
          <span className="emp-list__stat-value">{activeCount}</span>
          <span className="emp-list__stat-label">Active</span>
        </div>
        <div className="emp-list__stat">
          <span className="emp-list__stat-value">{employees.length - activeCount}</span>
          <span className="emp-list__stat-label">Inactive / Banned</span>
        </div>
        <div className="emp-list__stat">
          <span className="emp-list__stat-value">{withProfileCount}</span>
          <span className="emp-list__stat-label">With Payroll Profile</span>
        </div>
        <div className="emp-list__stat">
          <span className="emp-list__stat-value">{allEmployeeRoles.length}</span>
          <span className="emp-list__stat-label">Roles in Use</span>
        </div>
      </div>

      {/* Search and filter — uniform 36px control row */}
      <div className="emp-list__controls">
        <div className="emp-list__search">
          <Search size={16} strokeWidth={2} className="emp-list__search-icon" aria-hidden="true" />
          <input
            className="emp-list__search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search employees by name or email"
          />
        </div>
        <select
          className="emp-list__select"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
          aria-label="Filter by role"
          style={{ minWidth: '140px', height: 36, boxSizing: 'border-box' }}
        >
          <option value="all">All Roles</option>
          {allEmployeeRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r as UserRole] || r}</option>)}
        </select>
        <select
          className="emp-list__select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          aria-label="Filter by status"
          style={{ minWidth: '120px', height: 36, boxSizing: 'border-box' }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Employee grid */}
      {loading ? (
        <div className="emp-list__loading">Loading employees…</div>
      ) : filtered.length === 0 ? (
        <div className="emp-list__empty">
          <Users size={32} strokeWidth={1.5} className="emp-list__empty-icon" aria-hidden="true" />
          <h3>No employees found</h3>
          <p>{search || roleFilter !== 'all' || statusFilter !== 'all'
            ? 'Try a different search term or filter.'
            : 'No company employees have signed in yet.'}</p>
        </div>
      ) : (
        <div className="emp-list__grid">
          {filtered.map(emp => {
            const isActive = !emp.is_banned && emp.is_active !== false;
            const status = emp.is_banned ? 'banned' : isActive ? 'active' : 'inactive';
            const displayName = emp.name || emp.email.split('@')[0];
            const initials = displayName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
            const extraRoles = (emp.roles || []).filter(r => r !== 'employee');
            const clickable = isAdmin;
            const open = () => {
              if (!isAdmin) return;
              if (emp.job_title) router.push(`/admin/employees/manage?email=${encodeURIComponent(emp.email)}`);
              else router.push('/admin/users');
            };
            return (
              <div
                key={emp.id}
                className="emp-card"
                data-status={status}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? open : undefined}
                onKeyDown={clickable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }) : undefined}
              >
                <div className="emp-card__top">
                  {emp.avatar_url ? (
                    <img src={emp.avatar_url} alt="" className="emp-card__avatar" />
                  ) : (
                    <div className="emp-card__avatar emp-card__avatar--initials">{initials}</div>
                  )}
                  <div className="emp-card__id">
                    <h3 className="emp-card__name">{displayName}</h3>
                    <p className="emp-card__email" title={emp.email}>{emp.email}</p>
                  </div>
                  <span className={`emp-card__status emp-card__status--${status}`}>
                    {emp.is_banned ? 'Banned' : isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {(emp.job_title || extraRoles.length > 0) && (
                  <div className="emp-card__roles">
                    {emp.job_title && (
                      <span className="emp-card__title-chip">
                        {JOB_TITLE_LABELS[emp.job_title] || emp.job_title}
                      </span>
                    )}
                    {extraRoles.map(r => (
                      <span
                        key={r}
                        className="emp-card__role-chip"
                        style={{ background: (ROLE_COLORS[r] || '#6B7280') + '18', color: ROLE_COLORS[r] || '#6B7280' }}
                      >
                        {ROLE_LABELS[r as UserRole] || r}
                      </span>
                    ))}
                  </div>
                )}

                <div className="emp-card__meta">
                  {emp.hourly_rate != null
                    ? <span className="emp-card__rate">${emp.hourly_rate.toFixed(2)}/hr</span>
                    : <span className="emp-card__rate emp-card__rate--none">No payroll profile</span>}
                  {emp.hire_date
                    ? <span>Since {new Date(emp.hire_date).toLocaleDateString()}</span>
                    : emp.last_sign_in
                      ? <span>Last login {new Date(emp.last_sign_in).toLocaleDateString()}</span>
                      : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
