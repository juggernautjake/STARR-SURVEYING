import 'next-auth';

// Mirror of `lib/auth.ts ALL_ROLES`. Keep in sync — adding a role
// to ALL_ROLES requires adding it here too or session.user.role
// assignments fail TS2322. Phase F10.0e (ded0b67) added
// 'equipment_manager'.
type UserRoleType = 'admin' | 'developer' | 'teacher' | 'student' | 'researcher' | 'drawer' | 'field_crew' | 'employee' | 'guest' | 'tech_support' | 'equipment_manager';

// SaaS pivot — per docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §4.1.
// Optional additive fields so the new auth path can be wired without
// breaking the legacy single-tenant session shape during the migration.
type OrgRoleType = 'admin' | 'surveyor' | 'bookkeeper' | 'field_only' | 'view_only';
type OperatorRoleType = 'platform_admin' | 'platform_billing' | 'platform_support' | 'platform_developer' | 'platform_observer';
type BundleIdType = 'recon' | 'draft' | 'office' | 'field' | 'academy' | 'firm_suite';

interface OrgMembership {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgRoleType;
  bundles: BundleIdType[];
}

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
      // ── SaaS pivot extensions (optional during migration) ─────────────
      /** True when this user is a Starr Software operator. Lives outside
       *  any org membership. Gates /platform/* routes. */
      isOperator?: boolean;
      /** Granular operator capability when isOperator is true. */
      operatorRole?: OperatorRoleType;
      /** Every org this user belongs to. May be empty for operator-only
       *  users. Multi-org users see the org-switcher in the topbar. */
      memberships?: OrgMembership[];
      /** Current "as" org for this session. Drives RLS context, the
       *  subdomain redirect on org-switch, and bundle-gate evaluation. */
      activeOrgId?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRoleType;
    roles?: UserRoleType[];
    rolesLastChecked?: number;
    blocked?: boolean;
    // SaaS pivot extensions
    isOperator?: boolean;
    operatorRole?: OperatorRoleType;
    memberships?: OrgMembership[];
    activeOrgId?: string | null;
  }
}
