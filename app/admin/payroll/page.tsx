// app/admin/payroll/page.tsx — Admin Payroll Dashboard
'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UnderConstruction from '../components/messaging/UnderConstruction';
import EmployeePayCard from '../components/payroll/EmployeePayCard';
import PayRateTable from '../components/payroll/PayRateTable';
import PayrollRunPanel from '../components/payroll/PayrollRunPanel';
import { JOB_TITLES, formatCurrency } from '../components/payroll/PayrollConstants';

interface Employee {
  id: string;
  user_email: string;
  user_name: string;
  job_title: string;
  hourly_rate: number;
  salary_type: string;
  annual_salary: number | null;
  pay_frequency: string;
  hire_date: string | null;
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
  is_active: boolean;
}

export default function PayrollPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'rates' | 'payroll'>('overview');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    user_email: '',
    user_name: '',
    job_title: 'survey_technician',
    hourly_rate: '18.00',
    salary_type: 'hourly',
    hire_date: '',
  });

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      router.push('/admin/my-pay');
      return;
    }
    loadEmployees();
  }, [isAdmin]);

  async function loadEmployees() {
    try {
      const res = await fetch('/api/admin/payroll/employees?include_inactive=true');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: addForm.user_email,
          user_name: addForm.user_name,
          job_title: addForm.job_title,
          hourly_rate: parseFloat(addForm.hourly_rate),
          salary_type: addForm.salary_type,
          hire_date: addForm.hire_date || null,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setAddForm({ user_email: '', user_name: '', job_title: 'survey_technician', hourly_rate: '18.00', salary_type: 'hourly', hire_date: '' });
        loadEmployees();
      }
    } catch { /* ignore */ }
  }

  const filteredEmployees = employees.filter(emp =>
    !search || emp.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    emp.user_email.toLowerCase().includes(search.toLowerCase()) ||
    emp.job_title.toLowerCase().includes(search.toLowerCase())
  );

  const activeEmployees = filteredEmployees.filter(e => e.is_active);
  const inactiveEmployees = filteredEmployees.filter(e => !e.is_active);

  // Summary stats
  const totalPayroll = employees.filter(e => e.is_active).reduce((s, e) => s + e.available_balance, 0);
  const avgRate = employees.filter(e => e.is_active).length > 0
    ? employees.filter(e => e.is_active).reduce((s, e) => s + e.hourly_rate, 0) / employees.filter(e => e.is_active).length
    : 0;
  const totalEarned = employees.reduce((s, e) => s + e.total_earned, 0);

  if (!isAdmin) return null;

  return (
    <div className="payroll-page">
      <UnderConstruction feature="Payroll & Finances" description="Manage employee pay, certifications, payroll runs, and balance transfers." />

      {/* Summary Cards */}
      <div className="payroll-summary-cards">
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon">👥</div>
          <div className="payroll-summary-card__value">{employees.filter(e => e.is_active).length}</div>
          <div className="payroll-summary-card__label">Active Employees</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon">💰</div>
          <div className="payroll-summary-card__value">{formatCurrency(totalPayroll)}</div>
          <div className="payroll-summary-card__label">Outstanding Balances</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon">📊</div>
          <div className="payroll-summary-card__value">{formatCurrency(avgRate)}/hr</div>
          <div className="payroll-summary-card__label">Avg Hourly Rate</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon">💵</div>
          <div className="payroll-summary-card__value">{formatCurrency(totalEarned)}</div>
          <div className="payroll-summary-card__label">Total Paid Out</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="payroll-tabs">
        <button className={`payroll-tabs__btn ${activeTab === 'overview' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'employees' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('employees')}>
          Employees ({employees.filter(e => e.is_active).length})
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'rates' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('rates')}>
          Pay Rates
        </button>
        <button className={`payroll-tabs__btn ${activeTab === 'payroll' ? 'payroll-tabs__btn--active' : ''}`} onClick={() => setActiveTab('payroll')}>
          Payroll Runs
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="payroll-overview">
          <div className="payroll-overview__section">
            <h3>Employees by Position</h3>
            <div className="payroll-overview__position-grid">
              {Object.entries(JOB_TITLES).map(([key, info]) => {
                const count = employees.filter(e => e.is_active && e.job_title === key).length;
                return (
                  <div key={key} className="payroll-overview__position-card">
                    <div className="payroll-overview__position-icon">{info.icon}</div>
                    <div className="payroll-overview__position-name">{info.label}</div>
                    <div className="payroll-overview__position-count">{count} employee{count !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="payroll-overview__section">
            <h3>Quick Actions</h3>
            <div className="payroll-overview__actions-grid">
              <button className="payroll-overview__action-card" onClick={() => setActiveTab('payroll')}>
                <span className="payroll-overview__action-icon">🏃</span>
                <span className="payroll-overview__action-label">Run Payroll</span>
              </button>
              <button className="payroll-overview__action-card" onClick={() => { setActiveTab('employees'); setShowAddForm(true); }}>
                <span className="payroll-overview__action-icon">➕</span>
                <span className="payroll-overview__action-label">Add Employee</span>
              </button>
              <button className="payroll-overview__action-card" onClick={() => setActiveTab('rates')}>
                <span className="payroll-overview__action-icon">📈</span>
                <span className="payroll-overview__action-label">Manage Rates</span>
              </button>
            </div>
          </div>

          <div className="payroll-overview__section">
            <h3>Recent Employees</h3>
            <div className="payroll-emp-grid">
              {employees.filter(e => e.is_active).slice(0, 6).map(emp => (
                <EmployeePayCard
                  key={emp.id}
                  employee={emp}
                  compact
                  onSelect={email => router.push(`/admin/payroll/${encodeURIComponent(email)}`)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="payroll-employees">
          <div className="payroll-employees__toolbar">
            <input
              className="payroll-search"
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="payroll-btn payroll-btn--primary" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : 'Add Employee'}
            </button>
          </div>

          {showAddForm && (
            <form className="payroll-add-form" onSubmit={addEmployee}>
              <div className="payroll-form-row">
                <div className="payroll-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    required
                    value={addForm.user_email}
                    onChange={e => setAddForm(f => ({ ...f, user_email: e.target.value }))}
                    placeholder="employee@starr-surveying.com"
                  />
                </div>
                <div className="payroll-form-group">
                  <label>Full Name</label>
                  <input
                    value={addForm.user_name}
                    onChange={e => setAddForm(f => ({ ...f, user_name: e.target.value }))}
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="payroll-form-row">
                <div className="payroll-form-group">
                  <label>Position</label>
                  <select value={addForm.job_title} onChange={e => setAddForm(f => ({ ...f, job_title: e.target.value }))}>
                    {Object.entries(JOB_TITLES).map(([key, val]) => (
                      <option key={key} value={key}>{val.icon} {val.label}</option>
                    ))}
                  </select>
                </div>
                <div className="payroll-form-group">
                  <label>Hourly Rate ($)</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={addForm.hourly_rate}
                    onChange={e => setAddForm(f => ({ ...f, hourly_rate: e.target.value }))}
                  />
                </div>
                <div className="payroll-form-group">
                  <label>Hire Date</label>
                  <input
                    type="date"
                    value={addForm.hire_date}
                    onChange={e => setAddForm(f => ({ ...f, hire_date: e.target.value }))}
                  />
                </div>
              </div>
              <button type="submit" className="payroll-btn payroll-btn--primary">Add Employee</button>
            </form>
          )}

          <div className="payroll-emp-grid">
            {activeEmployees.map(emp => (
              <EmployeePayCard
                key={emp.id}
                employee={emp}
                onSelect={email => router.push(`/admin/payroll/${encodeURIComponent(email)}`)}
              />
            ))}
          </div>

          {inactiveEmployees.length > 0 && (
            <>
              <h3 className="payroll-section-heading">Inactive Employees</h3>
              <div className="payroll-emp-grid">
                {inactiveEmployees.map(emp => (
                  <EmployeePayCard
                    key={emp.id}
                    employee={emp}
                    onSelect={email => router.push(`/admin/payroll/${encodeURIComponent(email)}`)}
                  />
                ))}
              </div>
            </>
          )}

          {filteredEmployees.length === 0 && !loading && (
            <div className="payroll-empty">
              {search ? 'No employees match your search.' : 'No employees found. Add one to get started.'}
            </div>
          )}
        </div>
      )}

      {/* Pay Rates Tab */}
      {activeTab === 'rates' && <PayRateTable isAdmin={isAdmin} />}

      {/* Payroll Runs Tab */}
      {activeTab === 'payroll' && <PayrollRunPanel />}

      {/* Setup Guide */}
      <div className="payroll-setup-guide">
        <h3>Payroll System Setup Guide</h3>
        <div className="payroll-setup-guide__content">
          <h4>1. Run Database Migration</h4>
          <p>Execute <code>supabase_schema_payroll.sql</code> in your Supabase SQL editor to create all payroll tables.</p>

          <h4>2. Configure Employee Profiles</h4>
          <p>Add employees with their job title, hourly rate, and hire date. Each employee&apos;s pay is automatically calculated based on time entries from the job management system.</p>

          <h4>3. Set Up Pay Rates</h4>
          <p>Standard rates are pre-loaded for each position. Role-based adjustments are also configured (e.g., a technician acting as party chief gets a $5/hr bump).</p>

          <h4>4. Add Certifications</h4>
          <p>Record employee certifications (SIT, RPLS, drone pilot, OSHA, etc.). Verified certifications with pay bumps automatically increase the employee&apos;s effective rate.</p>

          <h4>5. Run Payroll</h4>
          <p>Generate a payroll run for a date range. The system auto-calculates hours from job time entries, applies role adjustments and certification bumps, estimates tax deductions (TX has no state income tax), and generates pay stubs.</p>

          <h4>6. Employee Balances</h4>
          <p>When a payroll run is completed, net pay is credited to each employee&apos;s balance. Employees can then request transfers to their bank account at any time.</p>

          <h4>API Routes</h4>
          <ul>
            <li><code>GET/POST/PUT /api/admin/payroll/employees</code> — Employee profiles</li>
            <li><code>GET/POST/PUT/DELETE /api/admin/payroll/certifications</code> — Certifications</li>
            <li><code>GET/POST/PUT/DELETE /api/admin/payroll/rates</code> — Pay rate standards & role adjustments</li>
            <li><code>GET/POST /api/admin/payroll/raises</code> — Pay raise history</li>
            <li><code>GET/POST/PUT /api/admin/payroll/runs</code> — Payroll runs & pay stubs</li>
            <li><code>GET/POST/PUT /api/admin/payroll/balance</code> — Balance & withdrawals</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
