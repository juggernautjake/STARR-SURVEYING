import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

// =============================================================================
// ROLE SYSTEM
// Three roles: admin (full access), teacher (content + student management),
// employee (learner - consumes content only)
// =============================================================================

export type UserRole = 'admin' | 'teacher' | 'employee';

const ADMIN_EMAILS: string[] = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];

// Teachers can create content, manage students, review grades
// Add teacher emails here or manage via the admin Settings page (future DB-backed)
const TEACHER_EMAILS: string[] = [];

const ALLOWED_DOMAIN = 'starr-surveying.com';

export function getUserRole(email: string): UserRole {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return 'admin';
  if (TEACHER_EMAILS.includes(lower)) return 'teacher';
  return 'employee';
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getUserRole(email) === 'admin';
}

/** Teacher OR admin — can create/edit content and view student progress */
export function isTeacher(email: string | null | undefined): boolean {
  if (!email) return false;
  const role = getUserRole(email);
  return role === 'admin' || role === 'teacher';
}

/** Can manage content (create, edit, publish lessons/modules/articles/questions/flashcards) */
export function canManageContent(email: string | null | undefined): boolean {
  return isTeacher(email);
}

/** Can perform destructive admin operations (delete users, manage payroll, settings, etc.) */
export function isFullAdmin(email: string | null | undefined): boolean {
  return isAdmin(email);
}

const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: { signIn: '/admin/login', error: '/admin/login' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return email.split('@')[1] === ALLOWED_DOMAIN;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
        token.role = getUserRole(user.email);
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
        session.user.role = token.role as UserRole;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
