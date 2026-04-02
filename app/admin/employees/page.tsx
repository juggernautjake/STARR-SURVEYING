// app/admin/employees/page.tsx — Employee list showing real registered users
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import type { UserRole } from '@/lib/auth';

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
};

const ROLE_COLORS: Record<string, string> = {
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
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
    if (search) {
      const q = search.toLowerCase();
      if (!e.name?.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== 'all' && !e.roles.includes(roleFilter as UserRole)) return false;
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
      </div>

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
          <select
            className="job-form__select"
            style={{ width: 'auto', minWidth: '140px' }}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            {allEmployeeRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r as UserRole] || r}</option>)}
          </select>
          <select
            className="job-form__select"
            style={{ width: 'auto', minWidth: '120px' }}
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
        <div className="jobs-page__grid">
          {filtered.map(emp => {
            const primaryRole = emp.roles.find(r => r !== 'employee') || 'employee';
            const isActive = !emp.is_banned && emp.is_active !== false;
            return (
              <div
                key={emp.id}
                className="job-card"
                style={{ cursor: isAdmin ? 'pointer' : 'default', opacity: isActive ? 1 : 0.7 }}
                onClick={() => {
                  if (isAdmin && emp.job_title) {
                    router.push(`/admin/employees/manage?email=${encodeURIComponent(emp.email)}`);
                  } else if (isAdmin) {
                    router.push(`/admin/users`);
                  }
                }}
              >
                <div className="job-card__header">
                  <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                    {emp.job_title && (
                      <span className="job-card__stage" style={{ background: '#1D3095', fontSize: '.68rem' }}>
                        {JOB_TITLE_LABELS[emp.job_title] || emp.job_title}
                      </span>
                    )}
                    <span className="job-card__stage" style={{ background: ROLE_COLORS[primaryRole] || '#6B7280', fontSize: '.68rem' }}>
                      {ROLE_LABELS[primaryRole as UserRole] || primaryRole}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: isActive ? '#059669' : '#EF4444', fontWeight: 600 }}>
                    {emp.is_banned ? 'Banned' : isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                  {emp.avatar_url ? (
                    <img src={emp.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: '#6B7280' }}>
                      {emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <h3 className="job-card__name" style={{ margin: 0 }}>{emp.name || emp.email.split('@')[0]}</h3>
                </div>
                <p className="job-card__client">{emp.email}</p>
                {/* Role badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginTop: '.25rem', marginBottom: '.5rem' }}>
                  {emp.roles.filter(r => r !== 'employee').map(r => (
                    <span key={r} style={{ fontSize: '.65rem', padding: '.1rem .35rem', borderRadius: '4px', background: (ROLE_COLORS[r] || '#6B7280') + '15', color: ROLE_COLORS[r] || '#6B7280', fontWeight: 600 }}>
                      {ROLE_LABELS[r as UserRole] || r}
                    </span>
                  ))}
                </div>
                <div className="job-card__footer">
                  {emp.hourly_rate != null ? <span>${emp.hourly_rate.toFixed(2)}/hr</span> : <span style={{ color: '#9CA3AF' }}>No payroll profile</span>}
                  {emp.hire_date && <span>Since {new Date(emp.hire_date).toLocaleDateString()}</span>}
                  {emp.last_sign_in && !emp.hire_date && <span>Last login: {new Date(emp.last_sign_in).toLocaleDateString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
