// app/api/voice/auth/logout/route.ts — sign out.
//
// GET, not POST, and that is a deliberate exception to the usual rule that state-changing requests
// must not be GETs. The rule exists to stop a third-party page triggering an action by embedding an
// <img src="...">. Here the worst outcome of that attack is that Andrew is signed out — annoying,
// not harmful, and reversible in five seconds — while making it a POST would mean the sign-out link
// in the navigation had to be a form, which breaks it inside the "More" sheet on a phone.
//
// A destructive action would not get this treatment. Sign-out is the one place the trade is worth it.

import { NextResponse } from 'next/server';
import { clearVoiceSession } from '@/lib/voice/auth';
import { BASE_PATH } from '@/lib/voice/content';

export async function GET(request: Request): Promise<NextResponse> {
  clearVoiceSession();
  return NextResponse.redirect(new URL(BASE_PATH, request.url));
}

export async function POST(request: Request): Promise<NextResponse> {
  clearVoiceSession();
  return NextResponse.redirect(new URL(BASE_PATH, request.url), { status: 303 });
}
