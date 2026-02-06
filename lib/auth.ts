import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

const ADMIN_EMAILS: string[] = [
  'hankmaddux@starr-surveying.com',
  'jacobmaddux@starr-surveying.com',
  'info@starr-surveying.com',
];

const ALLOWED_DOMAIN = 'starr-surveying.com';

export function getUserRole(email: string): 'admin' | 'employee' {
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'employee';
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getUserRole(email) === 'admin';
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
        session.user.role = token.role as 'admin' | 'employee';
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
