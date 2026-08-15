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

interface PayOwedPreview {
  lines: Array<{ user_email: string; user_name: string | null; total_cents: number; method: string | null }>;
  skipped: Array<{ user_email: string; reason: string }>;
  totalCents: number;
  missingMethod: string[];
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
  const [addError, setAddError] = useState<string | null>(null);

  // ── PAY WHAT IS OWED (owner request, 2026-08-05) ──────────────────────────────────────────
  //
  // *"…or we can just do a random payout at anytime."*
  //
  // Preview first, always. A payout is much harder to take back than to not make, so the button
  // shows exactly who would be paid what — and who would be SKIPPED and why — before anything is
  // created. "Nobody appeared in the batch" needs to distinguish "everyone is paid up" from
  // "everyone was excluded", and only the preview can say which.
  const [owedPreview, setOwedPreview] = useState<PayOwedPreview | null>(null);
  const [payingOwed, setPayingOwed] = useState(false);
  const [payOwedError, setPayOwedError] = useState<string | null>(null);
  const [payOwedResult, setPayOwedResult] = useState<string | null>(null);
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
      router.push('/admin/my-pay');
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
          // `create`, explicitly. The API upserts, so without this an "Add" for somebody who already
          // has a record would overwrite their position and rate with this form's defaults —
          // survey_technician at $18.00 — and return 200 as though it had added a new person.
          mode: 'create',
          user_email: addForm.user_email,
          user_name: addForm.user_name,
          job_title: addForm.job_title,
          hourly_rate: parseFloat(addForm.hourly_rate),
          salary_type: addForm.salary_type,
          hire_date: addForm.hire_date || null,
        }),
      });
      if (res.ok) {
        setAddError(null);
        setShowAddForm(false);
        setAddForm({ user_email: '', user_name: '', job_title: 'survey_technician', hourly_rate: '18.00', salary_type: 'hourly', hire_date: '' });
        loadEmployees();
      } else {
        // Previously this branch did not exist: a refused add left the form open with no message,
        // which reads as the button doing nothing. The server's sentence is shown as-is because it
        // names the person and what they are already on.
        const j = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setAddError(j?.message ?? j?.error ?? `Could not add this person (HTTP ${res.status}).`);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add employee' });
    }
  }

  const filteredEmployees = employees.filter(emp =>
    !search || emp.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    emp.user_email.toLowerCase().includes(search.toLowerCase()) ||
    emp.job_title?.toLowerCase().includes(search.toLowerCase())
  );

  const activeEmployees = filteredEmployees.filter(e => e.is_active);
  const inactiveEmployees = filteredEmployees.filter(e => !e.is_active);

  // Summary stats
  const totalPayroll = employees.filter(e => e.is_active).reduce((s, e) => s + e.available_balance, 0);
  // Averaged over people who HAVE a rate. Counting an unset rate as 0 would drag the firm average
  // down by everyone not yet set up — a pay cut that never happened, shown as a headline figure.
  const paid = employees.filter((e) => e.is_active && e.hourly_rate != null);
  const avgRate = paid.length > 0 ? paid.reduce((s, e) => s + (e.hourly_rate ?? 0), 0) / paid.length : 0;
  const totalEarned = employees.reduce((s, e) => s + e.total_earned, 0);

  if (!isAdmin) return null;


  const previewOwed = async () => {
    setPayOwedError(null);
    setPayOwedResult(null);
    try {
      const res = await fetch('/api/admin/payroll/pay-owed');
      const body = await res.json();
      if (!res.ok) { setPayOwedError(body.error || 'Could not work out what is owed.'); return; }
      setOwedPreview(body);
    } catch {
      setPayOwedError('Could not work out what is owed.');
    }
  };

  const createOwedPayout = async () => {
    setPayingOwed(true);
    setPayOwedError(null);
    try {
      const res = await fetch('/api/admin/payroll/pay-owed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) { setPayOwedError(body.error || 'Could not create the payout.'); return; }
      // Deliberately does NOT say "paid". A draft batch has not sent anything; the money leaves when
      // somebody dispatches it. Saying "paid" here is a promise the platform cannot keep.
      setPayOwedResult(
        `Payout prepared: ${body.lines} ${body.lines === 1 ? 'person' : 'people'}, ` +
        `${(body.totalCents / 100).toFixed(2)}. It is a draft until somebody sends it.` +
        (body.missingMethod?.length ? ` ${body.missingMethod.length} need a payment method assigned.` : ''),
      );
      setOwedPreview(null);
      await loadEmployees();
    } finally {
      setPayingOwed(false);
    }
  };

  return (
    <div className="payroll-page">

      {/* ── Pay what is owed ─────────────────────────────────────────────────────────────────
          Preview, then create. The result never says "paid": a draft batch has not sent
          anything, and the money leaves when somebody dispatches it. */}
      <div className="payroll-payowed">
        <div className="payroll-payowed__row">
          {/* admin-ui-alignment-2026-08-15 — these were `tl-btn`, and the error below was
              `tl-pay-error`. Both classes live in AdminTimeLogs.css, which this route never
              imports (payroll/layout.tsx loads AdminPayroll.css alone), so all three rendered
              completely unstyled: no border, no background, 26px of bare text where a button
              should be. Swapped to this page's own button system, which is loaded. */}
          <button className="payroll-btn" onClick={previewOwed} disabled={payingOwed}>
            What is owed right now?
          </button>
          {owedPreview && owedPreview.lines.length > 0 && (
            <button className="payroll-btn payroll-btn--primary" onClick={createOwedPayout} disabled={payingOwed}>
              {payingOwed ? 'Preparing…' : `Prepare payout — ${(owedPreview.totalCents / 100).toFixed(2)}`}
            </button>
          )}
        </div>

        {payOwedError && <div className="payroll-payowed__error">{payOwedError}</div>}
        {payOwedResult && <div className="payroll-payowed__done">{payOwedResult}</div>}

        {owedPreview && (
          <div className="payroll-payowed__preview">
            {owedPreview.lines.length === 0 ? (
              <p>Nobody has a positive balance right now.</p>
            ) : (
              <ul>
                {owedPreview.lines.map((l) => (
                  <li key={l.user_email}>
                    <strong>{l.user_name || l.user_email}</strong> — {formatCurrency(l.total_cents / 100)}
                    {!l.method && <span className="payroll-payowed__warn"> · no payment method on file</span>}
                  </li>
                ))}
              </ul>
            )}
            {/* Why somebody is NOT in the batch is as important as who is. */}
            {owedPreview.skipped.length > 0 && (
              <ul className="payroll-payowed__skipped">
                {owedPreview.skipped.map((s) => (
                  <li key={s.user_email}>{s.user_email} — {s.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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
              {/* ── THIS GRID WAS A DEAD END (owner, 2026-08-12) ─────────────────────────────────
                  *"it shows me what employees hold what positions, but it is not letting me click on
                  the users and set their positions"*.

                  Setting a position was already possible — Employees tab → a person's card → their
                  detail page → Edit Profile → save, and the API has accepted `job_title` on PUT all
                  along. But the only screen that TALKS about positions was these count cards, and they
                  were inert `<div>`s: no link to the people they were counting, and nothing saying
                  where the position is actually changed. The capability existed; the door was on a
                  different wall.

                  So the card now (a) names the people, each linking straight to the page where their
                  position is set, and (b) is itself clickable, filtering the Employees tab to that
                  position. The counts still come from the same `employees` array the rest of the page
                  uses, so a saved change is reflected the moment the list reloads. */}
              {Object.entries(jobTitles).map(([key, info]) => {
                const holders = employees.filter(e => e.is_active && e.job_title === key);
                return (
                  <button
                    key={key}
                    type="button"
                    className="payroll-overview__position-card payroll-overview__position-card--link"
                    onClick={() => { setActiveTab('employees'); setSearch(key); }}
                    title={`Show the ${info.label} list — open anyone there to change their position`}
                  >
                    <div className="payroll-overview__position-icon">{info.icon}</div>
                    <div className="payroll-overview__position-name">{info.label}</div>
                    <div className="payroll-overview__position-count">
                      {holders.length} employee{holders.length !== 1 ? 's' : ''}
                    </div>
                    {/* Naming them is the point: a count answers "how many", and the question an
                        admin actually has here is "who — and is that still right?". Capped so a large
                        position does not turn the card into a directory. */}
                    {holders.length > 0 && (
                      <ul className="payroll-overview__position-people">
                        {holders.slice(0, 4).map(emp => (
                          <li key={emp.id}>
                            <span
                              role="link"
                              tabIndex={0}
                              className="payroll-overview__position-person"
                              title={`Open ${emp.user_name || emp.user_email} to change their position`}
                              onClick={(e) => { e.stopPropagation(); router.push(`/admin/payroll/${encodeURIComponent(emp.user_email)}`); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/admin/payroll/${encodeURIComponent(emp.user_email)}`);
                                }
                              }}
                            >
                              {emp.user_name || emp.user_email}
                            </span>
                          </li>
                        ))}
                        {holders.length > 4 && <li className="payroll-overview__position-more">+{holders.length - 4} more</li>}
                      </ul>
                    )}
                  </button>
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
            {addError && (
              <div role="alert" style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: 8, marginBottom: 8,
                background: 'color-mix(in srgb, var(--theme-danger) 10%, transparent)',
                border: '1px solid var(--theme-danger)', color: 'var(--theme-danger)', fontSize: 13 }}>
                {addError}
              </div>
            )}
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
