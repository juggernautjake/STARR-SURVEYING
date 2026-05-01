// app/api/admin/personnel/availability/route.ts
//
// GET /api/admin/personnel/availability
//   ?from=ISO&to=ISO
//   [&user_email=str | &skills=csv]
//   [&skills_are_soft=1]
//
// Phase F10.4-b — read-only personnel availability check. Wraps
// `lib/personnel/availability.ts`. Two modes:
//
//   user_email — assess a specific person against the window +
//                optional required skills. Returns one
//                PersonAssessment.
//   skills     — find every active user holding at least one
//                of the comma-separated skills, assess each.
//                Returns N PersonAssessments. Caller filters
//                client-side by `assignable=true` for the
//                "qualified + free" subset; the engine still
//                returns the blocked rows so the dispatcher
//                sees "Jacob has the cert but is on Job #422"
//                without a second call.
//   neither    — fall back to assessing every registered user
//                against just the window (for the bare PTO/
//                capacity calendar).
//
// Auth: admin / developer / tech_support / equipment_manager.
// Read-side authorization mirrors the equipment availability
// route exactly so the dispatcher's permission grants stay
// uniform.
import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  assessForSkillCohort,
  assessPerson,
  type PersonAssessment,
} from '@/lib/personnel/availability';

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support') &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');
    const userEmailRaw = searchParams.get('user_email');
    const skillsRaw = searchParams.get('skills');
    const skillsAreSoft = searchParams.get('skills_are_soft') === '1';

    if (!fromRaw || !toRaw) {
      return NextResponse.json(
        { error: '`from` and `to` (ISO timestamps) are required.' },
        { status: 400 }
      );
    }
    const fromTime = Date.parse(fromRaw);
    const toTime = Date.parse(toRaw);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return NextResponse.json(
        { error: '`from` and `to` must be parseable ISO timestamps.' },
        { status: 400 }
      );
    }
    if (toTime <= fromTime) {
      return NextResponse.json(
        { error: '`to` must be strictly after `from`.' },
        { status: 400 }
      );
    }

    const requiredSkills = (() => {
      if (!skillsRaw) return [] as string[];
      return skillsRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    })();

    const opts = {
      windowFrom: new Date(fromTime).toISOString(),
      windowTo: new Date(toTime).toISOString(),
      requiredSkills,
      skillsAreSoft,
    };

    let assessments: PersonAssessment[];
    if (userEmailRaw && userEmailRaw.trim()) {
      const single = await assessPerson(userEmailRaw.trim(), opts);
      if (!single) {
        return NextResponse.json(
          { error: 'User not found.' },
          { status: 404 }
        );
      }
      assessments = [single];
    } else {
      assessments = await assessForSkillCohort(opts);
    }

    const assignableCount = assessments.filter((a) => a.assignable).length;
    const blockedCount = assessments.length - assignableCount;

    console.log('[admin/personnel/availability GET]', {
      mode: userEmailRaw ? 'user' : 'cohort',
      skills: requiredSkills,
      from: opts.windowFrom,
      to: opts.windowTo,
      total: assessments.length,
      assignable: assignableCount,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      window: { from: opts.windowFrom, to: opts.windowTo },
      required_skills: requiredSkills,
      skills_are_soft: skillsAreSoft,
      assignable_count: assignableCount,
      blocked_count: blockedCount,
      assessments,
    });
  },
  { routeName: 'admin/personnel/availability#get' }
);
