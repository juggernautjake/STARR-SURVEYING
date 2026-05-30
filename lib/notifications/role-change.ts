// lib/notifications/role-change.ts
//
// notifications-completeness-pass Slice 3 — pure builder for the six
// employee-profile change events fired from
// /api/admin/employees/manage:
//
//   - role             — promotion / reassignment with optional pay impact
//   - credential_added — a new credential granted (may carry a bonus rate)
//   - credential_removed
//   - bonus            — a one-off bonus payout
//   - credits          — learning credits awarded
//   - note             — an admin note made visible to the employee
//
// The pay-raise event has its own builder in pay-raise.ts and stays
// there. Pay-impacting events (role, credential_added with bonus,
// bonus) deep-link to /admin/me?tab=pay; profile-only events deep-link
// to /admin/me?tab=profile. Dependency-free → unit-tested in node.

export type RoleChangeKind =
  | 'role'
  | 'credential_added'
  | 'credential_removed'
  | 'bonus'
  | 'credits'
  | 'note';

export interface RoleChangeInput {
  user_email: string;
  kind: RoleChangeKind;
  /** Display label for the new state (new role label, credential label,
   *  etc.). Required for `role` / `credential_added` / `credential_removed`. */
  label?: string | null;
  /** Display label for the previous state, when relevant. */
  previous_label?: string | null;
  /** Dollar amount of the bonus or learning-credit-points count
   *  (positive integer/float). Required for `bonus` and `credits`. */
  amount?: number | null;
  /** A free-form reason / note. Required for `note`; optional context
   *  for bonus / credits / role. */
  reason?: string | null;
  /** Pay-rate impact of a role change, $/hr. Used only for kind:'role';
   *  positive → "promoted", negative → "reassigned", 0 / null → neutral. */
  pay_impact_per_hour?: number | null;
}

export interface RoleChangeNotification {
  user_email: string;
  type: 'profile_change';
  source_type:
    | 'role'
    | 'credential_added'
    | 'credential_removed'
    | 'bonus'
    | 'learning_credits'
    | 'admin_note';
  title: string;
  body: string;
  icon: string;
  link: '/admin/me?tab=pay' | '/admin/me?tab=profile';
}

const PAY_LINK = '/admin/me?tab=pay';
const PROFILE_LINK = '/admin/me?tab=profile';

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/** Build the notification payload, or null when the input is unusable
 *  (missing required field for the kind, empty email, etc.). */
export function buildRoleChangeNotification(
  input: RoleChangeInput,
): RoleChangeNotification | null {
  const email = input.user_email?.trim().toLowerCase();
  if (!email) return null;

  switch (input.kind) {
    case 'role': {
      const label = input.label?.trim();
      if (!label) return null;
      const impact = Number(input.pay_impact_per_hour ?? 0);
      const verb = impact > 0 ? 'promoted' : impact < 0 ? 'reassigned' : 'moved';
      const impactSuffix = impact !== 0 ? ` Pay impact: ${impact > 0 ? '+' : ''}${money(impact)}/hr.` : '';
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'role',
        title: `🎉 Role updated: ${label}`,
        body: `You have been ${verb} to ${label}.${impactSuffix}`,
        icon: '🎉',
        link: impact !== 0 ? PAY_LINK : PROFILE_LINK,
      };
    }

    case 'credential_added': {
      const label = input.label?.trim();
      if (!label) return null;
      const bonus = Number(input.amount ?? 0);
      const bonusSuffix = bonus > 0 ? ` This adds +${money(bonus)}/hr to your pay.` : '';
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'credential_added',
        title: `🏅 Credential earned: ${label}`,
        body: `${label} has been added to your profile.${bonusSuffix}`,
        icon: '🏅',
        link: bonus > 0 ? PAY_LINK : PROFILE_LINK,
      };
    }

    case 'credential_removed': {
      const label = input.label?.trim();
      if (!label) return null;
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'credential_removed',
        title: `Credential removed: ${label}`,
        body: `${label} has been removed from your profile.`,
        icon: '📋',
        link: PROFILE_LINK,
      };
    }

    case 'bonus': {
      const amount = Number(input.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      const reason = input.reason?.trim();
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'bonus',
        title: `🎁 Bonus awarded — ${money(amount)}`,
        body: reason ? `You received a ${money(amount)} bonus. Reason: ${reason}` : `You received a ${money(amount)} bonus.`,
        icon: '🎁',
        link: PAY_LINK,
      };
    }

    case 'credits': {
      const points = Math.floor(Number(input.amount ?? 0));
      if (!Number.isFinite(points) || points <= 0) return null;
      const reason = input.reason?.trim();
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'learning_credits',
        title: `📚 ${points} learning credits awarded`,
        body: reason ? `You earned ${points} learning credits. Reason: ${reason}` : `You earned ${points} learning credits.`,
        icon: '📚',
        link: PROFILE_LINK,
      };
    }

    case 'note': {
      const note = input.reason?.trim();
      if (!note) return null;
      return {
        user_email: email,
        type: 'profile_change',
        source_type: 'admin_note',
        title: '📋 Admin note',
        body: note,
        icon: '📋',
        link: PROFILE_LINK,
      };
    }
  }
}
