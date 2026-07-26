// lib/dnd/variant-view.ts — build the ready-to-render card model for the variant browser (VT). The sheet page
// (a server component) has every sheet's `data`; this turns active + stored slots into a flat, serializable
// VariantCard[] with the character name, per-class level line, tags, lineage and summary freshness already
// computed — so the client component renders without fetching or re-deriving.
import { normalizeSystem, systemLabel } from './systems';
import {
  readVariants, variantKind, variantKindLabel, variantSystemOf, resolveOriginSlotId,
  type ActiveSheet, type SystemVariants, type SheetVariantKind,
} from './system-variants';
import { sheetClassBreakdown, breakdownLabel, type ClassBreakdownEntry } from './variant-breakdown';
import { sheetSummaryHash } from './variant-summary';
import { variantTags, type VariantTag, type SubmissionStatusLite } from './variant-tags';
import { sheetExceptionLabels } from './slots/sheet-exceptions';

export interface VariantCard {
  slotId: string;
  active: boolean;
  origin: boolean;
  /** The character's own name (from the sheet data) — the card title. */
  name: string;
  /** The slot's secondary label (custom name or "D&D 5e (2024) · Vanilla"). */
  slotLabel: string;
  /** The name the PLAYER gave this version, or null when they never named it (so `slotLabel` is the
   *  generated fallback). The card needs the distinction: the naming step promises "every version shows
   *  its name on the shelf", and printing the generated "Intuitive Games · Vanilla" fallback in the name's
   *  place would both break that promise and duplicate the tags. Kept separate from `slotLabel` rather than
   *  having the UI re-derive the default, which would put the fallback rule in two places. */
  customName: string | null;
  system: string;
  systemLabel: string;
  artUrl: string | null;
  level: number;
  levelLabel: string;
  classes: ClassBreakdownEntry[];
  tags: VariantTag[];
  summary: string | null;
  summaryUpdatedAt: string | null;
  /** Summary exists but the sheet changed since it was generated. */
  summaryStale: boolean;
  parentSlotId: string | null;
  /** The parent variant's title, for the "branched from …" line. */
  parentName: string | null;
  /** What makes this version "Altered vanilla", already worded — e.g. ["Magic Initiate (DM-granted,
   *  level 4)"]. Empty for a plain vanilla or custom build (slot plan S8b).
   *
   *  The tag alone says only that SOMETHING changed, which the owner explicitly asked it not to do:
   *  "we need it to be clear that something is not the usual". A badge that reports a departure without
   *  naming it is the same problem in a nicer font. */
  exceptions: string[];
}

/**
 * The campaign a given version actually belongs to: its OWN per-slot assignment, else — for the original
 * only — the character-level campaign. Variants are **personal until explicitly assigned**, which is why a
 * character whose original sits in a campaign can still have purely personal branches.
 *
 * Exported because this rule decides more than a tag: campaign-scoped chrome (DM approval, house rules)
 * must follow the VERSION being viewed, not the character row. Reading `character.campaign_id` directly is
 * the bug this prevents — it shows "Awaiting DM review" over a personal variant no DM can see.
 */
export function effectiveCampaignId(
  slotCampaignId: string | null | undefined,
  isOrigin: boolean,
  characterCampaignId: string | null | undefined,
): string | null {
  return slotCampaignId ?? (isOrigin ? (characterCampaignId ?? null) : null);
}

export interface VariantViewContext {
  characterName: string;
  characterCampaignId?: string | null;
  /** campaignId → display name, for the Campaign tag. */
  campaignNames?: Record<string, string>;
  isNpc?: boolean;
  underConstruction?: boolean;
  submissionStatus?: SubmissionStatusLite;
  hasDmGranted?: boolean;
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The character's display name from a sheet's `data`, branching by system (PF2/IG sidecars vs shared meta). */
function characterNameOf(data: unknown, system: string, fallback: string): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const sys = normalizeSystem(system);
  if (sys === 'pathfinder2e') { const n = asStr(((d.pf2e as { identity?: { name?: unknown } })?.identity)?.name); if (n) return n; }
  if (sys === 'intuitive-games') { const n = asStr(((d.ig as { identity?: { name?: unknown } })?.identity)?.name); if (n) return n; }
  const meta = asStr((d.meta as { name?: unknown })?.name);
  return meta || fallback;
}

/** Default slot label when the user hasn't named the slot: "D&D 5e (2024) · Vanilla". */
function defaultSlotLabel(system: string, kind: SheetVariantKind): string {
  // One source for the wording, so a third kind can't render as "Vanilla" here and "Altered vanilla" there.
  return `${systemLabel(system)} · ${variantKindLabel(kind)}`;
}

interface SheetRef {
  slotId: string; active: boolean; data: unknown; system: string; kind: SheetVariantKind;
  name?: string; artUrl: string | null; parentSlotId: string | null; campaignId: string | null;
  summary: string | null; summaryUpdatedAt: string | null; summaryHash: string | null;
}

/** Flatten active + stored slots into one ref list (active first) with the fields the cards need. Working-copy
 *  DRAFTS are excluded — they're transient edit sessions, not versions to browse. */
function sheetRefs(active: ActiveSheet, variants: SystemVariants): SheetRef[] {
  const activeId = active.slotId ?? `active:${normalizeSystem(active.system)}`;
  const refs: SheetRef[] = [];
  if (!active.draft) refs.push({
    slotId: activeId, active: true, data: active.data, system: normalizeSystem(active.system), kind: variantKind(active),
    name: active.name, artUrl: active.artUrl ?? null, parentSlotId: active.parentSlotId ?? null,
    campaignId: active.campaignId ?? null, summary: active.summary ?? null,
    summaryUpdatedAt: active.summaryUpdatedAt ?? null, summaryHash: active.summaryHash ?? null,
  });
  for (const [k, v] of Object.entries(variants)) {
    if (v.draft) continue; // never list a stale/parked draft as a version
    refs.push({
      slotId: k, active: false, data: v.data, system: variantSystemOf(v, k), kind: variantKind(v),
      name: v.name, artUrl: v.artUrl ?? null, parentSlotId: v.parentSlotId ?? null,
      campaignId: v.campaignId ?? null, summary: v.summary ?? null,
      summaryUpdatedAt: v.summaryUpdatedAt ?? null, summaryHash: v.summaryHash ?? null,
    });
  }
  return refs;
}

/** Build the full card model for the variant browser. */
export function buildVariantCards(active: ActiveSheet, variants: SystemVariants, ctx: VariantViewContext): VariantCard[] {
  const refs = sheetRefs(active, variants);
  const originId = resolveOriginSlotId(active, variants);
  const originRef = refs.find((r) => r.slotId === originId) ?? refs[0];
  const originSystem = originRef.system;
  const nameOf = (r: SheetRef) => characterNameOf(r.data, r.system, r.name || ctx.characterName);
  const campaignNames = ctx.campaignNames ?? {};

  return refs.map((r) => {
    const origin = r.slotId === originId;
    const breakdown = sheetClassBreakdown(r.data, r.system);
    // The campaign this version is in: its own per-slot assignment, else (for the original only) the
    // character-level campaign. Variants are personal until explicitly assigned.
    const effCampaignId = effectiveCampaignId(r.campaignId, origin, ctx.characterCampaignId);
    const campaignName = effCampaignId ? (campaignNames[effCampaignId] ?? null) : null;
    // Stale = we have a summary + the hash it was built from, and the sheet has changed since.
    const summaryStale = !!(r.summary && r.summaryHash && r.summaryHash !== sheetSummaryHash(r.data, r.system));

    // Is this version still an exact copy of the one it branched from? Derived from the sheet CONTENT
    // rather than a stored "isDuplicate" flag, so it clears itself the instant the copy is edited — a
    // stored flag would have to be cleared by every write path, and would go stale the first time one
    // forgot. Same-system only: two systems' sheets are never byte-comparable.
    const parent = r.parentSlotId ? refs.find((p) => p.slotId === r.parentSlotId) : undefined;
    const duplicateOf = parent
      && normalizeSystem(parent.system) === normalizeSystem(r.system)
      && sheetSummaryHash(parent.data, parent.system) === sheetSummaryHash(r.data, r.system)
      ? nameOf(parent)
      : null;

    const tags = variantTags({
      origin, active: r.active, system: r.system, kind: r.kind,
      multiclass: breakdown.multiclass, isNpc: ctx.isNpc, underConstruction: ctx.underConstruction && origin,
      campaignName, inCampaign: !!effCampaignId,
      submissionStatus: origin ? ctx.submissionStatus : null,
      differentSystemFromOrigin: normalizeSystem(r.system) !== normalizeSystem(originSystem),
      duplicateOf,
      hasDmGranted: ctx.hasDmGranted,
    });

    return {
      slotId: r.slotId,
      active: r.active,
      origin,
      name: nameOf(r),
      slotLabel: (r.name && r.name.trim()) || defaultSlotLabel(r.system, r.kind),
      customName: (r.name && r.name.trim()) || null,
      system: r.system,
      systemLabel: systemLabel(r.system),
      artUrl: r.artUrl,
      level: breakdown.level,
      levelLabel: breakdownLabel(breakdown) || `Level ${breakdown.level}`,
      classes: breakdown.classes,
      tags,
      summary: r.summary,
      summaryUpdatedAt: r.summaryUpdatedAt,
      summaryStale,
      parentSlotId: r.parentSlotId,
      parentName: r.parentSlotId ? (refs.find((x) => x.slotId === r.parentSlotId) ? nameOf(refs.find((x) => x.slotId === r.parentSlotId)!) : null) : null,
      // Read from the slot's own data, which this builder already holds — so naming the exceptions needs no
      // extra load and no change to the page. A CUSTOM version reports none: it never claimed to follow the
      // rules, so "exceptions" is not a meaningful thing to list against it.
      exceptions: r.kind === 'custom' ? [] : sheetExceptionLabels(r.data, r.system),
    };
  });
}
