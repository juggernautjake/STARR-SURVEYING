// app/api/admin/receptionist-test/token/route.ts — a Voice SDK token for "call from this browser".
//
// The browser dials the TwiML App (TWILIO_TWIML_APP_SID), whose voice URL is the receptionist's
// test entry. Tokens last an hour and are only issued to signed-in admins.
import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { voiceAccessToken, voiceAccessTokenConfigured, voiceIdentityFor } from '@/lib/twilio/access-token';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!voiceAccessTokenConfigured()) return NextResponse.json({ error: 'Browser calling is not configured: TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID are needed.' }, { status: 503 });
  const identity = voiceIdentityFor(session.user.email);
  return NextResponse.json({ token: voiceAccessToken(identity), identity, ttl: 3600 });
}, { routeName: 'admin/receptionist-test/token' });
