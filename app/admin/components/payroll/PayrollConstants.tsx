// app/admin/components/payroll/PayrollConstants.tsx
// Shared constants for payroll system

export const JOB_TITLES: Record<string, { label: string; icon: string; description: string }> = {
  survey_technician: { label: 'Survey Technician', icon: '🔧', description: 'Entry-level field technician' },
  instrument_operator: { label: 'Instrument Operator', icon: '📡', description: 'Operates total station and GPS' },
  party_chief: { label: 'Party Chief', icon: '👷', description: 'Leads field survey crew' },
  survey_drafter: { label: 'Survey Drafter', icon: '📐', description: 'CAD drafting and drawing' },
  office_tech: { label: 'Office Tech', icon: '🖥️', description: 'Office administrative support' },
  lead_rpls: { label: 'Lead RPLS', icon: '📜', description: 'Registered Professional Land Surveyor' },
};

export const CERTIFICATION_TYPES: Record<string, { label: string; icon: string }> = {
  sit_exam: { label: 'SIT Exam (Surveyor in Training)', icon: '📝' },
  rpls_license: { label: 'RPLS License', icon: '📜' },
  lsit: { label: 'LSIT (Land Surveyor in Training)', icon: '🎓' },
  drone_pilot: { label: 'FAA Part 107 Drone Pilot', icon: '🛸' },
  osha_10: { label: 'OSHA 10-Hour', icon: '⛑️' },
  osha_30: { label: 'OSHA 30-Hour', icon: '🦺' },
  first_aid: { label: 'First Aid/CPR', icon: '🩹' },
  hazwoper: { label: 'HAZWOPER', icon: '☣️' },
  cdl: { label: 'Commercial Driver License', icon: '🚛' },
  other: { label: 'Other', icon: '📋' },
};

export const TRANSACTION_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  credit_payroll: { label: 'Payroll Credit', icon: '💰', color: '#10B981' },
  withdrawal: { label: 'Withdrawal', icon: '🏦', color: '#EF4444' },
  adjustment: { label: 'Adjustment', icon: '⚙️', color: '#6B7280' },
  bonus: { label: 'Bonus', icon: '🎉', color: '#8B5CF6' },
  reimbursement: { label: 'Reimbursement', icon: '🧾', color: '#3B82F6' },
};

export const WITHDRAWAL_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#F59E0B' },
  approved: { label: 'Approved', color: '#3B82F6' },
  processing: { label: 'Processing', color: '#8B5CF6' },
  completed: { label: 'Completed', color: '#10B981' },
  rejected: { label: 'Rejected', color: '#EF4444' },
  cancelled: { label: 'Cancelled', color: '#6B7280' },
};

export const PAYROLL_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#6B7280' },
  processing: { label: 'Processing', color: '#F59E0B' },
  completed: { label: 'Completed', color: '#10B981' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
