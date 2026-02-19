// app/api/auth/check-status/route.ts
// Pre-login check: returns account status so the login form can show appropriate messages
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ status: 'unknown' });
    }

    const { data: user } = await supabaseAdmin
      .from('registered_users')
      .select('is_approved, is_banned')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!user) {
      // User not found in registered_users — could be a company Google user or doesn't exist
      return NextResponse.json({ status: 'unknown' });
    }

    if (user.is_banned) {
      return NextResponse.json({ status: 'banned' });
    }

    if (!user.is_approved) {
      return NextResponse.json({ status: 'pending' });
    }

    return NextResponse.json({ status: 'active' });
  } catch {
    return NextResponse.json({ status: 'unknown' });
  }
}
