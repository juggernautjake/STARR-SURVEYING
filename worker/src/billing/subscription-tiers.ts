// worker/src/billing/subscription-tiers.ts — Phase 11 Module G
// Subscription tier definitions and per-report pricing.
//
// Spec §11.8.1 — Pricing Model

import type { SubscriptionTierConfig, PerReportPricing } from '../types/expansion.js';

// ── Subscription Tiers ──────────────────────────────────────────────────────

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTierConfig> = {
  FREE_TRIAL: {
    name: 'Free Trial',
    price: 0,
    reports_per_month: 2,
    max_adjacent_properties: 3,
    document_purchases: false,
    batch_processing: false,
    export_formats: ['pdf'],
    api_access: false,
    support: 'community',
    data_sources: ['cad', 'clerk_free'],
  },

  SURVEYOR_PRO: {
    name: 'Surveyor Pro',
    price: 99,
    reports_per_month: 25,
    max_adjacent_properties: 10,
    document_purchases: true,
    batch_processing: false,
    export_formats: ['pdf', 'dxf', 'svg', 'png', 'txt', 'json'],
    api_access: false,
    support: 'email',
    data_sources: ['cad', 'clerk_free', 'clerk_purchase', 'txdot', 'fema', 'glo'],
  },

  FIRM_UNLIMITED: {
    name: 'Firm Unlimited',
    price: 299,
    reports_per_month: -1, // unlimited
    max_adjacent_properties: -1,
    document_purchases: true,
    batch_processing: true,
    export_formats: ['pdf', 'dxf', 'svg', 'png', 'txt', 'json', 'rw5', 'jobxml'],
    api_access: true,
    support: 'priority_email_phone',
    data_sources: 'all',
    team_members: 5,
  },

  ENTERPRISE: {
    name: 'Enterprise',
    price: null, // Custom pricing
    reports_per_month: -1,
    max_adjacent_properties: -1,
    document_purchases: true,
    batch_processing: true,
    export_formats: 'all',
    api_access: true,
    support: 'dedicated',
    data_sources: 'all',
    team_members: -1,
    custom_branding: true,
    sla: '99.9%',
    onboarding: true,
  },
};

// ── Per-Report Pricing ──────────────────────────────────────────────────────

export const PER_REPORT_PRICING: Record<string, PerReportPricing> = {
  BASIC_REPORT: {
    name: 'Basic Research Report',
    price: 29,
    includes: ['cad', 'clerk_free', 'fema'],
    export_formats: ['pdf'],
    adjacent_properties: 3,
  },

  FULL_REPORT: {
    name: 'Full Research Report',
    price: 79,
    includes: ['cad', 'clerk_free', 'txdot', 'fema', 'glo', 'tceq', 'rrc', 'soil'],
    export_formats: ['pdf', 'dxf', 'svg'],
    adjacent_properties: 10,
  },

  PREMIUM_REPORT: {
    name: 'Premium Research Report + Documents',
    price: 149,
    includes: 'all',
    export_formats: 'all',
    adjacent_properties: -1,
    document_budget_included: 25,
  },
};

// ── Tier Lookup Helpers ─────────────────────────────────────────────────────

export function getTier(tierName: string): SubscriptionTierConfig | null {
  return SUBSCRIPTION_TIERS[tierName] || null;
}

export function getServiceFeePerPage(tierName: string): number {
  switch (tierName) {
    case 'ENTERPRISE':
      return 0; // No markup
    case 'FIRM_UNLIMITED':
      return 0.25;
    case 'SURVEYOR_PRO':
      return 0.5;
    default:
      return 0.5;
  }
}

export function canAccessDataSource(
  tierName: string,
  dataSource: string,
): boolean {
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (!tier) return false;
  if (tier.data_sources === 'all') return true;
  return (tier.data_sources as string[]).includes(dataSource);
}

export function canExportFormat(
  tierName: string,
  format: string,
): boolean {
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (!tier) return false;
  if (tier.export_formats === 'all') return true;
  return (tier.export_formats as string[]).includes(format);
}

export function isWithinReportLimit(
  tierName: string,
  currentMonthCount: number,
): boolean {
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (!tier) return false;
  if (tier.reports_per_month === -1) return true; // unlimited
  return currentMonthCount < tier.reports_per_month;
}
