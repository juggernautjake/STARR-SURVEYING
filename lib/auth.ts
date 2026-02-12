import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { NextAuthConfig } from 'next-auth';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

// =============================================================================
// ROLE SYSTEM
// Three roles: admin (full access), teacher (content + student management),
// employee (learner - consumes content only)
// Users can hold MULTIPLE roles (e.g. admin + teacher)
// =============================================================================

export type UserRole = 'admin' | 'teacher' | 'employee';

const ADMIN_EMAILS: string[] = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];

// Teachers can create content, manage students, review grades
const TEACHER_EMAILS: string[] = [];

const ALLOWED_DOMAIN = 'starr-surveying.com';

/** Get all roles for a company (Google) user based on email lists */
export function getUserRoles(email: string): UserRole[] {
  const lower = email.toLowerCase();
  const roles: UserRole[] = ['employee']; // everyone is at least an employee
  if (ADMIN_EMAILS.includes(lower)) roles.push('admin');
  if (TEACHER_EMAILS.includes(lower)) roles.push('teacher');
  return roles;
}

/** Get the primary (highest) role for display purposes: admin > teacher > employee */
export function getUserRole(email: string): UserRole {
  const roles = getUserRoles(email);
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('teacher')) return 'teacher';
  return 'employee';
}

/** Get primary role from a roles array */
export function getPrimaryRole(roles: UserRole[]): UserRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('teacher')) return 'teacher';
  return 'employee';
}

export function isAdmin(emailOrRoles: string | UserRole[] | null | undefined): boolean {
  if (!emailOrRoles) return false;
  if (Array.isArray(emailOrRoles)) return emailOrRoles.includes('admin');
  return getUserRoles(emailOrRoles).includes('admin');
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

        // Look up user in registered_users table
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
        // Google: enforce company domain
        const email = user.email?.toLowerCase();
        if (!email) return false;
        return email.split('@')[1] === ALLOWED_DOMAIN;
      }
      // Credentials: already validated in authorize()
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
        // Credentials users have roles set by authorize(); Google users use email-based lookup
        token.roles = user.roles || getUserRoles(user.email);
        token.role = user.role || getPrimaryRole(token.roles as UserRole[]);
        token.name = user.name;
        token.picture = user.image;
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
