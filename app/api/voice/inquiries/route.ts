// app/api/voice/inquiries/route.ts — the public quote-request endpoint.
//
// This is the one route on the platform that an anonymous stranger can POST to, which makes it the
// one that has to be careful. It is also the route the entire public site exists to deliver traffic
// to, so it must not reject a real client for anything short of genuinely unusable input.
//
// ── SPAM IS STORED, NOT REFUSED ─────────────────────────────────────────────────────────────────
//
// A submission that trips the honeypot or the timing check is saved with `status: 'spam'` and the
// caller gets the same success response as everybody else. Two reasons:
//
//   1. A bot told it was detected is a bot that adapts. A silent accept teaches it nothing.
//   2. The heuristics WILL produce false positives — someone with a password manager that fills every
//      field, someone on a broken clock. Refusing them loses a real job with no way to recover it.
//      Filed as spam, Andrew can see it in a filter and rescue it.
//
// The only thing that gets a real rejection is input that cannot be acted on at all: no name, no
// usable email.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { toInquiryRow, validateInquiry, type InquiryInput } from '@/lib/voice/inquiry';
import { notifyStudio } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

/** In-memory per-IP throttle.
 *
 *  Deliberately modest: it exists to blunt a script hammering the endpoint, not to be a real rate
 *  limiter. It resets on deploy and is per-instance, so a serverless platform running several
 *  instances enforces it several times over — which is fine for a ceiling this loose, and is why the
 *  limit is generous enough that a real person could never hit it. A proper limiter needs shared
 *  state (Redis), and this repo has ioredis; wire it here if abuse ever becomes real. */
const RECENT = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function throttled(ip: string): boolean {
  const now = Date.now();
  const hits = (RECENT.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RECENT.set(ip, hits);
  // Keep the map from growing without bound on a long-lived instance.
  if (RECENT.size > 5000) {
    for (const [key, times] of RECENT) {
      if (!times.some((t) => now - t < WINDOW_MS)) RECENT.delete(key);
    }
  }
  return hits.length > MAX_PER_WINDOW;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  // The left-most entry is the original client; everything after is proxies.
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';

  let input: InquiryInput;
  try {
    if (contentType.includes('application/json')) {
      input = await request.json();
    } else {
      // The form has `method="post"` and an `action`, so it still submits with JavaScript disabled.
      const form = await request.formData();
      input = Object.fromEntries(form.entries()) as unknown as InquiryInput;
    }
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const ip = clientIp(request);
  if (throttled(ip)) {
    return NextResponse.json(
      { error: 'That is a lot of messages in a short time. Try again shortly, or email directly.' },
      { status: 429 },
    );
  }

  const check = validateInquiry(input);
  if (!check.ok) {
    return NextResponse.json({ error: 'Please check the form.', errors: check.errors }, { status: 400 });
  }

  const row = toInquiryRow(input, check.suspectedSpam);

  const { data, error } = await supabaseAdmin.from('va_inquiries').insert(row).select('id, name, intent').single();

  if (error) {
    console.error('[voice/inquiries] insert failed:', error.message);
    return NextResponse.json(
      { error: 'Could not send that. Please email directly instead — sorry.' },
      { status: 500 },
    );
  }

  // Notify only for real inquiries. A push for every spam submission trains Andrew to ignore the
  // notification that matters.
  if (!check.suspectedSpam) {
    void notifyStudio({
      kind: 'inquiry_received',
      title: `New ${row.intent === 'coaching' ? 'coaching' : 'voice-over'} inquiry`,
      body: `${data.name} got in touch.`,
      href: `${BASE_PATH}/studio/inquiries/${data.id}`,
      subjectType: 'inquiry',
      subjectId: data.id,
    });
  }

  // A no-JavaScript submission gets a redirect it can follow; a fetch() gets JSON.
  if (!contentType.includes('application/json')) {
    return NextResponse.redirect(new URL(`${BASE_PATH}/contact?sent=1`, request.url), { status: 303 });
  }

  return NextResponse.json({ ok: true });
}
