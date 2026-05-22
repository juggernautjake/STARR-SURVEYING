// app/admin/components/payroll/PayrollConstants.tsx
// Shared constants for payroll system.
//
// Job titles moved to a server-driven catalog (P-7 of
// PAY_PROGRESSION_OVERHAUL.md). Use the `useJobTitles()` hook from
// ./useJobTitles in client components — it returns the live data from
// role_tiers via /api/role-tiers. JOB_TITLES_FALLBACK (below) covers
// the 14 seeded tiers and is used by the hook when the network fails,
// so consumers never see "undefined".

export const JOB_TITLES_FALLBACK: Record<string, { label: string; icon: string; description: string }> = {
  intern:           { label: 'Intern',                    icon: '🌱',  description: 'Learning the field' },
  field_hand:       { label: 'Field Hand',                icon: '👷',  description: 'Entry-level field labor' },
  rodman:           { label: 'Rodman',                    icon: '📏',  description: 'Assists field crew with measurements' },
  instrument_op:    { label: 'Instrument Operator',       icon: '📡',  description: 'Operates total station and GPS' },
  survey_tech:      { label: 'Survey Technician',         icon: '🔧',  description: 'Entry-level field technician' },
  party_chief:      { label: 'Party Chief',               icon: '👷‍♂️', description: 'Leads field survey crew' },
  sit:              { label: 'Surveyor in Training (SIT)', icon: '🎓', description: 'SIT exam passed; on the path to RPLS' },
  survey_drafter:   { label: 'Survey Drafter',            icon: '📐',  description: 'CAD drafting and drawing' },
  project_manager:  { label: 'Project Manager',           icon: '🗂️', description: 'Manages job lifecycle and client comms' },
  rpls:             { label: 'RPLS',                      icon: '📜',  description: 'Registered Professional Land Surveyor' },
  senior_rpls:      { label: 'Senior RPLS',               icon: '🏅',  description: 'Senior licensed surveyor; mentors RPLS' },
  owner:            { label: 'Owner / Principal',         icon: '👑',  description: 'Owner / principal of the firm' },
  admin_staff:      { label: 'Administrative Staff',      icon: '🖥️', description: 'Office administrative support' },
  it_support:       { label: 'IT / Tech Support',         icon: '🛠️', description: 'IT and software support' },
};

/** @deprecated Import `useJobTitles` from ./useJobTitles instead — this is kept as a fallback only. */
export const JOB_TITLES = JOB_TITLES_FALLBACK;

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
