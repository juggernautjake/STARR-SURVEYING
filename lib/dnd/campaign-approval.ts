// lib/dnd/campaign-approval.ts — DM approval of a character into a campaign (owner 2026-07-18: "the DM must
// approve all character builds into their campaign before they are permitted … the DM actually has a way to
// view and approve the custom build, or they can reject it and tell the player why and what to fix").
//
// Approval is a per-(character, campaign) state stored on the `dnd_campaign_characters` join row. Combined with
// the SYSTEM scope (`campaign-scope.ts`), a character is playable in a campaign only when it (a) has a sheet in
// the campaign's system AND (b) is approved by the DM. This module is the pure model + the combined
// eligibility both the campaign roster UI and the character-open gate use, so they agree. Pure + tested.
import { characterHasCampaignSheet } from '@/lib/dnd/campaign-scope';
import type { SheetSlot } from '@/lib/dnd/system-variants';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface CampaignApproval {
  status: ApprovalStatus;
  /** The DM's note — required-in-spirit on a rejection ("why and what to fix"), optional otherwise. */
  reason?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
}

const STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected'];

/** Defensively read an approval from a stored row/JSON — an unknown/missing status is treated as PENDING (a
 *  character is never silently playable without the DM having approved it). */
export function normalizeApproval(raw: unknown): CampaignApproval {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = STATUSES.includes(r.status as ApprovalStatus) ? (r.status as ApprovalStatus) : 'pending';
  const out: CampaignApproval = { status };
  if (typeof r.reason === 'string' && r.reason.trim()) out.reason = r.reason.trim();
  if (typeof r.reviewedByUserId === 'string') out.reviewedByUserId = r.reviewedByUserId;
  if (typeof r.reviewedAt === 'string') out.reviewedAt = r.reviewedAt;
  return out;
}

export function isApproved(approval: CampaignApproval | null | undefined): boolean {
  return approval?.status === 'approved';
}
/** The DM still owes a decision on this character. */
export function awaitingReview(approval: CampaignApproval | null | undefined): boolean {
  return (approval?.status ?? 'pending') === 'pending';
}

/** A short human label for the approval state. */
export function approvalLabel(approval: CampaignApproval | null | undefined): string {
  switch (approval?.status ?? 'pending') {
    case 'approved': return 'Approved';
    case 'rejected': return 'Changes requested';
    default: return 'Awaiting DM approval';
  }
}

export interface CampaignPlayability {
  /** True only when the character has a matching-system sheet AND the DM approved it. */
  playable: boolean;
  /** Why it's not playable, for the UI to show the player — the exact gate that failed. */
  reason: string | null;
}

/**
 * Whether a character can actually be played in a campaign: it needs a sheet in the campaign's SYSTEM and the
 * DM's APPROVAL. Returns the specific blocking reason so the player sees what to do (build a matching sheet, or
 * wait for / address the DM's review). The DM and owner see the sheet regardless (they manage/review it); this
 * governs PLAYING it in-campaign.
 */
export function campaignPlayability(
  sheets: SheetSlot[],
  campaignSystem: string,
  approval: CampaignApproval | null | undefined,
): CampaignPlayability {
  if (!characterHasCampaignSheet(sheets, campaignSystem)) {
    return { playable: false, reason: `This character has no ${campaignSystem} sheet — build one in this system to join the campaign.` };
  }
  if (!isApproved(approval)) {
    return {
      playable: false,
      reason: approval?.status === 'rejected'
        ? `The DM requested changes${approval.reason ? `: ${approval.reason}` : '.'}`
        : 'Awaiting the DM’s approval to join this campaign.',
    };
  }
  return { playable: true, reason: null };
}
