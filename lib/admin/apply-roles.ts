// lib/admin/apply-roles.ts — the one place a person's roles change.
//
// ── WHY THIS WAS EXTRACTED (E2, 2026-08-11) ─────────────────────────────────────────────────────
//
// Granting a role lived inline in `PATCH /api/admin/users/[id]`. E2 adds a second trigger for the
// same effect — an admin approving a role REQUEST — and the obvious implementation is to write the
// same `registered_users.roles` update in the approve handler.
//
// That is the mistake this file exists to prevent. **Two writers of access control is how one of
// them stops being audited**, and the drift is invisible: both work, both look right, and the day
// somebody adds a validation rule or an audit line to one of them, the other quietly becomes the
// hole. Access is the last place in a product to accept a second code path.
//
// So the rule moved here and both callers use it. `/admin/users` behaves exactly as before.

import { supabaseAdmin } from '@/lib/supabase';
import { ALL_ROLES, type UserRole } from '@/lib/auth-roles';

export interface ApplyRolesResult {
  ok: boolean;
  status?: number;
  error?: string;
  roles?: UserRole[];
}

/**
 * Set a user's roles to exactly `roles`.
 *
 * `employee` is force-included, matching the behaviour this replaced. That is not tidiness: it is
 * the DEFAULT role the middleware falls back to, and a user without it fails gates that every member
 * of staff should pass — see E1, where the absence of `employee` from a role list hid the
 * hours page from most of the firm.
 */
export async function applyRoles(userId: string, roles: string[]): Promise<ApplyRolesResult> {
  if (!Array.isArray(roles) || roles.length === 0) {
    return { ok: false, status: 400, error: 'Roles must be a non-empty array' };
  }
  const valid = new Set(ALL_ROLES as readonly string[]);
  const bad = roles.filter((r) => !valid.has(r));
  if (bad.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Invalid role(s): ${bad.join(', ')}. Must be one of: ${ALL_ROLES.join(', ')}`,
    };
  }
  const finalRoles = (roles.includes('employee') ? roles : ['employee', ...roles]) as UserRole[];

  const { error } = await supabaseAdmin
    .from('registered_users')
    .update({ roles: finalRoles, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error('[applyRoles] update failed', { userId, error: error.message });
    return { ok: false, status: 500, error: 'Failed to update roles' };
  }
  return { ok: true, roles: finalRoles };
}

/**
 * Add roles to whoever this email is, leaving everything they already hold intact.
 *
 * The ADD semantics are the point, and they are why a role request stores the delta rather than a
 * final list: between somebody asking for `drawer` and an admin approving it, that person may have
 * been granted `researcher` by another route. Replaying a stored final list would silently revoke
 * it — an approval that takes something away is the least expected outcome there is.
 */
export async function addRolesByEmail(email: string, add: string[]): Promise<ApplyRolesResult> {
  const { data: user, error } = await supabaseAdmin
    .from('registered_users')
    .select('id, roles')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!user) return { ok: false, status: 404, error: `No account for ${email}.` };

  const current = new Set(((user.roles as string[] | null) ?? []).map(String));
  for (const r of add) current.add(r);
  return applyRoles(user.id as string, [...current]);
}
