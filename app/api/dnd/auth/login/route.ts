// app/api/dnd/auth/login/route.ts — email + password login (Phase B, B2).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyPassword, setDndSession } from '@/lib/dnd/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const { data: user } = await supabaseAdmin
      .from('dnd_users')
      .select('id, email, display_name, avatar_url, password_hash')
      .eq('email', emailNorm)
      .maybeSingle();

    // constant-ish response to avoid leaking which emails exist
    if (!user || !user.password_hash || !(await verifyPassword(String(password), user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    setDndSession({ id: user.id, email: user.email, display_name: user.display_name });
    return NextResponse.json({
      user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Login failed.' }, { status: 500 });
  }
}
