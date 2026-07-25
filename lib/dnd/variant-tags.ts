// lib/dnd/variant-tags.ts — the complete tag taxonomy for a character variant listing (VT). Pure: given a
// slot's lineage/kind/system + a little character context, it returns the ordered, tone-coloured chips the
// variant browser renders on each card. Kept out of the component so the tag set is unit-testable and the
// same everywhere.
import { systemLabel } from './systems';
import type { SheetVariantKind } from './system-variants';

/** A tone drives the chip's colour in the browser (mapped to `--hx-*` there). */
export type VariantTagTone =
  | 'original' | 'variant' | 'active' | 'system' | 'vanilla' | 'custom' | 'dm'
  | 'multiclass' | 'campaign' | 'personal' | 'npc' | 'draft' | 'submitted' | 'approved' | 'rejected' | 'diff';

export interface VariantTag { label: string; tone: VariantTagTone }

export type SubmissionStatusLite = 'draft' | 'submitted' | 'approved' | 'rejected' | null | undefined;

export interface VariantTagInput {
  /** This sheet is the lineage root (the original character). */
  origin: boolean;
  /** This sheet is the one currently open (also carries the highlight border). */
  active: boolean;
  system: string;
  /** Vanilla (rules-legal only) vs Custom (has/allows homebrew) — the sheet's build kind. */
  kind: SheetVariantKind;
  /** Has levels in more than one class. */
  multiclass?: boolean;
  isNpc?: boolean;
  /** Sheet is still being built (blank/unfinished). */
  underConstruction?: boolean;
  /** The campaign this variant belongs to, if any (name for the chip). */
  campaignName?: string | null;
  /** Whether the character is in a campaign at all (drives the "Personal" chip when there's no campaign). */
  inCampaign?: boolean;
  submissionStatus?: SubmissionStatusLite;
  /** This variant's system differs from the original's system. */
  differentSystemFromOrigin?: boolean;
  /** Character carries DM-granted content. */
  hasDmGranted?: boolean;
  /** Suppress the low-signal "Personal" chip (default true — most cards don't need it). */
  suppressPersonal?: boolean;
}

/**
 * The ordered tag list for a variant card. Order is priority: lineage → viewing → system → provenance →
 * shape → placement → status. The browser renders them left-to-right and may truncate; the earliest are the
 * most important.
 */
export function variantTags(input: VariantTagInput): VariantTag[] {
  const tags: VariantTag[] = [];

  // Lineage — Original xor Variant.
  tags.push(input.origin ? { label: 'Original', tone: 'original' } : { label: 'Variant', tone: 'variant' });

  // Viewing — the highlight is the primary signal, but a chip helps in a dense grid.
  if (input.active) tags.push({ label: 'Viewing', tone: 'active' });

  // System — always, so a version's game system is legible at a glance.
  tags.push({ label: systemLabel(input.system), tone: 'system' });

  // Provenance — vanilla vs custom for the system it's listed in, plus DM-granted content.
  tags.push(input.kind === 'custom' ? { label: 'Custom', tone: 'custom' } : { label: 'Vanilla', tone: 'vanilla' });
  if (input.hasDmGranted) tags.push({ label: 'DM-granted', tone: 'dm' });

  // Shape.
  if (input.multiclass) tags.push({ label: 'Multiclass', tone: 'multiclass' });
  if (!input.origin && input.differentSystemFromOrigin) tags.push({ label: 'Different system', tone: 'diff' });

  // Placement — campaign vs personal.
  if (input.campaignName) tags.push({ label: `Campaign: ${input.campaignName}`, tone: 'campaign' });
  else if (input.inCampaign) tags.push({ label: 'In a campaign', tone: 'campaign' });
  else if (!input.suppressPersonal) tags.push({ label: 'Personal', tone: 'personal' });

  // Character kind + build status.
  if (input.isNpc) tags.push({ label: 'NPC', tone: 'npc' });
  if (input.underConstruction) tags.push({ label: 'Draft', tone: 'draft' });

  // Campaign review status (only meaningful in a campaign).
  switch (input.submissionStatus) {
    case 'submitted': tags.push({ label: 'Submitted', tone: 'submitted' }); break;
    case 'approved': tags.push({ label: 'Approved', tone: 'approved' }); break;
    case 'rejected': tags.push({ label: 'Rejected', tone: 'rejected' }); break;
    default: break;
  }

  return tags;
}

/** The palette for each tone: [background, border, text]. Uses `--hx-*` vars so it matches the sheet chrome in
 *  both skins. Exported so the component and any tests share one source of truth. */
export const VARIANT_TAG_COLORS: Record<VariantTagTone, { bg: string; border: string; fg: string }> = {
  original: { bg: 'rgba(200,170,110,0.16)', border: 'var(--hx-gold-1, #c8aa6e)', fg: 'var(--hx-gold-2, #c8aa6e)' },
  variant: { bg: 'rgba(10,200,185,0.14)', border: 'var(--hx-teal-1, #0ac8b9)', fg: 'var(--hx-teal-1, #0ac8b9)' },
  active: { bg: 'rgba(120,200,255,0.18)', border: '#78c8ff', fg: '#bfe3ff' },
  system: { bg: 'rgba(255,255,255,0.05)', border: 'var(--hx-line, rgba(255,255,255,0.14))', fg: 'var(--hx-text, #e8e0cf)' },
  vanilla: { bg: 'rgba(80,200,120,0.14)', border: '#4fb477', fg: '#8fe0ac' },
  custom: { bg: 'rgba(230,150,70,0.16)', border: '#e6963f', fg: '#f4c07a' },
  dm: { bg: 'rgba(170,120,230,0.16)', border: '#aa78e6', fg: '#d3b6ff' },
  multiclass: { bg: 'rgba(90,150,240,0.14)', border: '#5a96f0', fg: '#a9c7ff' },
  campaign: { bg: 'rgba(90,150,240,0.12)', border: '#5a96f0', fg: '#a9c7ff' },
  personal: { bg: 'rgba(255,255,255,0.03)', border: 'var(--hx-line, rgba(255,255,255,0.14))', fg: 'var(--hx-muted, #93a1b0)' },
  npc: { bg: 'rgba(150,110,220,0.16)', border: '#966edc', fg: '#c9b0f0' },
  draft: { bg: 'rgba(230,190,70,0.16)', border: '#e6be46', fg: '#f0dd8a' },
  submitted: { bg: 'rgba(90,150,240,0.14)', border: '#5a96f0', fg: '#a9c7ff' },
  approved: { bg: 'rgba(80,200,120,0.14)', border: '#4fb477', fg: '#8fe0ac' },
  rejected: { bg: 'rgba(255,107,107,0.14)', border: 'var(--hx-danger, #ff6b6b)', fg: '#ff9d9d' },
  diff: { bg: 'rgba(130,120,230,0.16)', border: '#8278e6', fg: '#bcb4ff' },
};
