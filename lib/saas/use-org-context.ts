'use client';
// lib/saas/use-org-context.ts
//
// React hook returning the customer's active organization context.
// Reads from the NextAuth session; provides the data shape every
// V2 customer-facing surface needs: which org am I in, what role do
// I have, which bundles are unlocked, am I an operator?
//
// Returns a stable shape even when the session is loading or absent
// — consumers don't need to spread null-checks.
//
// Phase A wires this throughout the customer admin shell, replacing
// the existing `isCompanyUser` boolean (per
// docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §2.1 + §4.1).

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

import { expandBundles, hasBundle, type BundleId } from './bundles';

export interface OrgContextValue {
  /** True while the session is loading. Consumers should typically
   *  render a skeleton until ready. */
  isLoading: boolean;
  /** True when the session is authenticated. */
  isAuthenticated: boolean;
  /** True when this user is a Starr Software operator (any operator
   *  role). Routes /platform/* are gated to this. */
  isOperator: boolean;
  /** Operator role detail, when isOperator is true. */
  operatorRole: string | null;
  /** Active org id, or null when not in any org. */
  activeOrgId: string | null;
  /** Active org slug + name, for display + breadcrumb. */
  activeOrgSlug: string | null;
  activeOrgName: string | null;
  /** Role this user has WITHIN the active org. */
  orgRole: string | null;
  /** Bundles included in the active org's subscription, expanded via
   *  the implies relation (Firm Suite ⇒ all; Office ⇒ Field). */
  bundles: BundleId[];
  /** All orgs this user belongs to (for the topbar org-switcher).
   *  Empty for operator-only users. */
  memberships: NonNullable<NonNullable<ReturnType<typeof useSession>['data']>['user']['memberships']>;
  /** Convenience: is the user authorized to use the given bundle? */
  canAccessBundle: (b: BundleId) => boolean;
}

const EMPTY: OrgContextValue = {
  isLoading: false,
  isAuthenticated: false,
  isOperator: false,
  operatorRole: null,
  activeOrgId: null,
  activeOrgSlug: null,
  activeOrgName: null,
  orgRole: null,
  bundles: [],
  memberships: [],
  canAccessBundle: () => false,
};

export function useOrgContext(): OrgContextValue {
  const { data: session, status } = useSession();

  return useMemo(() => {
    if (status === 'loading') {
      return { ...EMPTY, isLoading: true };
    }
    if (!session?.user) {
      return EMPTY;
    }

    const user = session.user;
    const memberships = user.memberships ?? [];
    const activeOrgId = user.activeOrgId ?? null;
    const activeMembership = activeOrgId
      ? memberships.find((m) => m.orgId === activeOrgId) ?? null
      : null;

    const rawBundles = activeMembership?.bundles ?? [];
    const bundles = expandBundles(rawBundles as BundleId[]);

    return {
      isLoading: false,
      isAuthenticated: true,
      isOperator: !!user.isOperator,
      operatorRole: user.operatorRole ?? null,
      activeOrgId,
      activeOrgSlug: activeMembership?.orgSlug ?? null,
      activeOrgName: activeMembership?.orgName ?? null,
      orgRole: activeMembership?.role ?? null,
      bundles,
      memberships,
      canAccessBundle: (b: BundleId) => hasBundle(bundles, b),
    };
  }, [session, status]);
}
