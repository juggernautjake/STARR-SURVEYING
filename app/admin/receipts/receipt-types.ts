// app/admin/receipts/receipt-types.ts — the receipt row shape, shared by the queue and the panels
// lifted out of it (platform audit item 18). It mirrors app/api/admin/receipts/route.ts, and having
// two copies of it was the reason the split could not simply move code.

export interface AdminReceiptRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  category_source: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  // Soft-delete + retention (Batch CC). Non-null deleted_at means
  // the row is tombstoned. The bookkeeper page hides these by
  // default but the "Show deleted" toggle (Batch FF) brings them
  // back for audit review.
  deleted_at: string | null;
  deletion_reason: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extraction_cost_cents: number | null;
  ai_confidence_per_field: Record<string, number> | null;
  created_at: string;
  updated_at: string | null;
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  job_name: string | null;
  job_number: string | null;
  photo_signed_url: string | null;
  /** F10.9 — set when a bookkeeper-approved receipt is promoted
   *  to a capital asset row in equipment_inventory. The Batch QQ
   *  tax summary excludes promoted receipts on the receipts side
   *  so the dollars don't land twice on Schedule C. */
  promoted_to_equipment_id: string | null;
  /** F10.7 tail — maintenance events that link to this receipt
   *  via `linked_receipt_id`. Empty array when none. */
  linked_maintenance_events: Array<{
    id: string;
    summary: string;
    kind: string;
    state: string;
    scheduled_for: string | null;
    equipment_inventory_id: string | null;
    equipment_name: string | null;
  }>;
}
