// lib/cad/branch/types.ts
//
// cad-branching — shared types + pure lifecycle logic for drawing branches.
// A "branch" is a cad_drawings row whose parent_id points at the drawing it
// was forked from. Its branch_status walks a small state machine:
//
//     draft ──submit──▶ in_review ──accept──▶ accepted
//       ▲                   │
//       └─────withdraw──────┤
//                           └──reject───▶ rejected ──submit──▶ in_review
//
// Only the branch author may submit / withdraw; only the parent drawing's
// owner may accept / reject. Enforced in the API; the pure transition table
// here is unit-tested.

export type BranchStatus = 'draft' | 'in_review' | 'accepted' | 'rejected';
export type BranchAction = 'submit' | 'withdraw' | 'accept' | 'reject';

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

/** Tailwind chip classes per status (dark editor theme). */
export const BRANCH_STATUS_CHIP: Record<BranchStatus, string> = {
  draft: 'bg-gray-700 text-gray-300 border-gray-600',
  in_review: 'bg-amber-900/50 text-amber-300 border-amber-700',
  accepted: 'bg-green-900/50 text-green-300 border-green-700',
  rejected: 'bg-red-900/50 text-red-300 border-red-700',
};

/** Which role an action belongs to (used to gate the API by identity). */
export const BRANCH_ACTION_ROLE: Record<BranchAction, 'author' | 'owner'> = {
  submit: 'author',
  withdraw: 'author',
  accept: 'owner',
  reject: 'owner',
};

/**
 * The status a branch moves to for a given action, or null if the action is
 * not valid from the current status. `accepted` is terminal; a `rejected`
 * branch can be reworked and re-submitted.
 */
export function nextBranchStatus(current: BranchStatus, action: BranchAction): BranchStatus | null {
  switch (action) {
    case 'submit':
      return current === 'draft' || current === 'rejected' ? 'in_review' : null;
    case 'withdraw':
      return current === 'in_review' ? 'draft' : null;
    case 'accept':
      return current === 'in_review' ? 'accepted' : null;
    case 'reject':
      return current === 'in_review' ? 'rejected' : null;
    default:
      return null;
  }
}

/** Metadata the API returns for a branch row (list + detail). */
export interface BranchSummary {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  created_by: string;
  branch_status: BranchStatus | null;
  branch_note: string | null;
  forked_at: string | null;
  forked_from_updated_at: string | null;
  review_requested_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  feature_count: number;
  layer_count: number;
  updated_at: string;
  created_at: string;
  // Present on review-inbox rows (joined from the parent).
  parent_name?: string | null;
  parent_owner?: string | null;
  parent_updated_at?: string | null;
}

/**
 * True when the parent drawing was edited after this branch was forked, so
 * accepting the branch would discard those newer edits. Drives the "the main
 * drawing changed since this branch" warning in the review UI.
 */
export function parentDriftedSinceFork(
  forkedFromUpdatedAt: string | null | undefined,
  parentUpdatedAt: string | null | undefined,
): boolean {
  if (!forkedFromUpdatedAt || !parentUpdatedAt) return false;
  const a = Date.parse(forkedFromUpdatedAt);
  const b = Date.parse(parentUpdatedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b > a;
}
