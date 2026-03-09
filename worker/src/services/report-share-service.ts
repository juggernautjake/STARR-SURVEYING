// worker/src/services/report-share-service.ts
// Phase 17: Report Sharing & Client Portal
//
// Manages share tokens for research reports, supporting per-token permission
// tiers, optional expiry, view-count limits, and optional password protection.
// Uses an in-memory store suitable for testing; production deployments persist
// tokens in the `report_shares` Supabase table.

import { createHash } from 'crypto';

// ── Public types ──────────────────────────────────────────────────────────────

export type SharePermission =
  | 'full_report'
  | 'summary_only'
  | 'boundary_only'
  | 'documents_excluded';

export interface ReportShareToken {
  token: string;           // UUID v4 — URL-safe
  projectId: string;
  permission: SharePermission;
  createdBy: string;       // user email
  expiresAt: string | null; // ISO timestamp or null (never expires)
  viewCount: number;
  maxViews: number | null;
  label?: string;          // human-readable label e.g. "Shared with Title Co."
  createdAt: string;
  lastViewedAt: string | null;
  isRevoked: boolean;
  passwordHash?: string;   // SHA-256 hex — optional password protection
}

export interface ShareOptions {
  permission?: SharePermission;
  expiresInDays?: number | null;  // null = never
  maxViews?: number | null;
  label?: string;
  password?: string;              // optional password (will be SHA-256 hashed)
}

export interface ShareLinkResult {
  shareUrl: string;        // e.g. https://app.example.com/share/{token}
  token: string;
  shareRecord: ReportShareToken;
}

export interface ViewAllowedResult {
  allowed: boolean;
  reason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function buildExpiresAt(expiresInDays: number | null | undefined): string | null {
  if (expiresInDays == null) return null;
  const ms = expiresInDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

// ── ReportShareService ────────────────────────────────────────────────────────

export class ReportShareService {
  private store: Map<string, ReportShareToken> = new Map();
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://app.starrsurveying.com';
  }

  /** Generate a new share token for a project. */
  async createShare(
    projectId: string,
    createdBy: string,
    options: ShareOptions = {},
  ): Promise<ShareLinkResult> {
    const token = crypto.randomUUID();
    const permission: SharePermission = options.permission ?? 'full_report';
    const expiresAt = buildExpiresAt(options.expiresInDays);
    const maxViews = options.maxViews ?? null;

    const shareRecord: ReportShareToken = {
      token,
      projectId,
      permission,
      createdBy,
      expiresAt,
      viewCount: 0,
      maxViews,
      label: options.label,
      createdAt: new Date().toISOString(),
      lastViewedAt: null,
      isRevoked: false,
      passwordHash: options.password ? hashPassword(options.password) : undefined,
    };

    this.store.set(token, shareRecord);

    return {
      shareUrl: `${this.baseUrl}/share/${token}`,
      token,
      shareRecord,
    };
  }

  /**
   * Validate a token — returns the share record or null if not found,
   * expired, revoked, max-views exceeded, or wrong password.
   */
  async validateToken(
    token: string,
    password?: string,
  ): Promise<ReportShareToken | null> {
    const share = this.store.get(token);
    if (!share) return null;

    const { allowed } = this.isViewAllowed(share);
    if (!allowed) return null;

    // Password check (when the share requires one)
    if (share.passwordHash !== undefined) {
      if (!password) return null;
      if (hashPassword(password) !== share.passwordHash) return null;
    }

    return share;
  }

  /** Record a view: increment viewCount and update lastViewedAt. */
  async recordView(token: string): Promise<void> {
    const share = this.store.get(token);
    if (!share) return;
    share.viewCount += 1;
    share.lastViewedAt = new Date().toISOString();
  }

  /** List all share tokens for a project. */
  async listShares(projectId: string): Promise<ReportShareToken[]> {
    return Array.from(this.store.values()).filter(
      (s) => s.projectId === projectId,
    );
  }

  /** Revoke a share token so it can no longer be used. */
  async revokeShare(token: string, _revokedBy: string): Promise<void> {
    const share = this.store.get(token);
    if (!share) return;
    share.isRevoked = true;
  }

  /** Update share options (permission, expiry, label, maxViews, password). */
  async updateShare(
    token: string,
    updates: Partial<ShareOptions>,
  ): Promise<ReportShareToken> {
    const share = this.store.get(token);
    if (!share) throw new Error(`Share token not found: ${token}`);

    if (updates.permission !== undefined) {
      share.permission = updates.permission;
    }
    if ('expiresInDays' in updates) {
      share.expiresAt = buildExpiresAt(updates.expiresInDays);
    }
    if ('maxViews' in updates) {
      share.maxViews = updates.maxViews ?? null;
    }
    if (updates.label !== undefined) {
      share.label = updates.label;
    }
    if (updates.password !== undefined) {
      share.passwordHash = hashPassword(updates.password);
    }

    return share;
  }

  /**
   * Check whether viewing is currently allowed:
   * not revoked, not expired, view count not exceeded.
   */
  isViewAllowed(share: ReportShareToken): ViewAllowedResult {
    if (share.isRevoked) {
      return { allowed: false, reason: 'Token has been revoked' };
    }

    if (share.expiresAt !== null && new Date(share.expiresAt) <= new Date()) {
      return { allowed: false, reason: 'Token has expired' };
    }

    if (share.maxViews !== null && share.viewCount >= share.maxViews) {
      return { allowed: false, reason: 'Maximum view count exceeded' };
    }

    return { allowed: true };
  }
}
