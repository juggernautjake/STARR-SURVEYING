// app/api/admin/phone/settings/route.ts — slice I1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"I want to be able to set the hours for calling."*
//
// GET  /api/admin/phone/settings — the current hours, always a complete usable object
// PUT  /api/admin/phone/settings — replace them
//
// A whole-object PUT rather than a patch, because the days are a fixed-length array and a partial
// update of "Tuesday" has no unambiguous meaning — is an omitted day unchanged, or closed? The
// screen holds the whole week anyway.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPhoneHours, savePhoneHours } from '@/lib/phone/settings';
import { describeHours, isOpenAt, parsePhoneHours } from '@/lib/phone/hours';
import { normalizePhone } from '@/lib/integrations/google/hash';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const hours = await loadPhoneHours();
  const check = isOpenAt(new Date(), hours);
  return NextResponse.json({ hours, summary: describeHours(hours), openNow: check.open, closedReason: check.reason });
}, { routeName: 'admin/phone/settings' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { hours?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON body with an `hours` object.' }, { status: 400 });
  }

  const candidate = parsePhoneHours(body.hours);

  // `parsePhoneHours` silently drops what it cannot read, which is right for a reader facing a live
  // call and wrong for a person who just pressed Save: they would see a day quietly empty itself
  // with no explanation. So the write path re-checks and REPORTS, rather than accepting silently.
  const warnings: string[] = [];
  const submitted = (body.hours ?? {}) as Record<string, unknown>;
  if (Array.isArray(submitted.days)) {
    for (let d = 0; d < 7; d++) {
      const before = Array.isArray(submitted.days[d]) ? (submitted.days[d] as unknown[]).length : 0;
      const after = candidate.days[d]?.length ?? 0;
      if (before > after) warnings.push(`${before - after} time range(s) on day ${d} were not valid times and were dropped.`);
    }
  }

  // Forwarding numbers are canonicalised here, not at dial time: Twilio rejects anything that is not
  // E.164, and discovering that while a customer is on hold is the wrong moment.
  const badNumbers = candidate.forwardTo.filter((n) => !normalizePhone(n));
  if (badNumbers.length > 0) {
    return NextResponse.json(
      { error: `These are not phone numbers Twilio will dial: ${badNumbers.join(', ')}` },
      { status: 400 },
    );
  }
  candidate.forwardTo = candidate.forwardTo.map((n) => normalizePhone(n)!);

  // An unknown time zone would silently evaluate every rule in UTC — the exact bug this replaces.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate.timeZone });
  } catch {
    return NextResponse.json({ error: `“${candidate.timeZone}” is not a time zone.` }, { status: 400 });
  }

  const saved = await savePhoneHours(candidate, session.user.email);
  const check = isOpenAt(new Date(), saved);
  return NextResponse.json({
    hours: saved,
    summary: describeHours(saved),
    openNow: check.open,
    closedReason: check.reason,
    warnings,
  });
}, { routeName: 'admin/phone/settings' });
