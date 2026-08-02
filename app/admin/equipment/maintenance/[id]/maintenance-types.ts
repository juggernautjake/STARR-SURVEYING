// app/admin/equipment/maintenance/[id]/maintenance-types.ts — the event shape, the state machine
// and the formatters.
//
// Split out for platform audit item 18. ADJACENCY is the allowed-transition map: it belongs with
// the type rather than with either the view or the dialogs, because both read it and a second copy
// is a second opinion about which transitions are legal.

export interface MaintenanceEvent {
  id: string;
  equipment_inventory_id: string | null;
  vehicle_id: string | null;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  expected_back_at: string | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  vendor_work_order: string | null;
  performed_by_user_id: string | null;
  cost_cents: number | null;
  linked_receipt_id: string | null;
  summary: string;
  notes: string | null;
  qa_passed: boolean | null;
  next_due_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  // Joined display fields
  equipment: {
    id: string;
    name: string | null;
    category: string | null;
    item_kind: string | null;
    qr_code_id: string | null;
  } | null;
  vehicle: { id: string; name: string | null } | null;
  created_by_label: string | null;
  performed_by_label: string | null;
}

export interface MaintenanceDocument {
  id: string;
  kind: string;
  storage_url: string;
  filename: string | null;
  size_bytes: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_by_label: string | null;
  uploaded_at: string;
}

export interface DetailResponse {
  event: MaintenanceEvent;
  documents: MaintenanceDocument[];
}

export const ADJACENCY: Record<string, string[]> = {
  scheduled: [
    'in_progress',
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ],
  in_progress: [
    'awaiting_parts',
    'awaiting_vendor',
    'complete',
    'failed_qa',
    'cancelled',
  ],
  awaiting_parts: [
    'in_progress',
    'awaiting_vendor',
    'complete',
    'cancelled',
  ],
  awaiting_vendor: [
    'in_progress',
    'awaiting_parts',
    'complete',
    'failed_qa',
    'cancelled',
  ],
  failed_qa: ['in_progress', 'cancelled'],
  complete: [], // terminal; reopen route handled separately
  cancelled: [], // terminal
};

export type TerminalKind = 'complete' | 'cancelled' | 'failed_qa';

export const TERMINAL_STATES = new Set<TerminalKind>([
  'complete',
  'cancelled',
  'failed_qa',
]);

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

export function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
