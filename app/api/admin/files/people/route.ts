// app/api/admin/files/people/route.ts
//
// F7 of FILE_EXPLORER_2026-06-25 — the company roster for the permissions
// user-picker. Any signed-in company user can read it (so a folder owner can
// share with a specific coworker); it returns only name/email/roles.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listCompanyPeople } from '@/lib/files/server';
import { ALL_ROLES, ROLE_LABELS } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const people = await listCompanyPeople();
  const roles = ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return NextResponse.json({ people, roles });
}
