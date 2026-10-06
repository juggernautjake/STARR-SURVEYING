// lib/hours/caller.ts — who is posting these hours: a web session, or the mobile app.
//
// The web signs in with next-auth; the mobile app signs in with Supabase Auth and has no next-auth
// cookie. Until 2026-10-05 the mobile app had no way to reach the hours API at all — its clock-outs
// were written to the phone's local database and (with PowerSync never configured) stayed there,
// so not one mobile hour ever reached the approvals page.
//
// A request carrying `Authorization: Bearer <supabase access token>` is verified with Supabase
// (`auth.getUser` checks the signature and expiry server-side), and the person's roles come from
// `registered_users` exactly as a web session's do. A token for somebody with no registered account
// is refused: a valid Supabase login is not, by itself, a member of staff.

import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { UserRole } from '@/lib/auth-roles';

export interface HoursCaller {
  user: { email: string; roles: UserRole[]; name?: string | null };
  /** 'web' for a next-auth session, 'mobile' for a Supabase bearer token. */
  via: 'web' | 'mobile';
}

export async function resolveHoursCaller(req: NextRequest): Promise<HoursCaller | null> {
  const session = await auth();
  if (session?.user?.email) {
    return {
      user: {
        email: session.user.email,
        roles: (session.user.roles ?? []) as UserRole[],
        name: session.user.name,
      },
      via: 'web',
    };
  }

  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const email = data?.user?.email?.toLowerCase();
    if (error || !email) return null;

    const { data: account } = await supabaseAdmin
      .from('registered_users')
      .select('email, name, roles, is_banned, is_approved')
      .eq('email', email) // exact: `ilike` would treat '_' in an address as a wildcard
      .maybeSingle();
    const flags = account as { is_banned?: boolean; is_approved?: boolean } | null;
    if (!flags || flags.is_banned || flags.is_approved === false) return null;

    return {
      user: {
        email,
        roles: ((account as { roles?: UserRole[] }).roles ?? []) as UserRole[],
        name: (account as { name?: string | null }).name ?? null,
      },
      via: 'mobile',
    };
  } catch {
    return null;
  }
}
