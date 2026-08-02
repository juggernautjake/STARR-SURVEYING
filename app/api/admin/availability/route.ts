// app/api/admin/availability/route.ts — who and what is free on a given day (audit §2.4).
//
//   GET ?date=YYYY-MM-DD → { crew, equipment, vehicles } for that day.
//
// §2.4: *"Ten time/schedule surfaces … Four of them are calendars. A dispatcher deciding 'who and
// what is available Thursday' has to open three pages."*
//
// ── NOTHING HERE IS A NEW AVAILABILITY RULE ─────────────────────────────────────────────────────
//
// `lib/personnel/availability.ts` and `lib/equipment/availability.ts` already decide what "free"
// means — capacity overlaps, PTO, expired skills, calibration due, reservations. Both are wired to
// their own routes and their own dispatcher screens. Re-deriving either here would produce a second
// definition of availability that drifts from the one the reserve button enforces, which is worse
// than the three-pages problem it set out to fix: a dispatcher would be told somebody is free and
// then refused when they tried to book them.
//
// So this route asks both engines the same question about the same window and returns the answers
// side by side. It is a JOIN across three subsystems, not a fourth calendar.
//
// ── THE WINDOW IS THE WORKING DAY, IN THE FIRM'S TIMEZONE ───────────────────────────────────────
//
// A `date` is not an instant. Asking the engines about "Thursday" means picking a start and end, and
// picking UTC midnight would make a 7am Texas start read as Wednesday for six hours of every day.
// The firm's timezone comes from the tenant profile (item 8h) rather than the server's, because the
// server is in whatever region Vercel put it in.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { assessForSkillCohort } from '@/lib/personnel/availability';
import { assessCategory, type UnitAssessment } from '@/lib/equipment/availability';
import { DEFAULT_TIMEZONE, dayWindow, summariseDay, type VehicleDayRow } from '@/lib/scheduling/day-availability';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const roles = (session.user.roles ?? []) as string[];
  if (!isAdmin(session.user.roles) && !roles.includes('tech_support') && !roles.includes('equipment_manager')) {
    // Same read-side authorization as the two engines' own routes, so a dispatcher who can use one
    // of them is never told "free" by this page and "forbidden" by the page it links to.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const date = sp.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A date (YYYY-MM-DD) is required.' }, { status: 400 });
  }

  // The firm's own timezone, from the General settings section (seed 294 — `{companyName,
  // defaultState, jobNumberPrefix, timezone}`). NOT the server's: this runs in whichever region
  // Vercel put it in, and a Texas dispatcher asking about Thursday must not get six hours of
  // Wednesday because a data-centre in Virginia disagreed about when the day starts.
  const { data: general } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'general')
    .maybeSingle();
  const timezone = (general as { value?: { timezone?: string } } | null)?.value?.timezone || DEFAULT_TIMEZONE;

  const { from, to } = dayWindow(date, timezone);

  const [crewResult, categoriesResult, vehiclesResult] = await Promise.allSettled([
    // No skills required: the engine's documented fallback is "assess every registered user against
    // just the window", which is exactly the dispatcher's question before they have picked a job.
    assessForSkillCohort({ windowFrom: from, windowTo: to }),
    supabaseAdmin.from('equipment_inventory').select('category').is('retired_at', null),
    // `active` is the vehicles table's only availability fact (seed 225: "active = false hides from
    // the mobile picker but preserves historical references"). The compliance dates from seed 520
    // come with it, because a truck whose registration expired on Tuesday is not available on
    // Thursday no matter what the fleet list says — and that is precisely the kind of thing a
    // dispatcher finds out from a state trooper instead.
    supabaseAdmin
      .from('vehicles')
      .select('id, name, license_plate, active, registration_expires_on, inspection_expires_on, insurance_expires_on')
      .order('name'),
  ]);

  // Each of the three degrades on its own. A dispatcher who can see the crew but not the trucks is
  // better served than one who sees an error page, PROVIDED the page says which third is missing —
  // an absent column and an empty column are opposite facts.
  const degraded: string[] = [];

  const crew = crewResult.status === 'fulfilled' ? crewResult.value : [];
  if (crewResult.status === 'rejected') degraded.push('Crew availability could not be read.');

  let equipment: UnitAssessment[] = [];
  if (categoriesResult.status === 'fulfilled' && !categoriesResult.value.error) {
    const categories = [
      ...new Set(
        ((categoriesResult.value.data ?? []) as Array<{ category: string | null }>)
          .map((r) => r.category)
          .filter((c): c is string => !!c),
      ),
    ];
    // Per category because that is the engine's own entry point — it applies the calibration and
    // reservation rules per unit, and asking it category by category keeps those rules in one place.
    const perCategory = await Promise.allSettled(categories.map((c) => assessCategory(c, { windowFrom: from, windowTo: to })));
    for (const r of perCategory) {
      if (r.status === 'fulfilled') equipment.push(...r.value);
      else degraded.push('Some equipment categories could not be assessed.');
    }
    equipment = equipment.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  } else {
    degraded.push('Equipment availability could not be read.');
  }

  const vehicles: VehicleDayRow[] =
    vehiclesResult.status === 'fulfilled' && !vehiclesResult.value.error
      ? ((vehiclesResult.value.data ?? []) as VehicleDayRow[])
      : [];
  if (vehiclesResult.status === 'rejected' || (vehiclesResult.status === 'fulfilled' && vehiclesResult.value.error)) {
    degraded.push('Vehicles could not be read.');
  }

  return NextResponse.json(
    {
      date,
      timezone,
      window: { from, to },
      ...summariseDay(crew, equipment, vehicles, date),
      degraded,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
