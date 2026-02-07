// app/api/admin/messages/preferences/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Get user's messaging preferences
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('messaging_preferences')
    .select('*')
    .eq('user_email', session.user.email)
    .single();

  // Return defaults if no preferences set
  if (!data) {
    return NextResponse.json({
      preferences: {
        notifications_enabled: true,
        sound_enabled: true,
        desktop_notifications: true,
        email_notifications: false,
        auto_archive_days: 0,
        theme: 'default',
      },
    });
  }

  return NextResponse.json({ preferences: data });
}, { routeName: 'messages/preferences' });

// PUT: Update messaging preferences
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from('messaging_preferences')
    .upsert({
      user_email: session.user.email,
      ...body,
    }, { onConflict: 'user_email' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data });
}, { routeName: 'messages/preferences' });
