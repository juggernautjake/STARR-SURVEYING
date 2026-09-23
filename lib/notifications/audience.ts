// lib/notifications/audience.ts — who hears a notification that is not about one person.
//
// Owner, 2026-09-23: "Work on determining what roles should exist and what all they should have
// access to, and which roles should get what notifications."
//
// ── THE DISTINCTION THAT MATTERS ────────────────────────────────────────────────────────────────
//
// Almost every notification in this codebase is TARGETED: `lib/notifications/assignment.ts` tells
// the person an assignment was assigned to, `hours-decision.ts` tells the worker whose hours were
// decided, `payout.ts` tells the person who got paid. Those need no routing rule at all — the row
// itself names the recipient, and they are correct by construction.
//
// The problem is the handful that are BROADCAST: a customer phoned, a query arrived from the
// website, hours are waiting for a decision. Those have to answer "who should hear this?", and the
// answer has been a role list written at each call site.
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
//
// `INTAKE_ROUTING_ROLES` routed phone calls and website queries to
// `['admin', 'employee', 'equipment_manager', 'field_crew']`. Measured against the live user table
// on 2026-09-23: all six people hold `employee`, so that list selected six of six. The role filter
// could not exclude anybody, because it contained the role everybody has by definition —
// `employee` is described in `lib/auth-roles.ts` as "Base role". The effect was that the firm's
// field crew got a bell for every customer call about title work, which is not his to action.
//
// `lib/notifications/hours-submitted.ts` had already written down the principle this file
// generalises:
//
//     "Notifying somebody about a decision they are not permitted to make trains them to ignore the
//      bell, and then the bell stops working for everyone."
//
// So the rule here is: a broadcast goes to the people who can ACT on it. Not the people who might
// find it interesting, and never "everyone, to be safe" — a bell that fires for everyone is a bell
// that means nothing.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '@/lib/auth-roles';

export interface BroadcastKind {
  /** Stable id. Stored in `notification_preferences.kind`, so renaming one orphans opt-outs. */
  id: string;
  /** What a person sees on the settings page. */
  label: string;
  /** What arriving looks like, in the words of somebody receiving it. */
  description: string;
  /** Who is eligible to hear it. A person still has to not have opted out. */
  roles: readonly UserRole[];
  /** Why those roles and not others. Read by whoever next wonders if they should add one. */
  why: string;
  /**
   * This kind already has a dedicated settings panel, so the general list skips it.
   *
   * Only `hours.submitted`, whose panel predates this registry and explains the money context in
   * its own words. Showing it twice would be two switches for one setting — and the moment they
   * disagreed, neither would be trustworthy.
   */
  hasOwnPanel?: boolean;
}

/**
 * Every notification that is not addressed to one particular person.
 *
 * Adding a kind here is the whole job of adding a broadcast: the settings page, the opt-out and the
 * recipient lookup all read this list, so a new kind cannot ship without an audience and a reason.
 */
export const BROADCAST_KINDS: readonly BroadcastKind[] = [
  {
    id: 'call.received',
    label: 'Phone calls',
    description: 'Somebody phoned the business line — who called, what they wanted, and the recording.',
    roles: ['admin'],
    why:
      'Whoever answers for the firm. Deliberately NOT `employee`: every person here holds that role, '
      + 'so including it meant the list could not exclude anybody. Deliberately not `field_crew` '
      + 'either — a crew member cannot action a customer asking about a boundary survey, and a bell '
      + 'that fires for work you cannot do is one you learn to ignore.',
  },
  {
    id: 'lead.received',
    label: 'Website queries',
    description: 'Somebody filled in the contact form or the pricing calculator.',
    roles: ['admin'],
    why: 'Same audience as a phone call, because it is the same event arriving through a different door.',
  },
  {
    id: 'hours.submitted',
    label: 'Hours submitted',
    description: 'A crew member submitted or revised a timesheet that needs a decision.',
    roles: ['admin'],
    why:
      'Only people who can decide. `/admin/hours-approval` opens for developer and tech_support too, '
      + 'but every action on it gates on `isAdmin`, so notifying them sends work that 403s. '
      + 'NOTE: this kind has its own older opt-out table, `hours_notification_preferences` '
      + '(seeds/579), which is still the authority for it — see `notification-preferences.ts`.',
    hasOwnPanel: true,
  },
  {
    id: 'equipment.overdue',
    label: 'Equipment not returned',
    description: 'Gear is still checked out after the day it was due back.',
    roles: ['admin', 'equipment_manager'],
    why:
      'The role that exists for exactly this. `equipment_manager` is described as owning the '
      + 'inventory ledger and nagging crews on unreturned gear, so it is the one broadcast where '
      + 'that role is the primary audience rather than an afterthought.',
  },
  {
    id: 'money.request',
    label: 'Money needing a decision',
    description: 'A withdrawal request or a receipt is waiting to be approved.',
    roles: ['admin', 'finance'],
    why:
      'Matches `canHandleMoney` in lib/auth-roles.ts, which is the codebase\'s existing answer to '
      + '"who may act on money". `developer` is absent there on purpose and is absent here for the '
      + 'same reason: a role for testing the application should not be told what people earn.',
  },
] as const;

export type BroadcastKindId = (typeof BROADCAST_KINDS)[number]['id'];

export function broadcastKind(id: string): BroadcastKind | undefined {
  return BROADCAST_KINDS.find((k) => k.id === id);
}

/** The roles eligible for a kind. Unknown kind → nobody, which is louder than notifying everyone. */
export function rolesForKind(id: string): readonly UserRole[] {
  return broadcastKind(id)?.roles ?? [];
}

/** Would a person holding these roles be eligible for this kind, before opt-outs? */
export function isEligibleFor(id: string, roles: readonly string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  const want = rolesForKind(id);
  return want.some((r) => roles.includes(r));
}

/**
 * The people eligible for a kind: approved, not banned, and holding one of its roles.
 *
 * Opt-outs are applied by `recipientsFor` in `notification-preferences.ts`, which layers this.
 * Kept separate so the role question and the preference question stay independently testable —
 * they fail for different reasons and a combined function hides which one did.
 *
 * Returns [] on any failure rather than throwing. A notification is a side effect of something that
 * already succeeded (a call was taken, hours were submitted), and it must never turn that into an
 * error. The empty list is logged, because silently telling nobody is the failure mode that looks
 * exactly like a quiet day.
 */
export async function eligibleRecipients(
  client: Pick<SupabaseClient, 'from'>,
  kindId: string,
): Promise<string[]> {
  const roles = rolesForKind(kindId);
  if (!roles.length) {
    console.error(`[notifications] no audience defined for "${kindId}" — nobody will be told`);
    return [];
  }
  try {
    const { data, error } = await client
      .from('registered_users')
      .select('email, roles, is_approved, is_banned')
      .overlaps('roles', roles as unknown as string[]);
    if (error || !data) {
      console.error(`[notifications] audience lookup failed for "${kindId}":`, error);
      return [];
    }
    const out = new Set<string>();
    for (const row of data as Array<{ email: string; is_approved: boolean; is_banned: boolean }>) {
      if (row.is_banned) continue;
      if (row.is_approved === false) continue;
      if (typeof row.email === 'string' && row.email) out.add(row.email.toLowerCase());
    }
    if (!out.size) console.error(`[notifications] "${kindId}" has no eligible recipients`);
    return [...out];
  } catch (err) {
    console.error(`[notifications] audience lookup threw for "${kindId}":`, err);
    return [];
  }
}
