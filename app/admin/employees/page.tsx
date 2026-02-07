// app/admin/employees/page.tsx — Employee management (admin only)
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import UnderConstruction from '../components/messaging/UnderConstruction';

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  hire_date: string;
  status: string;
  certifications: string[];
  current_jobs: number;
}

const ROLES = [
  { key: 'rpls', label: 'Registered Professional Land Surveyor', abbr: 'RPLS' },
  { key: 'party_chief', label: 'Party Chief', abbr: 'PC' },
  { key: 'survey_technician', label: 'Survey Technician', abbr: 'ST' },
  { key: 'survey_drafter', label: 'Survey Drafter', abbr: 'SD' },
  { key: 'rod_person', label: 'Rod Person', abbr: 'RP' },
  { key: 'instrument_operator', label: 'Instrument Operator', abbr: 'IO' },
  { key: 'office_tech', label: 'Office Tech', abbr: 'OT' },
  { key: 'admin', label: 'Administrator', abbr: 'Admin' },
];

export default function EmployeesPage() {
  const { data: session } = useSession();
  const [employees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);

  if (!session?.user) return null;

  const filtered = employees.filter(e => {
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    if (search && !e.full_name.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <UnderConstruction
        feature="Employee Management"
        description="Manage your team members, roles, certifications, and availability. View workload distribution and employee performance metrics."
      />

      <div className="jobs-page">
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">Employees</h2>
            <span className="jobs-page__count">{employees.length} team members</span>
          </div>
          <button className="jobs-page__btn jobs-page__btn--primary" onClick={() => setShowAddForm(!showAddForm)}>
            + Add Employee
          </button>
        </div>

        {/* Summary stats */}
        <div className="jobs-page__my-summary">
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">{employees.filter(e => e.status === 'active').length}</span>
            <span className="jobs-page__my-stat-label">Active</span>
          </div>
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">{employees.filter(e => e.role === 'rpls').length}</span>
            <span className="jobs-page__my-stat-label">RPLS</span>
          </div>
          <div className="jobs-page__my-stat">
            <span className="jobs-page__my-stat-value">{employees.filter(e => e.current_jobs > 0).length}</span>
            <span className="jobs-page__my-stat-label">On Jobs</span>
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
            {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Add employee form */}
        {showAddForm && (
          <div className="job-form" style={{ marginBottom: '1.5rem' }}>
            <div className="job-form__section">
              <h3 className="job-form__section-title">Add Employee</h3>
              <div className="job-form__grid">
                <div className="job-form__field">
                  <label className="job-form__label">Full Name *</label>
                  <input className="job-form__input" placeholder="John Doe" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Email *</label>
                  <input className="job-form__input" type="email" placeholder="john@starr-surveying.com" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Phone</label>
                  <input className="job-form__input" type="tel" />
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Role</label>
                  <select className="job-form__select">
                    {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div className="job-form__field">
                  <label className="job-form__label">Hire Date</label>
                  <input className="job-form__input" type="date" />
                </div>
              </div>
              <div className="job-form__actions">
                <button className="job-form__cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button className="job-form__submit" disabled>Add Employee</button>
              </div>
            </div>
          </div>
        )}

        {/* Employee list */}
        {filtered.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">👥</span>
            <h3>No employees found</h3>
            <p>{search ? 'Try a different search term' : 'Add your first team member to get started.'}</p>
          </div>
        ) : (
          <div className="jobs-page__grid">
            {filtered.map(emp => (
              <div key={emp.id} className="job-card" style={{ cursor: 'pointer' }}>
                <div className="job-card__header">
                  <span className="job-card__stage" style={{ background: '#1D3095' }}>
                    {ROLES.find(r => r.key === emp.role)?.abbr || emp.role}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: emp.status === 'active' ? '#059669' : '#EF4444' }}>
                    {emp.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <h3 className="job-card__name">{emp.full_name}</h3>
                <p className="job-card__client">{emp.email}</p>
                {emp.phone && <p className="job-card__address">{emp.phone}</p>}
                <div className="job-card__footer">
                  <span>{emp.current_jobs} active jobs</span>
                  <span>{emp.certifications?.length || 0} certs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Employees — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>What Needs To Be Done</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Data Source:</strong> Employee data comes from <code>employee_profiles</code> table (already exists in payroll schema) — need to integrate with this page</li>
            <li><strong>API Route:</strong> Create <code>/api/admin/employees/route.ts</code> — list all employees, with role filter, job count aggregation</li>
            <li><strong>Employee Detail Page:</strong> Create <code>/admin/employees/[id]/page.tsx</code> with profile info, certifications, job history, time logs, pay history</li>
            <li><strong>Certifications:</strong> Track SIT, RPLS, LSLS certifications with expiry dates and renewal reminders</li>
            <li><strong>Availability Calendar:</strong> Show who is available on which days, PTO tracking</li>
            <li><strong>Workload View:</strong> Chart showing each employee's current job assignments and hours</li>
            <li><strong>Performance Metrics:</strong> Jobs completed, hours logged, field vs office ratio</li>
            <li><strong>Org Chart:</strong> Visual hierarchy of team structure</li>
            <li><strong>Emergency Contacts:</strong> Store and display emergency contact info</li>
            <li><strong>Equipment Assignment:</strong> Show which equipment is checked out by each employee</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Build the Employee Management page at /admin/employees/page.tsx.

CURRENT STATE: UI shell with role filter, search, add employee form (not connected), empty state. Uses existing job-form CSS classes.

EXISTING DATABASE: employee_profiles table already exists in payroll schema with:
- id, user_email, full_name, role, phone, emergency_contact, emergency_phone
- hire_date, license_number, license_state, license_expiry
- hourly_rate, overtime_rate, salary_type, pay_frequency
- status (active/inactive/terminated), created_at, updated_at

ALSO: employee_certifications table with certification tracking

NEXT STEPS:
1. Create /api/admin/employees/route.ts to fetch from employee_profiles with job count aggregation
2. Connect the page to load real employee data
3. Connect add employee form to API
4. Build employee detail page at /admin/employees/[id]/page.tsx
5. Add certification management with expiry tracking
6. Build workload distribution chart
7. Add availability/scheduling calendar
8. Add employee performance metrics dashboard
9. Build org chart visualization
10. Add equipment tracking per employee`}</pre>
        </div>
      </div>
    </>
  );
}
