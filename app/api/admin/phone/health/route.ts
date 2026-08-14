// app/api/admin/phone/health/route.ts — slice P0a of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// "Is the phone system actually working?" answered truthfully, because the existing Twilio adapter
// answers it falsely: with no credentials it logs and returns `true`, so every caller believes the
// message was sent. This route is the antidote — it reports what is configured, and optionally asks
// Twilio itself, which is the only way to distinguish "credentials are present" from "credentials
// are correct".
//
// Modelled on /api/admin/receipts/ai-health, which is this repo's pattern for the same question.
//
// GET  /api/admin/phone/health          — config only, free, no network
// GET  /api/admin/phone/health?live=1   — additionally verifies the credentials against Twilio
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { readTwilioConfig, describeTwilioConfig, twilioApiBase, twilioAuthHeader } from '@/lib/phone/config';
import { loadPhoneHours } from '@/lib/phone/settings';
import { describeHours, isOpenAt } from '@/lib/phone/hours';

/** Never let a secret out of a diagnostics endpoint; the last four is enough to tell accounts apart. */
function tail(value: string | null): string | null {
  return value ? `…${value.slice(-4)}` : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cfg = readTwilioConfig();
  const readiness = describeTwilioConfig(cfg);
  const hours = await loadPhoneHours();
  const now = new Date();
  const openNow = isOpenAt(now, hours);

  let live: { checked: boolean; ok: boolean; detail: string } | null = null;
  if (new URL(req.url).searchParams.get('live') === '1') {
    live = await probeTwilio();
  }

  return NextResponse.json({
    ready: readiness,
    config: {
      accountSid: tail(cfg.accountSid),
      authTokenPresent: Boolean(cfg.authToken),
      fromNumber: cfg.fromNumber,
      fromNumberSource: cfg.fromNumberSource,
      publicBaseUrl: cfg.publicBaseUrl,
      // Exactly what to paste into the Twilio console, since a wrong value here is the single most
      // likely reason a correctly-built webhook never fires.
      voiceWebhookUrl: cfg.publicBaseUrl ? `${cfg.publicBaseUrl.replace(/\/+$/, '')}/api/twilio/voice` : null,
      statusWebhookUrl: cfg.publicBaseUrl ? `${cfg.publicBaseUrl.replace(/\/+$/, '')}/api/twilio/status` : null,
    },
    hours: {
      timeZone: hours.timeZone,
      enabled: hours.enabled,
      forwardToCount: hours.forwardTo.length,
      summary: describeHours(hours),
      openNow: openNow.open,
      // The local time as the rule saw it. If this disagrees with the wall clock in the office, the
      // time zone is wrong — and that is otherwise invisible.
      localTime: `${String(Math.floor(openNow.local.minutes / 60)).padStart(2, '0')}:${String(openNow.local.minutes % 60).padStart(2, '0')}`,
      localDate: openNow.local.date,
      closedReason: openNow.reason,
    },
    live,
  });
}, { routeName: 'admin/phone/health' });

/** Ask Twilio whether these credentials are real. A 401 here is the answer the config check cannot give. */
async function probeTwilio(): Promise<{ checked: boolean; ok: boolean; detail: string }> {
  const base = twilioApiBase();
  const authHeader = twilioAuthHeader();
  if (!base || !authHeader) {
    return { checked: false, ok: false, detail: 'No credentials configured, so there was nothing to check.' };
  }
  try {
    const res = await fetch(`${base}.json`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { checked: true, ok: false, detail: 'Twilio rejected the credentials (401).' };
    if (!res.ok) return { checked: true, ok: false, detail: `Twilio replied ${res.status}.` };
    const body = (await res.json()) as { friendly_name?: string; status?: string };
    return {
      checked: true,
      ok: body.status === 'active',
      detail: `Account “${body.friendly_name ?? 'unknown'}” is ${body.status ?? 'in an unknown state'}.`,
    };
  } catch (err) {
    return { checked: true, ok: false, detail: `Could not reach Twilio: ${(err as Error).message}` };
  }
}
