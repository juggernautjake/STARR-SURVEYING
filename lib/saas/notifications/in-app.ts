// lib/saas/notifications/in-app.ts
//
// In-app notification adapter for the notifications service.
// Writes one row per recipient to `public.org_notifications` (the
// table shipped in seeds/267) via supabaseAdmin. The customer-side
// bell-icon panel reads from this table.
//
// Phase F-3 ships the DB-write path. WebSocket fanout to push the
// notification into an active session is a separate slice — the
// existing /api/ws/ticket route is research-pipeline-specific; a
// generic per-user channel + client subscriber lands when the bell
// UI component is built (CUSTOMER_PORTAL §3.8 → its own slice).
//
// Spec: docs/planning/completed/CUSTOMER_MESSAGING_PLAN.md §3 + §6 F-3.

import { supabaseAdmin } from '@/lib/supabase';

import type { InAppDispatchInput } from './index';

/** Inserts one in-app notification row. Returns true on success.
 *  Never throws — caller decides whether to retry. */
export async function writeInAppNotification(input: InAppDispatchInput): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from('org_notifications').insert({
      org_id: input.orgId ?? null,
      user_email: input.userEmail,
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body ?? null,
      action_url: input.actionUrl ?? null,
      action_label: input.actionLabel ?? null,
      payload: input.payload ?? {},
    });

    if (error) {
      if (typeof console !== 'undefined') {
        console.error('[notifications/in-app] insert failed', error);
      }
      return false;
    }
    return true;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error('[notifications/in-app] threw', err);
    }
    return false;
  }
}
