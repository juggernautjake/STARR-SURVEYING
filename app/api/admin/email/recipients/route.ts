// app/api/admin/email/recipients/route.ts
// Recipient directory for the email composer (doc 04, slice EM2): returns
// employees (from registered_users) and customers (distinct lead contacts) so
// the sender can pick a known person instead of typing a raw address. Free-text
// is still allowed in the composer; this just powers the picker.
//
// GET /api/admin/email/recipients  →  { employees: [{name,email}], customers: [{name,email}] }

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface Recipient { name: string; email: string }

function titleCaseFromEmail(email: string): string {
  return (email.split('@')[0] || email)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Employees — registered users who aren't banned.
  const { data: users } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, is_banned')
    .order('name', { ascending: true });

  const employees: Recipient[] = (users || [])
    .filter((u: { email?: string; is_banned?: boolean }) => u.email && !u.is_banned)
    .map((u: { email: string; name?: string }) => ({
      email: u.email,
      name: (u.name && u.name.trim()) || titleCaseFromEmail(u.email),
    }));

  // Customers — distinct lead contacts that have an email, most recent first.
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('name, email, created_at')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  const seen = new Set<string>();
  const customers: Recipient[] = [];
  for (const l of (leads || []) as { name?: string; email?: string }[]) {
    const email = (l.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    customers.push({ email: l.email!.trim(), name: (l.name && l.name.trim()) || titleCaseFromEmail(email) });
  }

  return NextResponse.json({ employees, customers });
}, { routeName: 'admin/email/recipients' });
