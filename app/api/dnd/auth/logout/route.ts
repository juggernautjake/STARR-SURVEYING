// app/api/dnd/auth/logout/route.ts — clear the dnd session (Phase B, B2).
import { NextResponse } from 'next/server';
import { clearDndSession } from '@/lib/dnd/auth';

export async function POST() {
  clearDndSession();
  return NextResponse.json({ ok: true });
}
