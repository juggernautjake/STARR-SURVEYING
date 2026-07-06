// app/api/dnd/auth/session/route.ts — current dnd user, or null (Phase B, B2).
import { NextResponse } from 'next/server';
import { getDndUser } from '@/lib/dnd/auth';

export async function GET() {
  const user = await getDndUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
    },
  });
}
