// app/admin/employees/[email]/page.tsx
//
// Slice EP7a (employee-profile-buildout-2026-06-17) — basic public
// per-user profile page. Reuses the existing payroll/employees API
// to read the profile row + certifications. Server component so the
// route is crawlable from the nav + deep-linkable from anywhere
// (the employee pond's dialogue + the messages contact list both
// land here in future slices).
//
// View-only for now; later slices add edit-on-behalf-of for admins,
// surface the EP2 contact methods, render the EP6 salary/bonuses
// (with the role-gated guard), and the EP5 "jobs worked on" list.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { deriveAge } from '../../profile/ProfilePanel';

interface Profile {
  user_email: string;
  user_name: string | null;
  job_title: string | null;
  hire_date: string | null;
  hourly_rate: number | null;
  is_active: boolean | null;
  date_of_birth: string | null;
  gender: string | null;
  pronouns: string | null;
  bio: string | null;
}

interface Cert {
  id: string;
  certification_name: string;
  certification_type: string;
  issued_date: string;
  expiry_date: string | null;
}

interface ContactMethod {
  id: string;
  kind: 'phone' | 'email' | 'address';
  value: string;
  label: string | null;
  is_primary: boolean;
}

interface PageProps {
  params: Promise<{ email: string }>;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); }
  catch { return d; }
}

function fmtCurrency(n: number | null): string {
  if (n == null) return '—';
  return '$' + n.toFixed(2);
}

export default async function EmployeeProfilePage({ params }: PageProps) {
  const { email: emailParam } = await params;
  const email = decodeURIComponent(emailParam).toLowerCase();

  const session = await auth();
  if (!session?.user?.email) {
    // Auth middleware will redirect to /admin/login; this branch
    // is defensive.
    notFound();
  }

  const isSelf = session.user.email === email;
  const viewerIsAdmin = isAdmin(session.user.roles);
  // Slice EP7a — anyone in the admin layout can VIEW any
  // employee's public profile. Pay-sensitive fields (salary
  // history, bonuses) are gated to self + payroll admins via the
  // EP6 follow-up. Today this page hides hourly_rate when the
  // viewer is neither self nor admin.

  const { data: profile } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name, job_title, hire_date, hourly_rate, is_active, date_of_birth, gender, pronouns, bio')
    .eq('user_email', email)
    .maybeSingle<Profile>();

  if (!profile) notFound();

  const { data: certs } = await supabaseAdmin
    .from('employee_certifications')
    .select('id, certification_name, certification_type, issued_date, expiry_date')
    .eq('user_email', email)
    .order('issued_date', { ascending: false })
    .returns<Cert[]>();

  const { data: contacts } = await supabaseAdmin
    .from('employee_contact_methods')
    .select('id, kind, value, label, is_primary')
    .eq('user_email', email)
    .order('kind', { ascending: true })
    .order('is_primary', { ascending: false })
    .returns<ContactMethod[]>();

  const age = deriveAge(profile.date_of_birth);
  const canSeePay = isSelf || viewerIsAdmin;
  const contactRows: ContactMethod[] = contacts ?? [];
  const certRows: Cert[] = certs ?? [];
  const phones = contactRows.filter((c) => c.kind === 'phone');
  const emails = contactRows.filter((c) => c.kind === 'email');
  const addresses = contactRows.filter((c) => c.kind === 'address');

  return (
    <div className="profile-page" data-testid="employee-profile-page">
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--color-brand-navy)',
              color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Sora,sans-serif', fontSize: '1.4rem', fontWeight: 700,
            }}
            aria-hidden
          >
            {(profile.user_name ?? email).charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontFamily: 'Sora,sans-serif', fontSize: '1.4rem', fontWeight: 700 }}>
              {profile.user_name ?? email}
            </h1>
            <div style={{ color: '#6B7280', fontSize: '0.85rem' }}>{email}</div>
            {profile.job_title && (
              <div style={{ color: '#374151', fontSize: '0.9rem', marginTop: '0.25rem' }}>{profile.job_title}</div>
            )}
          </div>
          {isSelf && (
            <Link href="/admin/me?tab=profile" className="admin-btn admin-btn--secondary admin-btn--sm">
              Edit my profile
            </Link>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: '1rem' }} data-testid="employee-profile-personal">
        <h2 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600 }}>Personal info</h2>
        <div className="emp-manage__field"><label>Pronouns</label><span>{profile.pronouns?.trim() || 'Not set'}</span></div>
        <div className="emp-manage__field"><label>Gender</label><span>{profile.gender?.trim() || 'Not set'}</span></div>
        <div className="emp-manage__field"><label>Date of birth</label><span>{fmtDate(profile.date_of_birth)}</span></div>
        <div className="emp-manage__field"><label>Age</label><span>{age == null ? '—' : `${age} years`}</span></div>
        <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <label>About</label>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>{profile.bio?.trim() || 'Not set'}</p>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: '1rem' }} data-testid="employee-profile-contacts">
        <h2 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600 }}>Contact</h2>
        <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <label>Phones</label>
          {phones.length === 0 ? <span>Not set</span> : (
            <ul style={{ margin: 0, paddingLeft: '1rem' }}>
              {phones.map((c) => (
                <li key={c.id}>
                  {c.value}
                  {c.label && <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· {c.label}</span>}
                  {c.is_primary && <span style={{ color: 'var(--color-brand-navy)', marginLeft: '0.5rem' }}>(primary)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <label>Emails</label>
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            <li>
              {email}
              <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· auth email</span>
            </li>
            {emails.map((c) => (
              <li key={c.id}>
                {c.value}
                {c.label && <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· {c.label}</span>}
                {c.is_primary && <span style={{ color: 'var(--color-brand-navy)', marginLeft: '0.5rem' }}>(primary)</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="emp-manage__field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <label>Addresses</label>
          {addresses.length === 0 ? <span>Not set</span> : (
            <ul style={{ margin: 0, paddingLeft: '1rem' }}>
              {addresses.map((c) => (
                <li key={c.id} style={{ whiteSpace: 'pre-wrap' }}>
                  {c.value}
                  {c.label && <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· {c.label}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: '1rem' }} data-testid="employee-profile-work">
        <h2 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600 }}>Work</h2>
        <div className="emp-manage__field"><label>Hire date</label><span>{fmtDate(profile.hire_date)}</span></div>
        <div className="emp-manage__field"><label>Status</label><span>{profile.is_active === false ? 'Inactive' : 'Active'}</span></div>
        {canSeePay && (
          <div className="emp-manage__field" data-testid="employee-profile-pay">
            <label>Hourly rate</label>
            <span>{fmtCurrency(profile.hourly_rate)}/hr</span>
          </div>
        )}
      </div>

      <div className="admin-card" data-testid="employee-profile-credentials">
        <h2 style={{ marginTop: 0, fontSize: '1rem', fontWeight: 600 }}>Credentials</h2>
        {certRows.length === 0 ? (
          <p style={{ color: '#6B7280', margin: 0 }}>No credentials on file.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            {certRows.map((c) => (
              <li key={c.id}>
                <strong>{c.certification_name}</strong>
                <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· {c.certification_type}</span>
                <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· issued {fmtDate(c.issued_date)}</span>
                {c.expiry_date && (
                  <span style={{ color: '#6B7280', marginLeft: '0.5rem' }}>· expires {fmtDate(c.expiry_date)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
