// app/api/admin/people/route.ts — one directory of everyone (platform audit §2.3 / Phase 1 item 7).
//
// GET ?q=&filter=all|staff|field|contacts → { people }
//
// ── TEN ROUTES, ONE NOUN ────────────────────────────────────────────────────────────────────────
//
// §2.3 counted ten routes describing one thing: /admin/employees, /admin/employees/manage,
// /admin/users, /admin/team, /admin/contacts, /admin/messages/contacts, plus four `[email]` detail
// pages. Three of those list pages already read the SAME TABLE — `registered_users` — and differ
// only in which columns they join and which subset they show.
//
// So the lists were never really different pages. They were three filters wearing page costumes,
// and this route is the filter made explicit: one query, one shape, one place that decides who
// counts as staff.
//
// ── CONTACTS ARE NOT STAFF, AND ARE NOT MERGED ──────────────────────────────────────────────────
//
// `contacts` is a CRM table: realtors, clients, title companies. It overlaps with staff (some
// employees are in it) but it is not the same population, and a merge would have to decide what to
// do when a contact row and a user row disagree about somebody's phone number. They are returned as
// separate `kind`s, so the directory shows one list and the reader can still tell a colleague from a
// customer — which is exactly the distinction a merged record would destroy.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';

export type PersonKind = 'staff' | 'contact';

export interface PersonRow {
  kind: PersonKind;
  /** Staff are keyed by email (every detail route in the app already is); contacts by id. */
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Job title for staff, contact type for a contact. */
  subtitle: string | null;
  roles: string[];
  avatarUrl: string | null;
  active: boolean;
  /** True when this person is on the clock right now. Only ever set for staff. */
  onTheClock?: boolean;
}

interface StaffRow {
  email: string | null;
  name: string | null;
  roles: string[] | null;
  avatar_url: string | null;
  is_approved: boolean | null;
  is_banned: boolean | null;
}

interface ProfileRow {
  user_email: string | null;
  job_title: string | null;
  is_active: boolean | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const roles = session.user.roles ?? [];
  // The directory itself is open to staff — a crew member looking up a colleague's number is the
  // most common use of it. Roles and account state are admin-only and stripped below.
  const canSeeAccounts = isAdmin(roles) || isDeveloper(roles);

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const filter = url.searchParams.get('filter') ?? 'all';

  const wantStaff = filter === 'all' || filter === 'staff' || filter === 'field';
  const wantContacts = filter === 'all' || filter === 'contacts';

  const [staffRes, profileRes, contactRes, clockRes] = await Promise.all([
    wantStaff
      ? supabaseAdmin.from('registered_users').select('email, name, roles, avatar_url, is_approved, is_banned')
      : Promise.resolve({ data: [], error: null }),
    wantStaff
      ? supabaseAdmin.from('employee_profiles').select('user_email, job_title, is_active')
      : Promise.resolve({ data: [], error: null }),
    wantContacts
      // `title` and `company`, not a `contact_type` column — verified against the live schema rather
      // than guessed from the page that renders it.
      ? supabaseAdmin.from('contacts').select('id, name, email, phone, title, company').limit(500)
      : Promise.resolve({ data: [], error: null }),
    // Who is clocked in — the whole content of the old /admin/team page, as one column here.
    wantStaff
      ? supabaseAdmin.from('active_clock_sessions').select('user_email')
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profiles = new Map(
    ((profileRes.data ?? []) as ProfileRow[]).map((p) => [p.user_email ?? '', p]),
  );
  const clockedIn = new Set(
    ((clockRes.data ?? []) as Array<{ user_email: string | null }>).map((c) => c.user_email ?? ''),
  );

  const staff: PersonRow[] = ((staffRes.data ?? []) as StaffRow[])
    .filter((u) => !!u.email)
    .map((u) => {
      const profile = profiles.get(u.email as string);
      return {
        kind: 'staff' as const,
        key: u.email as string,
        name: u.name || (u.email as string),
        email: u.email,
        phone: null,
        subtitle: profile?.job_title ?? null,
        // An employee's role list tells you what they can do in the software. Showing it to
        // everybody turns a phone directory into an access map.
        roles: canSeeAccounts ? (u.roles ?? []) : [],
        avatarUrl: u.avatar_url,
        active: u.is_banned !== true && u.is_approved !== false && profile?.is_active !== false,
        onTheClock: clockedIn.has(u.email as string),
      };
    });

  const contacts: PersonRow[] = ((contactRes.data ?? []) as Array<{
    id: string; name: string | null; email: string | null; phone: string | null; title: string | null; company: string | null;
  }>).map((c) => ({
    kind: 'contact' as const,
    key: c.id,
    name: c.name || c.email || 'Unnamed contact',
    email: c.email,
    phone: c.phone,
    // "Title at Company" reads as one fact; either alone is what we have when only one is filled in.
    subtitle: [c.title, c.company].filter(Boolean).join(' · ') || null,
    roles: [],
    avatarUrl: null,
    active: true,
  }));

  let people = [...staff, ...contacts];
  // "In the field" is a filter on the same list, not a different page. That was §2.3's whole point.
  if (filter === 'field') people = people.filter((p) => p.onTheClock);
  if (q) {
    people = people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.subtitle ?? '').toLowerCase().includes(q),
    );
  }
  people.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    { people, canSeeAccounts },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
