// app/admin/payroll/page.tsx — Admin Payroll Dashboard
'use client';

import { useSession } from 'next-auth/react';
import { Users, DollarSign, BarChart3, Wallet, Play, Plus, TrendingUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import EmployeePayCard from '../components/payroll/EmployeePayCard';
import PayRateTable from '../components/payroll/PayRateTable';
import PayrollRunPanel from '../components/payroll/PayrollRunPanel';
import { formatCurrency } from '../components/payroll/PayrollConstants';
import { useJobTitles } from '../components/payroll/useJobTitles';

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
  const { safeFetch, safeAction, reportPageError } = usePageError('PayrollPage');
  const jobTitles = useJobTitles();
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

  const isAdmin = session?.user?.roles?.includes('admin') ?? false;

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payroll/employees?include_inactive=true');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load employees' });
    }
    setLoading(false);
  }, [reportPageError]);

  useEffect(() => {
    if (!isAdmin) {
      router.push('/admin/me?tab=pay');
      return;
    }
    loadEmployees();
  }, [isAdmin, router, loadEmployees]);

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
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add employee' });
    }
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

      {/* Summary Cards */}
      <div className="payroll-summary-cards">
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon"><Users size={22} strokeWidth={1.75} /></div>
          <div className="payroll-summary-card__value">{employees.filter(e => e.is_active).length}</div>
          <div className="payroll-summary-card__label">Active Employees</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon"><DollarSign size={22} strokeWidth={1.75} /></div>
          <div className="payroll-summary-card__value">{formatCurrency(totalPayroll)}</div>
          <div className="payroll-summary-card__label">Outstanding Balances</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon"><BarChart3 size={22} strokeWidth={1.75} /></div>
          <div className="payroll-summary-card__value">{formatCurrency(avgRate)}/hr</div>
          <div className="payroll-summary-card__label">Avg Hourly Rate</div>
        </div>
        <div className="payroll-summary-card">
          <div className="payroll-summary-card__icon"><Wallet size={22} strokeWidth={1.75} /></div>
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
              {Object.entries(jobTitles).map(([key, info]) => {
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
                <span className="payroll-overview__action-icon"><Play size={18} strokeWidth={1.75} /></span>
                <span className="payroll-overview__action-label">Run Payroll</span>
              </button>
              <button className="payroll-overview__action-card" onClick={() => { setActiveTab('employees'); setShowAddForm(true); }}>
                <span className="payroll-overview__action-icon"><Plus size={18} strokeWidth={1.75} /></span>
                <span className="payroll-overview__action-label">Add Employee</span>
              </button>
              <button className="payroll-overview__action-card" onClick={() => setActiveTab('rates')}>
                <span className="payroll-overview__action-icon"><TrendingUp size={18} strokeWidth={1.75} /></span>
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
                    {Object.entries(jobTitles).map(([key, val]) => (
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
    </div>
  );
}
