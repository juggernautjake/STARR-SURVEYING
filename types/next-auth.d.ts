import 'next-auth';

// Mirror of `lib/auth.ts ALL_ROLES`. Keep in sync — adding a role
// to ALL_ROLES requires adding it here too or session.user.role
// assignments fail TS2322. Phase F10.0e (ded0b67) added
// 'equipment_manager'.
type UserRoleType = 'admin' | 'developer' | 'teacher' | 'student' | 'researcher' | 'drawer' | 'field_crew' | 'employee' | 'guest' | 'tech_support' | 'equipment_manager';

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
