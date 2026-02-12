import 'next-auth';

declare module 'next-auth' {
  interface User {
    role?: 'admin' | 'teacher' | 'employee';
    roles?: Array<'admin' | 'teacher' | 'employee'>;
  }
  interface Session {
    user: {
      email: string;
      name: string;
      image?: string;
      role: 'admin' | 'teacher' | 'employee';
      roles: Array<'admin' | 'teacher' | 'employee'>;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'admin' | 'teacher' | 'employee';
    roles?: Array<'admin' | 'teacher' | 'employee'>;
  }
}
