// app/api/admin/payroll/employees/route.ts — Employee profiles & pay management
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { isPayoutMethod } from '@/lib/payouts/methods';

// GET: Get employee profile(s)
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const includeInactive = searchParams.get('include_inactive') === 'true';

  // Non-admins can only see their own profile
  if (!isAdmin(session.user.roles) && email && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (email || !isAdmin(session.user.roles)) {
    const targetEmail = email || session.user.email;
    const { data, error } = await supabaseAdmin
      .from('employee_profiles')
      .select('*')
      .eq('user_email', targetEmail)
      .single();

    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ profile: null, exists: false });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get certifications
    const { data: certs } = await supabaseAdmin
      .from('employee_certifications')
      .select('*')
      .eq('user_email', targetEmail)
      .order('created_at', { ascending: false });

    // Get raise history
    const { data: raises } = await supabaseAdmin
      .from('pay_raises')
      .select('*')
      .eq('user_email', targetEmail)
      .order('effective_date', { ascending: false });

    // Get latest raise for next review date
    const nextReview = raises && raises.length > 0 ? raises[0].next_review_date : null;

    return NextResponse.json({
      profile: data,
      certifications: certs || [],
      raise_history: raises || [],
      next_review_date: nextReview,
      exists: true,
    });
  }

  // Admin: list all employees
  let query = supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .order('user_name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── STAFF WITH NO PAY RECORD ARE STILL STAFF (owner report, 2026-08-04) ──────────────────────
  //
  // *"Make sure the payroll page is fully hooked up to show all of employees and their positions and
  // their current pay level. Make sure we can manually set people's pay too."*
  //
  // It was hooked up — to `employee_profiles`, which has **one row**. The firm has **six** registered
  // users. So five of six were invisible on the payroll page, and the page read as "we have one
  // employee" rather than "five people have no pay set".
  //
  // Those are opposite statements, and only one of them is a to-do list. An absence rendered as an
  // empty set is the defect this codebase keeps finding; here it hides the exact thing the owner
  // needs to act on — a person who works here and has no rate.
  //
  // So the list is every staff member, with the profile attached where one exists. `hasProfile: false`
  // rows carry no invented rate: `hourly_rate` stays null rather than 0, because a zero would total
  // into the payroll figures and read as "paid nothing" instead of "not yet set".
  const withProfile = new Set((data ?? []).map((e: { user_email: string }) => e.user_email.toLowerCase()));

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, roles')
    .order('name', { ascending: true });

  if (staffError) {
    // Named, not swallowed — but the profiles we DID read are still worth returning. Losing the
    // whole page because the roster query failed would be a worse outcome than a partial list that
    // says so.
    console.error('[payroll/employees] could not read the staff roster:', staffError.message);
    return NextResponse.json({ employees: data ?? [], rosterUnavailable: true });
  }

  const unpaid = (staff ?? [])
    .filter((u: { email: string; roles: string[] | null }) =>
      !withProfile.has(u.email.toLowerCase()) && (u.roles ?? []).includes('employee'))
    .map((u: { email: string; name: string | null }) => ({
      // A staff member with no `employee_profiles` row has no profile id, and this object shipped
      // without an `id` at all — so the payroll page rendered five of the firm's six people with
      // `key={undefined}`. React warned, and the real cost is worse than the warning: unkeyed
      // siblings reconcile by POSITION, so re-sorting or filtering the roster can leave one
      // person's name above another person's pay.
      //
      // Prefixed rather than bare, and email rather than an index: an index is not stable across a
      // filter, and a bare email could be mistaken for a profile id by anything that later reads
      // this field. `id` is only ever used as a key here — the row is addressed by `user_email`.
      id: `no-profile:${u.email.toLowerCase()}`,
      user_email: u.email,
      user_name: u.name ?? u.email,
      job_title: null,
      hourly_rate: null,
      salary_type: null,
      hire_date: null,
      available_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      is_active: true,
      /** The flag the UI keys off to offer "Set pay" instead of showing a rate. */
      hasProfile: false,
    }));

  return NextResponse.json({
    employees: [...(data ?? []).map((e: Record<string, unknown>) => ({ ...e, hasProfile: true })), ...unpaid],
  });
}, { routeName: 'payroll/employees' });

// POST: Create or update employee profile (admin only for others, self for own)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { user_email, ...profileData } = body;

  const targetEmail = user_email || session.user.email;

  // Non-admins can only update limited fields on their own profile
  if (!isAdmin(session.user.roles)) {
    if (targetEmail !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Self-edit fields. EP1 adds the personal-info quartet (DOB,
    // gender, pronouns, bio) alongside the existing bank-info +
    // user-name fields the surveyor was already allowed to change.
    const allowed = {
      user_email: targetEmail,
      user_name: profileData.user_name,
      bank_name: profileData.bank_name,
      bank_routing_last4: profileData.bank_routing_last4,
      bank_account_last4: profileData.bank_account_last4,
      bank_account_type: profileData.bank_account_type,
      // Slice EP1 — personal info. Strings are trimmed; an empty
      // string lands as NULL so the column doesn't fill with
      // whitespace placeholders.
      date_of_birth: normalizeDob(profileData.date_of_birth),
      gender: normalizeText(profileData.gender),
      pronouns: normalizeText(profileData.pronouns),
      bio: normalizeText(profileData.bio),
    };

    const { data, error } = await supabaseAdmin
      .from('employee_profiles')
      .upsert(allowed, { onConflict: 'user_email' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  }

  // ── "ADD" MUST NOT SILENTLY OVERWRITE (owner report, 2026-08-04) ────────────────────────────
  //
  // *"I just added my own account's email as a new employee even though that is my current
  // user account's email. It should know that there is already a user with that email and should
  // probably not allow it… If we try to add an employee that already exists, it shouldn't work."*
  //
  // The upsert never created a duplicate — `user_email` is the conflict key — so nothing was
  // corrupted. **The danger is the other direction:** an upsert from a form whose defaults are
  // `survey_technician` / `$18.00` would have written those over a party chief on $25, and returned
  // 200 with no indication that a rate had just been replaced.
  //
  // So the caller now says which it means. `mode: 'create'` refuses when a record exists, and says
  // what the existing one holds — enough to decide without leaving the page. Anything else updates,
  // which is the path for "assign new pay levels to employees".
  const mode = typeof body.mode === 'string' ? body.mode : 'update';

  const { data: existing } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name, job_title, hourly_rate, salary_type')
    .eq('user_email', targetEmail)
    .maybeSingle();

  if (mode === 'create' && existing) {
    const e = existing as { user_name: string | null; job_title: string | null; hourly_rate: number | null };
    return NextResponse.json({
      error: 'already_exists',
      message:
        `${e.user_name ?? targetEmail} already has a pay record — ${e.job_title ?? 'no position set'}` +
        `${e.hourly_rate != null ? ` at $${e.hourly_rate}/hr` : ''}. Open them to change it rather ` +
        `than adding them again; adding would overwrite what is there.`,
      existing,
    }, { status: 409 });
  }

  // Admin: full profile creation/update
  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .upsert({ user_email: targetEmail, ...profileData }, { onConflict: 'user_email' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'employee_profile_updated',
      entity_type: 'employee_profile',
      entity_id: data.id,
      metadata: { target_email: targetEmail },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ profile: data });
}, { routeName: 'payroll/employees' });

// PUT: Update specific fields (admin only for pay-related fields)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { user_email, ...updates } = body;

  if (!user_email) return NextResponse.json({ error: 'user_email required' }, { status: 400 });

  // Pay-related fields require admin
  const payFields = ['hourly_rate', 'salary_type', 'annual_salary', 'job_title', 'pay_frequency'];
  const hasPayFields = payFields.some(f => f in updates);

  if (hasPayFields && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Only admins can modify pay settings' }, { status: 403 });
  }

  if (!isAdmin(session.user.roles) && user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── THE BALANCE MOVES THROUGH THE LEDGER, OR IT DOES NOT MOVE ─────────────────────────────────
  //
  // This handler spreads `updates` straight into the row, so `available_balance` could be PATCHed to
  // any figure — with no `balance_transactions` row behind it. That is precisely the drift
  // `checkBalanceIntegrity` reports as "unexplained", and an employee can withdraw against it.
  //
  // A balance is a running total of its ledger, not an editable field. Every legitimate movement has
  // a writer already: a payout item marked paid on the `account` method, a completed legacy run, and
  // a processed withdrawal. Anything else is a number somebody typed, and it cannot be reconciled,
  // reversed or explained afterwards.
  //
  // Refused loudly rather than stripped silently: a caller trying to set a balance has a reason, and
  // it is one somebody should hear out loud rather than have quietly ignored.
  const LEDGER_OWNED = ['available_balance', 'total_earned', 'total_withdrawn'];
  const attempted = LEDGER_OWNED.filter((f) => f in updates);
  if (attempted.length > 0) {
    return NextResponse.json({
      error: `${attempted.join(' and ')} cannot be set directly — a balance is the sum of its `
        + 'movements, and one written by hand cannot be explained or reversed. Credit it through a '
        + 'payout, or record a withdrawal.',
    }, { status: 400 });
  }

  // ── HOW THIS PERSON GETS PAID ─────────────────────────────────────────────────────────────────
  //
  // `payout_method` is what the batch builder stamps onto every payout item, and it was READ by the
  // weekly cron and the ad-hoc pay route and written by nothing at all — no form, no API field, no
  // default. Every item was therefore built with no method and arrived on the dispatch screen under
  // "Method not assigned". It is also why the employee balance never funded: `account` is a payout
  // method, so the one path that credits a balance was unreachable.
  //
  // Validated rather than passed through, because an unrecognised string is stored happily and then
  // silently rejected by `isPayoutMethod` downstream — the form would show a method set and every
  // payout would still say "unassigned", which is the worst of both.
  if ('payout_method' in updates) {
    const m = updates.payout_method;
    if (m !== null && m !== '' && !isPayoutMethod(m)) {
      return NextResponse.json(
        { error: `“${String(m)}” is not a way this firm pays people. Pick one from the list.` },
        { status: 400 },
      );
    }
    // Deciding how somebody is paid is a pay setting, not a contact detail.
    if (!isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Only admins can change how somebody is paid.' }, { status: 403 });
    }
    updates.payout_method = m === '' ? null : m;
  }

  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .update(updates)
    .eq('user_email', user_email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}, { routeName: 'payroll/employees' });

// ─── Slice EP1 helpers ──────────────────────────────────────────────
//
// Normalize a possibly-undefined free-form text value: trim, collapse
// blanks to null, leave undefined alone (so we don't overwrite an
// existing value when the caller didn't send the field). Exported via
// the module so this stays close to the route that uses it.
function normalizeText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Accept either 'YYYY-MM-DD' or an ISO timestamp; bad input → null
// so a typo doesn't crash the upsert. undefined is a no-op (keep
// current value).
function normalizeDob(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  // Accept the bare date or a full timestamp; pull the date part.
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
