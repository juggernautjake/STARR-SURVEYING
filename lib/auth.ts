import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig } from 'next-auth';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

// =============================================================================
// ROLE SYSTEM
// Expanded roles: admin, developer, teacher, student, researcher, drawer,
// field_crew, employee, guest, tech_support, equipment_manager
// Users can hold MULTIPLE roles (e.g. admin + teacher + researcher)
// =============================================================================

export const ALL_ROLES = [
  'admin', 'developer', 'teacher', 'student', 'researcher',
  'drawer', 'field_crew', 'employee', 'guest', 'tech_support',
  // Phase F10 (§4.6 + §5.12) — equipment_manager owns the digital
  // inventory ledger: receives, labels, calibrates, retires gear;
  // approves dispatcher loadout assignments; nags crews on
  // unreturned gear at end of day. Stored in registered_users.roles
  // alongside other roles. Often a hat worn by an existing
  // admin / dev user at Starr's current size; modeled cleanly so a
  // future dedicated hire is a permission flip, not a refactor.
  'equipment_manager',
] as const;

export type UserRole = (typeof ALL_ROLES)[number];

// Human-readable labels for each role
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  researcher: 'Researcher',
  drawer: 'Drawer',
  field_crew: 'Field Crew',
  employee: 'Employee',
  guest: 'Guest',
  tech_support: 'Tech Support',
  equipment_manager: 'Equipment Manager',
};

// Role descriptions for admin UI
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access to everything. Can manage users, roles, payroll, and settings.',
  developer: 'Full access for testing. Cannot update user roles or site settings.',
  teacher: 'Create/edit learning content. Manage student progress.',
  student: 'Access to all learning features: modules, flashcards, exam prep.',
  researcher: 'Access to Property Research and Analysis tools.',
  drawer: 'Access to CAD Editor and Research tools.',
  field_crew: 'Field work tools: jobs, hours, fieldbook, assignments, schedule.',
  employee: 'Base role. Dashboard, profile, learning hub basics.',
  guest: 'External user. Limited to dashboard, profile, and basic learning.',
  tech_support: 'Error logs, view-only access to most pages for troubleshooting.',
  equipment_manager: 'Owns the equipment + supplies inventory: morning checkout, end-of-day reconcile, maintenance schedules, low-stock restock, and damaged/lost triage. Cannot approve receipts or hours.',
};

// How often (in seconds) to re-fetch roles from DB for an active session.
export const ROLES_REFRESH_INTERVAL_SECONDS = 30;

const ADMIN_EMAILS: string[] = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];

const TEACHER_EMAILS: string[] = [];

const ALLOWED_DOMAIN = 'starr-surveying.com';

/** Role priority for determining the "primary" display role (highest first) */
const ROLE_PRIORITY: UserRole[] = [
  'admin', 'developer', 'teacher', 'tech_support',
  // equipment_manager sits above researcher/drawer/field_crew —
  // cage-keeper accountability outranks generic field roles for
  // dashboard "primary role" display purposes but stays below
  // admin / dev / teacher / tech_support.
  'equipment_manager',
  'researcher', 'drawer', 'field_crew', 'student', 'guest', 'employee',
];

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
  const { data } = await supabaseAdmin
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
    const { data: existing } = await supabaseAdmin
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

      const { error: updateErr } = await supabaseAdmin
        .from('registered_users')
        .update(updateFields)
        .eq('email', lower);

      if (updateErr) {
        // If update fails (e.g., new columns don't exist), try minimal update
        console.warn('ensureRegisteredUser update failed, trying minimal:', updateErr.message);
        await supabaseAdmin
          .from('registered_users')
          .update({ updated_at: new Date().toISOString(), ...(name ? { name } : {}) })
          .eq('email', lower);
      }
      return;
    }

    // Create new row — company users are auto-approved
    const isCompany = lower.endsWith(`@${ALLOWED_DOMAIN}`);
    const defaultRoles: UserRole[] = ['employee'];
    if (ADMIN_EMAILS.includes(lower)) defaultRoles.push('admin');
    if (TEACHER_EMAILS.includes(lower)) defaultRoles.push('teacher');

    // Insert with all columns — if new columns don't exist, fall back to core fields
    const { error: insertErr } = await supabaseAdmin
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
      const { error: fallbackErr } = await supabaseAdmin
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
  const { data } = await supabaseAdmin
    .from('registered_users')
    .select('is_banned, is_approved')
    .eq('email', lower)
    .maybeSingle();
  if (!data) return false;
  return data.is_banned === true || data.is_approved === false;
}

/** Get primary role from a roles array */
export function getPrimaryRole(roles: UserRole[]): UserRole {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return 'employee';
}

/** Get the primary (highest) role for display purposes */
export function getUserRole(email: string): UserRole {
  return getPrimaryRole(getUserRoles(email));
}

export function isAdmin(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return emailOrRoles.includes('admin');
  return getUserRoles(emailOrRoles).includes('admin');
}

/** Admin or developer — both have broad access */
export function isDeveloper(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return emailOrRoles.includes('admin') || emailOrRoles.includes('developer');
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

/** Is this user a company domain employee (vs external registered user)? */
export function isCompanyUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
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

        const { data: user, error } = await supabaseAdmin
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
        await supabaseAdmin
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
        if (email.split('@')[1] !== ALLOWED_DOMAIN) return false;
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
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
