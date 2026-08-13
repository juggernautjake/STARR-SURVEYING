// lib/receipts/submitter.ts
//
// Who submitted this receipt, as an address you can send something to.
//
// `receipts.user_id` is an `auth.users` UUID (seed 220). Every screen that shows a receipt shows the
// person, and every notification about one has to reach them — so the UUID has to become an email
// somewhere, and doing it in one place stops each caller inventing its own lookup.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────────────────────────
//
// Both receipt-decision routes used to read a `submitted_by` column that does not exist, cast the
// result to a type that claimed it did, and pass the resulting `undefined` to the notification
// builder — which returns null on a missing submitter. So approvals and rejections notified nobody,
// silently, for as long as the feature has existed. The cast is what hid it from the compiler; this
// module is what removes the need for one.

import { supabaseAdmin } from '@/lib/supabase';

/**
 * Map `auth.users` ids to email addresses.
 *
 * Returns a Map rather than throwing on a miss: a receipt whose submitter has since been deleted is
 * an ordinary state, and it must not stop the other nineteen receipts in a batch being decided. The
 * caller sees no entry and simply sends no notification, which is the honest outcome.
 *
 * Uses the same `listUsers` pattern as `/api/admin/receipts/mine` and the upload route, so a change
 * to how this firm provisions accounts lands in one shape rather than several.
 */
export async function resolveSubmitterEmails(
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const wanted = new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  const out = new Map<string, string>();
  if (wanted.size === 0) return out;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      // Named, not swallowed. A decision still goes through — but somebody should be able to find
      // out why the person was not told.
      console.error('[receipts/submitter] could not resolve submitters:', error.message);
      return out;
    }
    for (const u of data?.users ?? []) {
      if (u.id && u.email && wanted.has(u.id)) out.set(u.id, u.email);
    }
  } catch (err) {
    console.error('[receipts/submitter] could not resolve submitters:', err instanceof Error ? err.message : String(err));
  }
  return out;
}
