import 'next-auth';

declare module 'next-auth' {
  interface User { role?: 'admin' | 'employee'; }
  interface Session { user: { email: string; name: string; image?: string; role: 'admin' | 'employee'; }; }
}

declare module 'next-auth/jwt' {
  interface JWT { role?: 'admin' | 'employee'; }
}
