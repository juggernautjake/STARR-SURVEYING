// app/AndrewAsh/studio/coaching/page.tsx — students and rates.
//
// Coaching is the reliable floor under a business whose voice-over income is lumpy, so this page
// leads with the number that says how solid that floor is: monthly recurring value from active
// students. Ten weekly students at $55 is $2,200 a month before a single voice-over job.
//
// The packages Andrew has not customised are the researched defaults from `lib/voice/settings.ts` —
// shown here as real cards with a nudge to adopt them, so "my rates" is one click rather than a
// data-entry exercise.

import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

import PackageEditor from './PackageEditor';
import StudentList from './StudentList';
import { supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_PACKAGES } from '@/lib/voice/settings';
import { formatCents } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Coaching' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function CoachingPage(): Promise<React.ReactElement> {
  let packages: any[] = [];
  let students: any[] = [];
  let clients: any[] = [];
  try {
    const [pk, st, cl] = await Promise.all([
      supabaseAdmin.from('va_coaching_packages').select('*').order('sort_order').limit(50),
      supabaseAdmin
        .from('va_coaching_students')
        .select('*, client:va_clients(id, name, email), package:va_coaching_packages(id, name, price_cents, session_count)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin.from('va_clients').select('id, name').in('relationship', ['coaching', 'both']).order('name'),
    ]);
    packages = pk.data ?? [];
    students = st.data ?? [];
    clients = cl.data ?? [];
  } catch {
    packages = [];
    students = [];
    clients = [];
  }

  const active = students.filter((s) => s.status === 'active');

  // Value per active student, from what their package costs divided across its sessions — an
  // approximation of monthly value, and the honest one available without a scheduling system.
  const perStudentMonthly = active.reduce((sum, s) => {
    const price = s.package?.price_cents ?? 0;
    const count = Math.max(1, s.package?.session_count ?? 1);
    // Roughly four lessons a month at a weekly cadence.
    return sum + Math.round((price / count) * 4);
  }, 0);

  const sessionsOwed = active.reduce(
    (sum, s) => sum + Math.max(0, (s.sessions_purchased ?? 0) - (s.sessions_used ?? 0)),
    0,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Coaching</h1>
          <p className="vaStudioSub">
            The steady half of the business. Predictable, it compounds, and it needs no gatekeepers —
            see{' '}
            <Link href={`${BASE_PATH}/studio/guide#coaching-rates`} style={{ color: 'var(--va-accent)' }}>
              what to charge
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="vaTiles">
        <div className="vaTile">
          <span className="vaTileLabel">Active students</span>
          <span className="vaTileValue">{active.length}</span>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Roughly per month</span>
          <span className="vaTileValue vaTileValueAccent">{formatCents(perStudentMonthly)}</span>
          <p className="vaTileNote">If everyone keeps a weekly cadence.</p>
        </div>
        <div className="vaTile">
          <span className="vaTileLabel">Lessons owed</span>
          <span className="vaTileValue">{sessionsOwed}</span>
          <p className="vaTileNote">Paid for and not yet taught.</p>
        </div>
      </div>

      <PackageEditor
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          blurb: p.blurb ?? '',
          priceCents: p.price_cents,
          sessionCount: p.session_count,
          sessionMinutes: p.session_minutes,
          highlighted: p.highlighted,
          active: p.active,
          inclusions: Array.isArray(p.inclusions) ? p.inclusions : [],
        }))}
        defaults={DEFAULT_PACKAGES.map((p) => ({
          name: p.name,
          blurb: p.blurb ?? '',
          priceCents: p.priceCents,
          sessionCount: p.sessionCount,
          sessionMinutes: p.sessionMinutes,
          highlighted: p.highlighted,
          inclusions: p.inclusions,
        }))}
      />

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <GraduationCap size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            Students
          </h2>
        </div>
        <StudentList
          students={students.map((s) => ({
            id: s.id,
            name: s.client?.name ?? 'Unknown',
            email: s.client?.email ?? '',
            packageName: s.package?.name ?? null,
            goals: s.goals ?? '',
            notes: s.notes ?? '',
            status: s.status,
            sessionsPurchased: s.sessions_purchased ?? 0,
            sessionsUsed: s.sessions_used ?? 0,
          }))}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          packages={packages.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, sessionCount: p.session_count }))}
        />
      </div>
    </>
  );
}
