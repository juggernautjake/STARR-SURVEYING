// app/admin/me/components/greeting-helpers.ts
//
// Pure, dependency-free helpers shared by HubGreeting, ClockInPill, and
// the WorkModePrompt clock-in step. Extracted out of HubGreeting.tsx in
// hub-widget-excellence-01 Slice 5 so importing these (e.g. from a unit
// test or the top-bar pill) doesn't transitively pull in HubGreeting's
// client graph — RolePills/WorkModePrompt now import the runtime
// `ROLE_LABELS` from `@/lib/auth`, which drags in next-auth and fails
// to load under vitest.

export function partOfDay(date: Date, customPrefix?: string): string {
  if (customPrefix) return customPrefix;
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name?: string | null): string {
  if (!name) return 'there';
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

export function formatElapsed(startedAtIso: string, nowMs = Date.now()): string {
  const startedMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedMs)) return '';
  const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
