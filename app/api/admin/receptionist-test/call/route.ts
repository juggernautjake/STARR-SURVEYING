// app/api/admin/receptionist-test/call/route.ts — ring the tester's own phone with the receptionist.
//
// The developer page's "Call my phone" button. Places a real outbound call from the business line
// to the number given, running /api/twilio/receptionist/test-entry when it is answered. Same voice,
// same relay, same latency as a customer call; flagged as a test so nobody is alerted.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createCall, twilioConfigured } from '@/lib/twilio/rest';
import { SITE_URL } from '@/lib/seo/business';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  if (!twilioConfigured()) return NextResponse.json({ error: 'Twilio is not configured on this deployment.' }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const digits = (body.to ?? '').replace(/\D/g, '');
  const to = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '';
  if (!to) return NextResponse.json({ error: 'Enter a 10-digit US phone number.' }, { status: 400 });
  const from = (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').trim();
  if (!from) return NextResponse.json({ error: 'TWILIO_FROM_NUMBER is not set.' }, { status: 503 });
  const call = await createCall({ to, from, url: `${SITE_URL}/api/twilio/receptionist/test-entry`, statusCallback: `${SITE_URL}/api/twilio/status` });
  console.log(`[receptionist-test] ${gate.email} placed test call ${call.sid} to ${to}`);
  return NextResponse.json({ callSid: call.sid, status: call.status, to });
}, { routeName: 'admin/receptionist-test/call' });
