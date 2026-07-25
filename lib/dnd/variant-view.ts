// lib/dnd/variant-view.ts — build the ready-to-render card model for the variant browser (VT). The sheet page
// (a server component) has every sheet's `data`; this turns active + stored slots into a flat, serializable
// VariantCard[] with the character name, per-class level line, tags, lineage and summary freshness already
// computed — so the client component renders without fetching or re-deriving.
import { normalizeSystem, systemLabel } from './systems';
import {
  readVariants, variantKind, variantSystemOf, resolveOriginSlotId, type ActiveSheet, type SystemVariants,
} from './system-variants';
import { sheetClassBreakdown, breakdownLabel, type ClassBreakdownEntry } from './variant-breakdown';
import { sheetSummaryHash } from './variant-summary';
import { variantTags, type VariantTag, type SubmissionStatusLite } from './variant-tags';

export interface VariantCard {
  slotId: string;
  active: boolean;
  origin: boolean;
  /** The character's own name (from the sheet data) — the card title. */
  name: string;
  /** The slot's secondary label (custom name or "D&D 5e (2024) · Vanilla"). */
  slotLabel: string;
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
function defaultSlotLabel(system: string, kind: 'vanilla' | 'custom'): string {
  return `${systemLabel(system)} · ${kind === 'custom' ? 'Custom-built' : 'Vanilla'}`;
}

interface SheetRef {
  slotId: string; active: boolean; data: unknown; system: string; kind: 'vanilla' | 'custom';
  name?: string; artUrl: string | null; parentSlotId: string | null; campaignId: string | null;
  summary: string | null; summaryUpdatedAt: string | null; summaryHash: string | null;
}

/** Flatten active + stored slots into one ref list (active first) with the fields the cards need. */
function sheetRefs(active: ActiveSheet, variants: SystemVariants): SheetRef[] {
  const activeId = active.slotId ?? `active:${normalizeSystem(active.system)}`;
  const refs: SheetRef[] = [{
    slotId: activeId, active: true, data: active.data, system: normalizeSystem(active.system), kind: variantKind(active),
    name: active.name, artUrl: active.artUrl ?? null, parentSlotId: active.parentSlotId ?? null,
    campaignId: active.campaignId ?? null, summary: active.summary ?? null,
    summaryUpdatedAt: active.summaryUpdatedAt ?? null, summaryHash: active.summaryHash ?? null,
  }];
  for (const [k, v] of Object.entries(variants)) {
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
    const effCampaignId = r.campaignId ?? (origin ? (ctx.characterCampaignId ?? null) : null);
    const campaignName = effCampaignId ? (campaignNames[effCampaignId] ?? null) : null;
    // Stale = we have a summary + the hash it was built from, and the sheet has changed since.
    const summaryStale = !!(r.summary && r.summaryHash && r.summaryHash !== sheetSummaryHash(r.data, r.system));

    const tags = variantTags({
      origin, active: r.active, system: r.system, kind: r.kind,
      multiclass: breakdown.multiclass, isNpc: ctx.isNpc, underConstruction: ctx.underConstruction && origin,
      campaignName, inCampaign: !!effCampaignId,
      submissionStatus: origin ? ctx.submissionStatus : null,
      differentSystemFromOrigin: normalizeSystem(r.system) !== normalizeSystem(originSystem),
      hasDmGranted: ctx.hasDmGranted,
    });

    return {
      slotId: r.slotId,
      active: r.active,
      origin,
      name: nameOf(r),
      slotLabel: (r.name && r.name.trim()) || defaultSlotLabel(r.system, r.kind),
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
    };
  });
}
