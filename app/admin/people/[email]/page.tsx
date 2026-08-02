// app/admin/people/[email]/page.tsx — the one Person record (platform audit §2.3 / Phase 1 item 7).
//
// §2.3's recommendation: *"one `/admin/people/[id]` profile with tabs (Profile · Roles & Access ·
// Pay · Hours · Equipment · Certifications · History)"*.
//
// ── THE TABS LINK OUT; THEY DO NOT REIMPLEMENT ──────────────────────────────────────────────────
//
// The obvious build is to pull Pay, Hours, Equipment and Certifications INTO this page. That is the
// build that creates §1.3's defect again — two surfaces rendering the same data, drifting the first
// time somebody fixes a rounding bug in one of them. Payroll already owns pay. Hours-approval
// already owns hours. Each of those pages is the authority for its subject and stays that way.
//
// What was missing was not a place to see pay; it was a place that knows WHICH person you are
// looking at and can hand that identity to every page that has an answer about them. The ten routes
// exist because each was reached from its own list; the tabs below reach them all from one.
//
// ── KEYED BY EMAIL, LIKE EVERYTHING ELSE HERE ───────────────────────────────────────────────────
//
// The audit wrote `[id]`. Every existing detail route in this app — /admin/team/[email],
// /admin/payroll/[email], /admin/pay-progression/[email] — is keyed by email, and `registered_users`
// treats it as unique. A `[id]` route would have to translate at every hand-off, and the translation
// is where somebody eventually gets shown the wrong person's pay.
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { auth, isAdmin, isDeveloper } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import '../People.css';

export const dynamic = 'force-dynamic';

interface StaffRecord {
  email: string;
  name: string | null;
  roles: string[] | null;
  avatar_url: string | null;
  is_approved: boolean | null;
  is_banned: boolean | null;
  last_sign_in: string | null;
  created_at: string | null;
}

interface ProfileRecord {
  job_title: string | null;
  hire_date: string | null;
  is_active: boolean | null;
  salary_type: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '—';
}

export default async function PersonPage({ params }: { params: { email: string } }) {
  const session = await auth();
  if (!session?.user?.email) redirect('/admin/login');

  const email = decodeURIComponent(params.email);
  const roles = session.user.roles ?? [];
  const isPrivileged = isAdmin(roles) || isDeveloper(roles);
  const isSelf = session.user.email.toLowerCase() === email.toLowerCase();

  const [{ data: user }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from('registered_users')
      .select('email, name, roles, avatar_url, is_approved, is_banned, last_sign_in, created_at')
      .eq('email', email)
      .maybeSingle(),
    supabaseAdmin
      .from('employee_profiles')
      .select('job_title, hire_date, is_active, salary_type')
      .eq('user_email', email)
      .maybeSingle(),
  ]);

  if (!user) notFound();
  const person = user as StaffRecord;
  const emp = (profile ?? null) as ProfileRecord | null;

  // The tabs are gated by what the VIEWER may see, not by what exists. A crew member looking up a
  // colleague's number gets the profile and the contact details; they do not get a link to that
  // person's pay, and the pages behind these links enforce the same rule themselves — this list
  // being wrong must not be the only thing standing between somebody and a payroll record.
  const tabs: Array<{ href: string; label: string; note: string }> = [];
  if (isPrivileged) {
    tabs.push(
      { href: `/admin/employees/manage?email=${encodeURIComponent(email)}`, label: 'Employment', note: 'Job title, hire date, pay rate' },
      { href: '/admin/users', label: 'Roles & access', note: 'What they can reach in the app' },
      { href: `/admin/payroll/${encodeURIComponent(email)}`, label: 'Pay', note: 'Payroll history' },
      { href: `/admin/pay-progression/${encodeURIComponent(email)}`, label: 'Pay progression', note: 'Rate over time' },
      { href: `/admin/team/${encodeURIComponent(email)}`, label: 'Field status', note: 'Where they are, what they are on' },
      { href: '/admin/hours-approval', label: 'Hours', note: 'Timesheets awaiting approval' },
      { href: '/admin/compliance', label: 'Certifications', note: 'Licences and expiry dates' },
      { href: `/admin/employees/manage/${encodeURIComponent(email)}/history`, label: 'History', note: 'Changes to their record' },
    );
  } else if (isSelf) {
    // Your own record, through the surfaces that already exist for it.
    tabs.push(
      { href: '/admin/me?tab=pay', label: 'My pay', note: 'Your pay and payouts' },
      { href: '/admin/me?tab=hours', label: 'My hours', note: 'Your timesheet' },
    );
  }

  const active = person.is_banned !== true && person.is_approved !== false && emp?.is_active !== false;

  return (
    <div className="person">
      <div className="person__head">
        <span className="person__avatar" aria-hidden>
          {person.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={person.avatar_url} alt="" />
            : <UserRound size={26} />}
        </span>
        <div>
          <h1 className="person__name">{person.name || person.email}</h1>
          <p className="person__sub">
            {emp?.job_title || 'No job title on record'}
            {active ? '' : ' · inactive'}
          </p>
        </div>
      </div>

      <Link href="/admin/people" style={{ fontSize: '0.82rem' }}>← All people</Link>

      {tabs.length > 0 ? (
        <nav className="person__tabs" aria-label="This person">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="person__tab" title={t.note}>
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <dl className="person__facts">
        <div className="person__fact">
          <dt>Email</dt>
          <dd>{person.email}</dd>
        </div>
        <div className="person__fact">
          <dt>Hired</dt>
          <dd>{formatDate(emp?.hire_date ?? null)}</dd>
        </div>
        <div className="person__fact">
          <dt>Account created</dt>
          <dd>{formatDate(person.created_at)}</dd>
        </div>
        <div className="person__fact">
          <dt>Last signed in</dt>
          <dd>{formatDate(person.last_sign_in)}</dd>
        </div>
        {isPrivileged ? (
          <div className="person__fact">
            <dt>Roles</dt>
            {/* Said plainly rather than rendered as an empty list. "No roles" is a real state — a
                registered account nobody has granted anything to — and an empty row reads as a
                loading failure. */}
            <dd>{(person.roles ?? []).join(', ') || 'None granted'}</dd>
          </div>
        ) : null}
        {isPrivileged && emp?.salary_type ? (
          <div className="person__fact">
            <dt>Paid as</dt>
            <dd>{emp.salary_type}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
