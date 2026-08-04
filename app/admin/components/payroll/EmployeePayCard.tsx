// app/admin/components/payroll/EmployeePayCard.tsx
'use client';

import { formatCurrency, formatDate } from './PayrollConstants';
import { useJobTitles } from './useJobTitles';

interface EmployeeProfile {
  id: string;
  user_email: string;
  user_name: string;
  job_title: string | null;
  hourly_rate: number | null;
  /** False for a staff member with no pay record yet — see the payroll API. */
  hasProfile?: boolean;
  salary_type: string;
  annual_salary: number | null;
  pay_frequency: string;
  hire_date: string | null;
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
  is_active: boolean;
}

interface EmployeePayCardProps {
  employee: EmployeeProfile;
  onSelect?: (email: string) => void;
  compact?: boolean;
}

export default function EmployeePayCard({ employee, onSelect, compact }: EmployeePayCardProps) {
  const jobTitles = useJobTitles();
  // ── "No pay set" is not "$0.00/hr" (owner report, 2026-08-04) ───────────────────────────────
  //
  // The payroll list now includes staff who have no `employee_profiles` row — five of the firm's
  // six people, previously invisible. A card that renders their rate as $0.00/hr would state a
  // wage nobody agreed to, and it would look identical to somebody genuinely on zero.
  //
  // So an absent rate renders as an absence, and the card says what to do about it.
  const noPayYet = employee.hasProfile === false || employee.hourly_rate == null;
  const titleInfo = employee.job_title
    ? (jobTitles[employee.job_title] || { label: employee.job_title, icon: '👤' })
    : { label: 'No position set', icon: '👤' };

  if (compact) {
    return (
      <div
        className="payroll-emp-card payroll-emp-card--compact"
        onClick={() => onSelect?.(employee.user_email)}
      >
        <div className="payroll-emp-card__avatar">
          {titleInfo.icon}
        </div>
        <div className="payroll-emp-card__info">
          <div className="payroll-emp-card__name">{employee.user_name || employee.user_email.split('@')[0]}</div>
          <div className="payroll-emp-card__title">{titleInfo.label}</div>
        </div>
        <div className="payroll-emp-card__rate">
          {noPayYet ? 'Pay not set' : `${formatCurrency(employee.hourly_rate ?? 0)}/hr`}
        </div>
      </div>
    );
  }

  return (
    <div
      className="payroll-emp-card"
      onClick={() => onSelect?.(employee.user_email)}
    >
      <div className="payroll-emp-card__header">
        <div className="payroll-emp-card__avatar-lg">{titleInfo.icon}</div>
        <div>
          <div className="payroll-emp-card__name">{employee.user_name || employee.user_email.split('@')[0]}</div>
          <div className="payroll-emp-card__email">{employee.user_email}</div>
          <div className="payroll-emp-card__title">{titleInfo.label}</div>
        </div>
        {!employee.is_active && <span className="payroll-emp-card__inactive-badge">Inactive</span>}
      </div>

      <div className="payroll-emp-card__stats">
        <div className="payroll-emp-card__stat">
          <span className="payroll-emp-card__stat-label">Pay Rate</span>
          <span className="payroll-emp-card__stat-value">
            {employee.salary_type === 'salary'
              ? `${formatCurrency(employee.annual_salary || 0)}/yr`
              : `${noPayYet ? 'Pay not set' : `${formatCurrency(employee.hourly_rate ?? 0)}/hr`}`
            }
          </span>
        </div>
        <div className="payroll-emp-card__stat">
          <span className="payroll-emp-card__stat-label">Balance</span>
          <span className="payroll-emp-card__stat-value payroll-emp-card__stat-value--balance">
            {formatCurrency(employee.available_balance)}
          </span>
        </div>
        <div className="payroll-emp-card__stat">
          <span className="payroll-emp-card__stat-label">Total Earned</span>
          <span className="payroll-emp-card__stat-value">{formatCurrency(employee.total_earned)}</span>
        </div>
        <div className="payroll-emp-card__stat">
          <span className="payroll-emp-card__stat-label">Hire Date</span>
          <span className="payroll-emp-card__stat-value">{employee.hire_date ? formatDate(employee.hire_date) : '—'}</span>
        </div>
      </div>
    </div>
  );
}
