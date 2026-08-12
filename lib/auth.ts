import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig } from 'next-auth';
import bcrypt from 'bcryptjs';
// Sign-in reads ACROSS tenants by necessity: it has to find which orgs a person
// belongs to before it can know which org they are acting for. Using the scoped
// client here would be circular. Every table it touches is either tenant-free
// (`registered_users`, `operator_users`, `user_active_org`) or on the
// CROSS_ORG_TABLES exemption list — this import states that rather than relying
// on the exemption list to imply it. See lib/saas/org-scope.ts.
import { supabaseUnscoped } from '@/lib/supabase';
import { ensureAuthUser } from '@/lib/auth/mirror-auth-user';
import { beginOrgScope, orgIdForSession } from '@/lib/saas/org-scope-context';
import { resolveIsCompanyUser } from '@/lib/saas/internal-user';
// The role vocabulary lives in a file with no imports, so a client component can read a label
// without dragging NextAuth — and node:async_hooks — into the browser bundle. Re-exported here so
// every existing server-side `from '@/lib/auth'` keeps working. See lib/auth-roles.ts.
import {
  ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PRIORITY, ROLES_REFRESH_INTERVAL_SECONDS,
  getPrimaryRole, isAdminRoles, isDeveloperRoles, type UserRole,
} from '@/lib/auth-roles';

export {
  ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PRIORITY, ROLES_REFRESH_INTERVAL_SECONDS,
  getPrimaryRole, isAdminRoles, isDeveloperRoles,
};
export type { UserRole };

// =============================================================================
// ROLE SYSTEM
// Expanded roles: admin, developer, teacher, student, researcher, drawer,
// field_crew, employee, guest, tech_support, equipment_manager
// Users can hold MULTIPLE roles (e.g. admin + teacher + researcher)
// =============================================================================











const ADMIN_EMAILS: string[] = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];

const TEACHER_EMAILS: string[] = [];



/** Get roles for a user from hardcoded email lists (synchronous fallback) */
export function getUserRoles(email: string): UserRole[] {
  const lower = email.toLowerCase();
  const roles: UserRole[] = ['employee'];
  if (ADMIN_EMAILS.includes(lower)) roles.push('admin');
  if (TEACHER_EMAILS.includes(lower)) roles.push('teacher');
  return roles;
}

/** Get roles for any user, checking DB first then falling back to email lists */
export async function getUserRolesFromDB(email: string): Promise<UserRole[]> {
  const lower = email.toLowerCase();
  const { data } = await supabaseUnscoped
    .from('registered_users')
    .select('roles')
    .eq('email', lower)
    .maybeSingle();
  if (data?.roles && Array.isArray(data.roles) && data.roles.length > 0) {
    const dbRoles = new Set<UserRole>(data.roles as UserRole[]);
    if (ADMIN_EMAILS.includes(lower)) dbRoles.add('admin');
    if (TEACHER_EMAILS.includes(lower)) dbRoles.add('teacher');
    dbRoles.add('employee');
    return Array.from(dbRoles);
  }
  return getUserRoles(lower);
}

/**
 * Auto-create a registered_users row for a Google sign-in user if one doesn't
 * exist yet. Called during the JWT callback on first sign-in.
 */
export async function ensureRegisteredUser(
  email: string,
  name: string | null | undefined,
  image: string | null | undefined,
  provider: string,
): Promise<void> {
  const lower = email.toLowerCase();

  try {
    const { data: existing } = await supabaseUnscoped
      .from('registered_users')
      .select('id')
      .eq('email', lower)
      .maybeSingle();

    if (existing) {
      // Update last_sign_in and avatar — use try/catch since new columns may not exist yet
      const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (name) updateFields.name = name;
      // These columns may not exist if migration 110 hasn't been run yet
      try {
        updateFields.last_sign_in = new Date().toISOString();
        if (image) updateFields.avatar_url = image;
      } catch { /* ignore if columns missing */ }

      const { error: updateErr } = await supabaseUnscoped
        .from('registered_users')
        .update(updateFields)
        .eq('email', lower);

      if (updateErr) {
        // If update fails (e.g., new columns don't exist), try minimal update
        console.warn('ensureRegisteredUser update failed, trying minimal:', updateErr.message);
        await supabaseUnscoped
          .from('registered_users')
          .update({ updated_at: new Date().toISOString(), ...(name ? { name } : {}) })
          .eq('email', lower);
      }
      // Self-heal on every sign-in: mirror into auth.users if it is not there yet. Five NOT NULL FKs
      // point at auth.users (receipts.user_id among them), and an account missing that row can sign in
      // but cannot file a receipt. Putting it on the sign-in path rather than only on creation means an
      // account that predates the mirror repairs itself the next time its owner logs in, instead of
      // waiting for someone to notice a 422.
      await ensureAuthUser(existing.id, lower, name);
      return;
    }

    // Create new row — someone arriving on a firm's own email domain is auto-approved. The domain is
    // read from the `organizations` row rather than a constant (audit item 8h); a firm that has not
    // configured one auto-approves nobody, which is the safe direction — the alternative would
    // auto-approve every stranger who signs up.
    const isCompany = await isFirmEmailDomain(lower);
    const defaultRoles: UserRole[] = ['employee'];
    if (ADMIN_EMAILS.includes(lower)) defaultRoles.push('admin');
    if (TEACHER_EMAILS.includes(lower)) defaultRoles.push('teacher');

    // Insert with all columns — if new columns don't exist, fall back to core fields
    const { error: insertErr } = await supabaseUnscoped
      .from('registered_users')
      .insert({
        email: lower,
        name: name || lower.split('@')[0],
        password_hash: '',
        roles: defaultRoles,
        is_approved: isCompany,
        is_banned: false,
        auth_provider: provider,
        avatar_url: image || null,
        last_sign_in: new Date().toISOString(),
      });

    if (insertErr) {
      // Fallback: insert without new columns (migration not run yet)
      console.warn('ensureRegisteredUser insert failed, trying without new columns:', insertErr.message);
      const { error: fallbackErr } = await supabaseUnscoped
        .from('registered_users')
        .insert({
          email: lower,
          name: name || lower.split('@')[0],
          password_hash: '',
          roles: defaultRoles,
          is_approved: isCompany,
          is_banned: false,
        });

      if (fallbackErr) {
        console.error('ensureRegisteredUser fallback insert also failed:', fallbackErr.message);
      }
    }

    // Mirror the freshly-created account into auth.users, sharing its id. Read the id back rather than
    // threading it out of two different insert branches — either branch may have been the one that
    // succeeded, and a re-read is correct for both.
    const { data: created } = await supabaseUnscoped
      .from('registered_users')
      .select('id')
      .eq('email', lower)
      .maybeSingle();
    await ensureAuthUser(created?.id, lower, name);
  } catch (err) {
    // Non-fatal — user can still sign in, they just won't have a registered_users row
    // until they're manually added or the DB issue is resolved
    console.error('ensureRegisteredUser threw:', err);
  }
}

/**
 * Check whether a user is currently banned or unapproved in the DB.
 */
export async function isUserBlocked(email: string): Promise<boolean> {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return false;
  const { data } = await supabaseUnscoped
    .from('registered_users')
    .select('is_banned, is_approved')
    .eq('email', lower)
    .maybeSingle();
  if (!data) return false;
  return data.is_banned === true || data.is_approved === false;
}

/** Get primary role from a roles array */


/** Get the primary (highest) role for display purposes */
export function getUserRole(email: string): UserRole {
  return getPrimaryRole(getUserRoles(email));
}

export function isAdmin(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return isAdminRoles(emailOrRoles);
  return getUserRoles(emailOrRoles).includes('admin');
}

/** Admin or developer — both have broad access */
export function isDeveloper(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return isDeveloperRoles(emailOrRoles);
  const roles = getUserRoles(emailOrRoles);
  return roles.includes('admin') || roles.includes('developer');
}

/** Teacher OR admin — can create/edit content and view student progress */
export function isTeacher(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return emailOrRoles.includes('admin') || emailOrRoles.includes('teacher');
  const roles = getUserRoles(emailOrRoles);
  return roles.includes('admin') || roles.includes('teacher');
}

/** Can manage content (create, edit, publish lessons/modules/articles/questions/flashcards) */
export function canManageContent(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  return isTeacher(emailOrRoles);
}

/** Can perform destructive admin operations (delete users, manage payroll, settings, etc.) */
export function isFullAdmin(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  return isAdmin(emailOrRoles);
}

// ── Which email domains belong to a firm ──────────────────────────────────────────────────────────
//
// Every configured `organizations.domain_restriction`, cached. Two callers need it and neither has an
// org in hand: `ensureRegisteredUser` (deciding auto-approval for a brand-new row) and the Google
// sign-in callback (deciding whether to let a stranger in at all). Both run BEFORE the person has any
// membership, so both are asking about the domain specifically, not about staff status — that question
// is `lib/saas/internal-user.ts` and it is answered from membership.
//
// Cached for a minute: this is read on every sign-in and the answer changes when an admin edits Org
// Settings, which is approximately never.
let domainCache: { at: number; domains: Set<string> } | null = null;
const DOMAIN_TTL_MS = 60_000;

/** For tests, and for the settings screen after a save. */
export function clearFirmDomainCache(): void {
  domainCache = null;
}

async function firmEmailDomains(): Promise<Set<string>> {
  if (domainCache && Date.now() - domainCache.at < DOMAIN_TTL_MS) return domainCache.domains;
  const { data, error } = await supabaseUnscoped.from('organizations').select('domain_restriction');
  if (error) {
    // Named, not swallowed. A silent empty set here would refuse every Google sign-in in the company
    // and look like an outage with no cause — §1.1b's failure mode with a login page attached.
    console.error('[auth] could not read organization domains', error.message);
    return domainCache?.domains ?? new Set();
  }
  const rows = (data ?? []) as Array<{ domain_restriction: string | null }>;
  const domains = new Set<string>(
    rows
      .map((r) => r.domain_restriction)
      .filter((d): d is string => !!d)
      .map((d) => d.replace(/^@/, '').toLowerCase()),
  );
  domainCache = { at: Date.now(), domains };
  return domains;
}

/** Is this address on a domain some firm in this deployment claims as its own? */
export async function isFirmEmailDomain(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  return (await firmEmailDomains()).has(domain);
}

/** Is this user staff at a firm, rather than an external registered user?
 *
 *  **Deprecated in favour of `isInternalUser(session)` in `lib/saas/internal-user.ts`**, which reads
 *  membership. This email-only form cannot see membership, so it is wrong for the two live accounts
 *  that are org members without a company address — see that file's header for the measurement. It
 *  survives for callers that genuinely only have an address, and it now asks the database which
 *  domains are a firm's instead of naming one firm's domain in the source. */
export async function isCompanyUser(email: string | null | undefined): Promise<boolean> {
  return isFirmEmailDomain(email);
}

/** Check if user has ANY of the specified roles */
export function hasAnyRole(userRoles: UserRole[] | null | undefined, requiredRoles: UserRole[]): boolean {
  if (!userRoles) return false;
  // Admin always passes
  if (userRoles.includes('admin')) return true;
  return requiredRoles.some(r => userRoles.includes(r));
}

/** Check if user can access research features */
export function canAccessResearch(roles: UserRole[] | null | undefined): boolean {
  return hasAnyRole(roles, ['admin', 'developer', 'researcher', 'drawer']);
}

/** Check if user can access CAD features */
export function canAccessCAD(roles: UserRole[] | null | undefined): boolean {
  return hasAnyRole(roles, ['admin', 'developer', 'drawer', 'researcher', 'field_crew']);
}

/** Check if user can access work/jobs features */
export function canAccessWork(roles: UserRole[] | null | undefined): boolean {
  return hasAnyRole(roles, ['admin', 'developer', 'field_crew']);
}

// =============================================================================
// SaaS PIVOT — JWT POPULATION HELPER (M-9a)
// Populates the additive JWT fields (isOperator / operatorRole /
// memberships / activeOrgId) from the existing tables. Pre-M-9
// behavior is unchanged because middleware + every existing call
// site still reads the legacy `roles` / `default_org_id` fields;
// this helper just makes the SaaS fields available to anyone who
// wants to consume them via useSession().
// =============================================================================

interface JwtSaasFields {
  isOperator?: boolean;
  operatorRole?: 'platform_admin' | 'platform_billing' | 'platform_support' | 'platform_developer' | 'platform_observer';
  memberships?: Array<{
    orgId: string;
    orgSlug: string;
    orgName: string;
    role: 'admin' | 'surveyor' | 'bookkeeper' | 'field_only' | 'view_only';
    bundles: Array<'recon' | 'draft' | 'office' | 'field' | 'academy' | 'firm_suite'>;
  }>;
  activeOrgId?: string | null;
  /** Staff at a firm, rather than an external registered user. Resolved from membership + the firm's
   *  configured email domain — see lib/saas/internal-user.ts for why an email suffix was the wrong
   *  test and which two live accounts it was wrong about. */
  isCompanyUser?: boolean;
}

async function populateSaasContext(token: Record<string, unknown> & JwtSaasFields): Promise<void> {
  const email = token.email as string | undefined;
  if (!email) return;

  try {
    // Operator status
    const { data: operator } = await supabaseUnscoped
      .from('operator_users')
      .select('email, role, status')
      .eq('email', email)
      .maybeSingle();
    token.isOperator = !!operator && operator.status === 'active';
    if (token.isOperator) token.operatorRole = operator?.role as JwtSaasFields['operatorRole'];

    // Memberships + active org. Pull subscriptions in one extra query
    // so we can hand back the active-bundle list per org. This runs at
    // most once per ROLES_REFRESH_INTERVAL_SECONDS, so the cost is
    // negligible.
    const [{ data: memberships }, { data: activeRow }] = await Promise.all([
      supabaseUnscoped
        .from('organization_members')
        // `domain_restriction` rides along on a join that already runs — the staff test needs it and
        // a second query for one column on a row we are already reading would be pure latency.
        .select('org_id, role, organizations(id, slug, name, domain_restriction)')
        .eq('user_email', email)
        .eq('status', 'active'),
      supabaseUnscoped
        .from('user_active_org')
        .select('active_org_id')
        .eq('user_email', email)
        .maybeSingle(),
    ]);

    type MembershipRow = { org_id: string; role: string; organizations: { id: string; slug: string; name: string; domain_restriction: string | null } | null };
    type OrgRole = 'admin' | 'surveyor' | 'bookkeeper' | 'field_only' | 'view_only';
    type Bundle = 'recon' | 'draft' | 'office' | 'field' | 'academy' | 'firm_suite';

    const rows = (memberships as MembershipRow[] | null) ?? [];
    if (rows.length > 0) {
      // Get subscription bundles for every org the user belongs to
      const orgIds = rows.map((m) => m.org_id);
      const { data: subs } = await supabaseUnscoped
        .from('subscriptions')
        .select('org_id, bundles, status')
        .in('org_id', orgIds);
      const bundlesByOrg = new Map<string, Bundle[]>();
      for (const s of subs ?? []) {
        const sRow = s as { org_id: string; bundles: string[] | null; status: string };
        if (sRow.status === 'active' || sRow.status === 'trialing') {
          bundlesByOrg.set(sRow.org_id, (sRow.bundles ?? []) as Bundle[]);
        }
      }

      token.memberships = rows.map((m) => ({
        orgId: m.org_id,
        orgSlug: m.organizations?.slug ?? '',
        orgName: m.organizations?.name ?? '',
        role: m.role as OrgRole,
        bundles: bundlesByOrg.get(m.org_id) ?? [],
      }));

      const persisted = activeRow?.active_org_id as string | null | undefined;
      if (persisted && bundlesByOrg.has(persisted)) {
        token.activeOrgId = persisted;
      } else {
        // Fall back to the first membership's org so consumers always
        // have a usable value.
        token.activeOrgId = rows[0]?.org_id ?? null;
      }

      // Staff, because a firm said so. `memberOfAnyOrg` is true by construction in this branch —
      // stated through the shared resolver anyway so the rule lives in one place and a test can
      // assert it without a session.
      token.isCompanyUser = resolveIsCompanyUser({
        email,
        memberOfAnyOrg: true,
        emailDomain: rows.find((m) => m.organizations?.domain_restriction)?.organizations?.domain_restriction ?? null,
      });
    } else {
      token.memberships = [];
      token.activeOrgId = null;
      // No membership anywhere. The firm's own domain is the remaining way to qualify — that is how a
      // new hire's first sign-in sees the app before an admin has added them to the org.
      token.isCompanyUser = await isFirmEmailDomain(email);
    }
  } catch (err) {
    // SaaS-context failure must not break sign-in. Existing legacy
    // path still works; we just emit empty additive fields.
    console.error('[auth] populateSaasContext failed', err);
    token.isOperator = token.isOperator ?? false;
    token.memberships = token.memberships ?? [];
    token.activeOrgId = token.activeOrgId ?? null;
    // Left UNSET rather than defaulted to false. `isInternalUser` falls back to counting memberships
    // when the field is absent, so a transient database blip degrades to the previous answer instead
    // of demoting an admin to "external" and hiding half the app from them.
    token.isCompanyUser = token.isCompanyUser;
  }
}

const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase();
        const password = credentials.password as string;

        const { data: user, error } = await supabaseUnscoped
          .from('registered_users')
          .select('id, email, name, password_hash, roles, is_approved, is_banned')
          .eq('email', email)
          .single();

        if (error || !user) return null;
        if (!user.is_approved) return null;
        if (user.is_banned) return null;

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return null;

        const roles = (user.roles as UserRole[]) || ['employee'];

        // Update last_sign_in
        await supabaseUnscoped
          .from('registered_users')
          .update({ last_sign_in: new Date().toISOString() })
          .eq('email', email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: getPrimaryRole(roles),
          roles: roles,
        };
      },
    }),
  ],
  pages: { signIn: '/admin/login', error: '/admin/login' },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email?.toLowerCase();
        if (!email) return false;
        // Two ways in, because one firm's domain was never the right test (audit item 8h). A person
        // the firm has already added as a member gets in on that basis — johntoddharding@gmail.com is
        // an `admin` member of the Starr org today and could NOT sign in with Google, because their
        // address is not on the company domain. Anyone on a firm's configured domain also gets in,
        // which is how a new employee signs in before anybody has added them.
        //
        // A deployment with no configured domain and no members admits nobody through Google, which is
        // the correct closed default: the alternative is that an empty configuration lets the whole
        // internet into an admin app.
        const [onFirmDomain, isMember] = await Promise.all([
          isFirmEmailDomain(email),
          supabaseUnscoped
            .from('organization_members')
            .select('user_email')
            .eq('user_email', email)
            .eq('status', 'active')
            .maybeSingle()
            .then((res: { data: unknown }) => !!res.data),
        ]);
        if (!onFirmDomain && !isMember) return false;
        // Auto-create/update registered_users row for Google users
        try {
          await ensureRegisteredUser(email, user.name, user.image, 'google');
        } catch (err) {
          console.error('Error ensuring registered user:', err);
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
        token.roles = await getUserRolesFromDB(user.email);
        token.role = getPrimaryRole(token.roles as UserRole[]);
        token.name = user.name;
        token.picture = user.image;
        token.rolesLastChecked = Math.floor(Date.now() / 1000);
        await populateSaasContext(token);
      } else if (token.email) {
        const lastChecked = (token.rolesLastChecked as number) || 0;
        const now = Math.floor(Date.now() / 1000);
        if (!token.roles || now - lastChecked > ROLES_REFRESH_INTERVAL_SECONDS) {
          const blocked = await isUserBlocked(token.email as string);
          if (blocked) {
            return { ...token, roles: [], role: 'employee', rolesLastChecked: now, blocked: true };
          }
          token.roles = await getUserRolesFromDB(token.email as string);
          token.role = getPrimaryRole(token.roles as UserRole[]);
          token.rolesLastChecked = now;
          token.blocked = false;
          await populateSaasContext(token);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
        session.user.roles = (token.roles as UserRole[]) || ['employee'];
        session.user.role = (token.role as UserRole) || getPrimaryRole(session.user.roles);
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
        // ── SaaS pivot — surface additive fields on the session ─────────
        if (token.isOperator !== undefined) session.user.isOperator = token.isOperator as boolean;
        if (token.operatorRole !== undefined) session.user.operatorRole = token.operatorRole as 'platform_admin' | 'platform_billing' | 'platform_support' | 'platform_developer' | 'platform_observer';
        if (token.memberships !== undefined) session.user.memberships = token.memberships as NonNullable<typeof session.user.memberships>;
        if (token.activeOrgId !== undefined) session.user.activeOrgId = token.activeOrgId as string | null;
        if (token.isCompanyUser !== undefined) session.user.isCompanyUser = token.isCompanyUser as boolean;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, signIn, signOut } = nextAuth;

/** NextAuth's `auth`, plus the one thing it is uniquely placed to do: tell the rest of the request
 *  which firm it is acting for (audit §3c.1 item 8g).
 *
 *  Every API route in the app starts with `await auth()`. That makes this the only place a tenant
 *  scope can be opened for all 517 of them without editing all 517 of them — and the scope has to be
 *  opened HERE, synchronously, rather than when the session resolves: a continuation after `await`
 *  runs in the context captured when the await started, so a store entered inside the promise
 *  callback is invisible to the caller. The holder is entered empty and filled a few microtasks
 *  later, before the handler has awaited its way to a single query. See lib/saas/org-scope-context.ts.
 *
 *  `auth` is overloaded: called with a handler it wraps middleware (Edge — different runtime, its own
 *  context, and nothing there queries Postgres), called with `(req, res)` it guards a pages-router
 *  route. Only the zero-argument form is a server-side session read, so only that form opens a scope;
 *  the others pass through byte-for-byte. */
export const auth = ((...args: unknown[]) => {
  const call = nextAuth.auth as unknown as (...a: unknown[]) => unknown;
  if (args.length > 0) return call(...args);

  const holder = beginOrgScope();
  return Promise.resolve(call() as Promise<unknown>).then((session) => {
    holder.orgId = orgIdForSession(session as Parameters<typeof orgIdForSession>[0]);
    return session;
  });
}) as typeof nextAuth.auth;
