// lib/notifications/icons.ts — the glyph shown beside a notification.
//
// ── WHY THIS IS SHARED AND NOT TWO COPIES ───────────────────────────────────────────────────────
//
// The bell dropdown and the /admin/notifications inbox each carried their own copy of the same map
// and the same fallback chain. When the call notifier started storing `icon: 'phone'` — a NAME, not
// a glyph — both surfaces printed the literal word "phone" beside every call, and fixing one left
// the other wrong. Two copies of a rule is two chances to fix half of it.
//
// ── A ROW'S `icon` MAY BE EITHER A GLYPH OR A NAME ──────────────────────────────────────────────
//
// Most writers store an emoji. `lib/receptionist/notify.ts` stores `'phone'`, and a name is the
// more sensible thing for a writer to store — it survives an emoji being changed later. So both are
// accepted, and the translation happens at READ time, which means rows already in the table are
// repaired rather than only new ones.

/** A stored `icon` that is a name rather than a glyph. */
export const NAMED_ICONS: Record<string, string> = {
  phone: '📞',
  call: '📞',
  mail: '✉️',
  email: '✉️',
  file: '📄',
  money: '💰',
  calendar: '📅',
  warning: '⚠️',
  check: '✅',
  alert: '🔔',
  equipment: '🔧',
  clock: '⏰',
};

/** The fallback when a row's `icon` is empty: what kind of notification is it? */
export const TYPE_ICONS: Record<string, string> = {
  assignment: '📋',
  message: '💬',
  payment: '💰',
  system: '⚙️',
  reminder: '⏰',
  job_update: '🔧',
  approval: '✅',
  mention: '@',
  info: 'ℹ️',
  'call.received': '📞',
};

/**
 * The glyph for one notification row.
 *
 * Order: the row's own icon (translated if it is a name), then the icon for its type, then a
 * generic one — so a writer that sets neither still renders something rather than an empty box.
 */
export function notificationIcon(icon: string | null | undefined, type?: string | null, fallback = 'ℹ️'): string {
  if (icon) return NAMED_ICONS[icon] ?? icon;
  if (type && TYPE_ICONS[type]) return TYPE_ICONS[type];
  return fallback;
}
