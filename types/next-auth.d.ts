import 'next-auth';

type UserRoleType = 'admin' | 'developer' | 'teacher' | 'student' | 'researcher' | 'drawer' | 'field_crew' | 'employee' | 'guest' | 'tech_support';

declare module 'next-auth' {
  interface User {
    role?: UserRoleType;
    roles?: UserRoleType[];
  }
  interface Session {
    user: {
      email: string;
      name: string;
      image?: string;
      role: UserRoleType;
      roles: UserRoleType[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRoleType;
    roles?: UserRoleType[];
    rolesLastChecked?: number;
    blocked?: boolean;
  }
}
