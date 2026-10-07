// app/api/phone-tap — the website reports a tap on the business phone number.
//
// Owner, 2026-10-06: one number for the business, no call-tracking numbers — so the only way to tie a
// phone call to an ad is to notice the visitor tapping the number and match the call that follows by
// time (lib/receptionist/call-source.ts). This is the noticing half.
//
// PUBLIC BY DESIGN, and deliberately small: no auth (the visitor has none), a per-IP rate limit, a
// size cap on every field, and nothing stored that identifies a person — no IP, no number. It always
// answers 204, because the browser sends it with navigator.sendBeacon as the page hands over to the
// phone app and nobody is waiting for the answer.
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseTapReport } from '@/lib/receptionist/tap-report';

export const dynamic = 'force-dynamic';

function clientIpOf(request: NextRequest): string {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
}

export async function POST(request: NextRequest): Promise<Response> {
  const done = new Response(null, { status: 204 });
  try {
    const limited = await enforceRateLimit('public-lookup', null, { ip: clientIpOf(request) });
    if (limited) return done;
    const raw = await request.text();
    if (raw.length > 4000) return done;
    const row = parseTapReport(raw, request.headers.get('user-agent'));
    if (!row) return done;
    const { error } = await supabaseAdmin.from('phone_taps').insert(row);
    if (error) console.error('[phone-tap] insert failed:', error.message);
  } catch (err) {
    console.error('[phone-tap] failed:', err);
  }
  return done;
}
