// app/admin/employees/page.tsx — Employee list (admin: manage, employee: view team)
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';

interface Employee {
  user_email: string;
  user_name: string;
  job_title: string;
  hire_date: string | null;
  hourly_rate: number;
  is_active: boolean;
  salary_type: string;
}

const ROLE_LABELS: Record<string, string> = {
  rpls: 'RPLS', party_chief: 'Party Chief', sit: 'SIT',
  survey_technician: 'Survey Tech', survey_drafter: 'Drafter',
  rod_person: 'Rod Person', instrument_operator: 'Instrument Op',
  office_tech: 'Office Tech', admin: 'Admin', intern: 'Intern',
};

export default function EmployeesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { safeFetch, reportPageError } = usePageError('EmployeesPage');
  const isAdmin = session?.user?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [showInactive]);

  async function loadEmployees() {
    try {
      setLoading(true);
      const url = `/api/admin/payroll/employees${showInactive ? '?include_inactive=true' : ''}`;
      const data = await safeFetch<{ employees: Employee[] }>(url);
      if (data?.employees) setEmployees(data.employees);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error('Failed to load employees'));
    } finally {
      setLoading(false);
    }
  }

  if (!session?.user) return null;

  // Admin-only page guard
  if (!isAdmin) return null;

  const filtered = employees.filter(e => {
    if (roleFilter !== 'all' && e.job_title !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.user_name?.toLowerCase().includes(q) && !e.user_email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const roles = [...new Set<string>(employees.map(e => e.job_title).filter(Boolean))].sort();
  const activeCount = employees.filter(e => e.is_active).length;

  return (
    <div className="jobs-page">
      <div className="jobs-page__header">
        <div className="jobs-page__header-left">
          <h2 className="jobs-page__title">Employees</h2>
          <span className="jobs-page__count">{employees.length} team members</span>
        </div>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#6B7280' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        )}
      </div>

      {/* Summary stats */}
      <div className="jobs-page__my-summary">
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{activeCount}</span>
          <span className="jobs-page__my-stat-label">Active</span>
        </div>
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{employees.length - activeCount}</span>
          <span className="jobs-page__my-stat-label">Inactive</span>
        </div>
        <div className="jobs-page__my-stat">
          <span className="jobs-page__my-stat-value">{roles.length}</span>
          <span className="jobs-page__my-stat-label">Roles</span>
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
        <select
          className="job-form__select"
          style={{ width: 'auto', minWidth: '160px' }}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
        </select>
      </div>

      {/* Employee list */}
      {loading ? (
        <div className="tl-loading">Loading employees...</div>
      ) : filtered.length === 0 ? (
        <div className="jobs-page__empty">
          <span className="jobs-page__empty-icon">👥</span>
          <h3>No employees found</h3>
          <p>{search ? 'Try a different search term' : 'No employee profiles have been created yet.'}</p>
        </div>
      ) : (
        <div className="jobs-page__grid">
          {filtered.map(emp => (
            <div
              key={emp.user_email}
              className="job-card"
              style={{ cursor: isAdmin ? 'pointer' : 'default' }}
              onClick={() => {
                if (isAdmin) router.push(`/admin/employees/manage?email=${encodeURIComponent(emp.user_email)}`);
              }}
            >
              <div className="job-card__header">
                <span className="job-card__stage" style={{ background: '#1D3095' }}>
                  {ROLE_LABELS[emp.job_title] || emp.job_title || '—'}
                </span>
                <span style={{ fontSize: '0.7rem', color: emp.is_active ? '#059669' : '#EF4444', fontWeight: 600 }}>
                  {emp.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="job-card__name">{emp.user_name || emp.user_email.split('@')[0]}</h3>
              <p className="job-card__client">{emp.user_email}</p>
              <div className="job-card__footer">
                <span>${emp.hourly_rate?.toFixed(2) || '0.00'}/hr</span>
                {emp.hire_date && <span>Since {new Date(emp.hire_date).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
