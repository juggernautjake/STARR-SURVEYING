// app/api/admin/calls/[id]/recording/route.ts — play the recording.
//
// Twilio recording URLs need the account's auth, which must never reach the browser. This route
// checks the admin session, fetches the audio with the server-side credentials, and streams it.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getCall } from '@/lib/receptionist/calls';
import { fetchRecording, twilioConfigured } from '@/lib/twilio/rest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const segs = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segs[segs.length - 2];
  if (!id) return NextResponse.json({ error: 'Missing call id' }, { status: 400 });
  const call = await getCall(supabaseAdmin, id);
  if (!call?.recording_url) return NextResponse.json({ error: 'No recording for this call' }, { status: 404 });
  if (!twilioConfigured()) return NextResponse.json({ error: 'Twilio is not configured' }, { status: 503 });
  const upstream = await fetchRecording(call.recording_url, 'mp3');
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `Twilio returned ${upstream.status}` }, { status: 502 });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'private, max-age=3600',
      'content-disposition': `inline; filename="call-${call.started_at.slice(0, 10)}-${call.from_number.replace(/\D/g, '')}.mp3"`,
    },
  });
}
