// lib/equipment/template-resolver.ts
//
// Phase F10.2g-a — equipment template composition resolver. Walks
// a template + its `composes_from` chain (up to MAX_DEPTH=4),
// dedupes items by (specific instrument | category) and sums
// quantities, dedupes personnel slots by slot_role and sums
// min/max + unions required_skills.
//
// Why a dedicated resolver instead of inlining the walk?
//   * Both the F10.2g-a preview endpoint and the F10.2g-b apply
//     endpoint need the exact same resolution semantics — keeping
//     them in one pure function makes drift impossible.
//   * The §5.12.3 spec is explicit about composition behaviour
//     ("OSHA road-work add-on injects flagger; quantities sum
//     across parents for consumables; cycles blocked by
//     MAX_DEPTH=4"). Centralising that logic gives one place to
//     unit-test against the spec.
//
// Resolution rules (binding):
//   1. Walk depth-first: self → composes_from[0] → its parents
//      → … up to MAX_DEPTH=4. Cycle detection via a visited set
//      raises `cycle_detected` rather than infinite-looping.
//   2. Items dedupe by:
//        - `equipment_inventory_id` when set (specific instrument)
//        - `cat:<category>` when category mode
//      Same key across parents → quantity sums; is_required ORs
//      (any required wins); notes concatenate; sort_order picks
//      the smallest (= rendered first); source_template_ids
//      collects the contributing templates for audit.
//   3. Personnel slots dedupe by `slot_role`:
//        - min/max sum
//        - required_skills union (lowercase + dedupe)
//        - source_template_ids accumulate.
//      So a base "{rpls × 1, field_tech × 1-2}" + OSHA add-on
//      "{flagger × 1}" yields three slots; two parents both
//      asking for one flagger yields one slot with min=2 max=2.
//
// MAX_DEPTH=4 is the practical cap — composition is "base + 1-2
// add-ons" in real use; the guard makes a typo (cycle in
// composes_from) safe rather than allowing the resolver to
// hang.

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export const MAX_COMPOSITION_DEPTH = 4;

export interface TemplateHeader {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  job_type: string | null;
  default_crew_size: number | null;
  default_duration_hours: number | null;
  requires_certifications: string[];
  required_personnel_slots: unknown;
  composes_from: string[];
  version: number;
  is_archived: boolean;
}

export interface RawItem {
  id: string;
  template_id: string;
  item_kind: string;
  equipment_inventory_id: string | null;
  category: string | null;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
}

export interface ResolvedItem {
  /** Composite key: 'unit:<uuid>' or 'cat:<category>'. */
  key: string;
  item_kind: string;
  equipment_inventory_id: string | null;
  category: string | null;
  quantity: number;
  is_required: boolean;
  notes: string | null;
  sort_order: number;
  /** Every template that contributed to this resolved row. */
  source_template_ids: string[];
}

export interface RawSlot {
  slot_role: string;
  min?: number;
  max?: number;
  required_skills?: string[];
}

export interface ResolvedSlot {
  slot_role: string;
  min: number;
  max: number;
  required_skills: string[];
  source_template_ids: string[];
}

export interface ResolvedTemplate {
  /** Top-level template — the one the dispatcher applied. */
  root: TemplateHeader;
  items: ResolvedItem[];
  personnel_slots: ResolvedSlot[];
  /**
   * Ordered list of every template id walked, in DFS order.
   * Useful for the preview UI to show the composition chain
   * and for the audit log to record which versions contributed.
   */
  resolution_chain: string[];
  /** Maximum depth actually walked (1 = just the root). */
  resolution_depth: number;
}

export interface ResolverError {
  error: 'cycle_detected' | 'depth_exceeded' | 'archived_parent' | 'missing_template';
  template_id: string;
  detail?: string;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Resolve a template against its composition chain. Returns
 * either the fully-resolved view or a typed ResolverError so
 * the caller can surface a clean reason.
 *
 * Pass `client` to participate in an open transaction (the
 * F10.2g-b apply handler does this so the resolver sees the
 * exact same snapshot the inserts will see).
 */
export async function resolveTemplate(
  templateId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<{ resolved: ResolvedTemplate } | { error: ResolverError }> {
  const visited = new Set<string>();
  const chain: string[] = [];
  let maxDepth = 0;

  // (key → ResolvedItem) accumulator + (slot_role → ResolvedSlot)
  // accumulator. Walk DFS into composes_from before merging the
  // current template's items so the parent contribution lands
  // first and the child's quantities/skills accumulate on top.
  const itemAcc = new Map<string, ResolvedItem>();
  const slotAcc = new Map<string, ResolvedSlot>();

  let rootHeader: TemplateHeader | null = null;

  async function walk(
    id: string,
    depth: number
  ): Promise<ResolverError | null> {
    if (depth > MAX_COMPOSITION_DEPTH) {
      return {
        error: 'depth_exceeded',
        template_id: id,
        detail: `Composition chain exceeded MAX_DEPTH=${MAX_COMPOSITION_DEPTH}.`,
      };
    }
    if (visited.has(id)) {
      return {
        error: 'cycle_detected',
        template_id: id,
        detail:
          'Template appears twice in the composition chain — cycle.',
      };
    }
    visited.add(id);
    chain.push(id);
    if (depth > maxDepth) maxDepth = depth;

    const headerRes = await client
      .from('equipment_templates')
      .select(
        'id, name, slug, description, job_type, default_crew_size, ' +
          'default_duration_hours, requires_certifications, ' +
          'required_personnel_slots, composes_from, version, is_archived'
      )
      .eq('id', id)
      .maybeSingle();
    if (headerRes.error) {
      throw new Error(
        `resolveTemplate: header read failed for ${id}: ` +
          headerRes.error.message
      );
    }
    if (!headerRes.data) {
      return {
        error: 'missing_template',
        template_id: id,
        detail:
          depth === 1
            ? 'Top-level template not found.'
            : 'Parent template referenced in composes_from is missing.',
      };
    }
    const header = headerRes.data as TemplateHeader;

    // Block archived parents — applying a template that pulls
    // through an archived parent would hide silent staleness.
    // The TOP-LEVEL template can be archived (the dispatcher is
    // re-applying an old loadout); only mid-chain archived
    // parents block.
    if (depth > 1 && header.is_archived) {
      return {
        error: 'archived_parent',
        template_id: id,
        detail: `Parent template '${header.name}' is archived.`,
      };
    }

    if (depth === 1) rootHeader = header;

    // Walk parents first (DFS) so the child's contribution
    // overlays at the leaves.
    for (const parentId of header.composes_from ?? []) {
      const err = await walk(parentId, depth + 1);
      if (err) return err;
    }

    // Items
    const itemsRes = await client
      .from('equipment_template_items')
      .select(
        'id, template_id, item_kind, equipment_inventory_id, category, ' +
          'quantity, is_required, notes, sort_order'
      )
      .eq('template_id', id)
      .order('sort_order', { ascending: true });
    if (itemsRes.error) {
      throw new Error(
        `resolveTemplate: items read failed for ${id}: ` +
          itemsRes.error.message
      );
    }
    for (const raw of (itemsRes.data ?? []) as RawItem[]) {
      const key = raw.equipment_inventory_id
        ? `unit:${raw.equipment_inventory_id}`
        : raw.category
        ? `cat:${raw.category}`
        : `id:${raw.id}`;
      const existing = itemAcc.get(key);
      if (existing) {
        existing.quantity += raw.quantity;
        existing.is_required = existing.is_required || raw.is_required;
        if (raw.notes) {
          existing.notes = existing.notes
            ? `${existing.notes} | ${raw.notes}`
            : raw.notes;
        }
        existing.sort_order = Math.min(existing.sort_order, raw.sort_order);
        if (!existing.source_template_ids.includes(raw.template_id)) {
          existing.source_template_ids.push(raw.template_id);
        }
      } else {
        itemAcc.set(key, {
          key,
          item_kind: raw.item_kind,
          equipment_inventory_id: raw.equipment_inventory_id,
          category: raw.category,
          quantity: raw.quantity,
          is_required: raw.is_required,
          notes: raw.notes,
          sort_order: raw.sort_order,
          source_template_ids: [raw.template_id],
        });
      }
    }

    // Personnel slots — JSONB on the template header.
    const slots = parseSlots(header.required_personnel_slots);
    for (const raw of slots) {
      const slotRole = raw.slot_role.trim();
      if (!slotRole) continue;
      const existing = slotAcc.get(slotRole);
      const reqSkills = (raw.required_skills ?? [])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (existing) {
        existing.min += raw.min ?? 1;
        existing.max += raw.max ?? raw.min ?? 1;
        for (const sk of reqSkills) {
          if (!existing.required_skills.includes(sk)) {
            existing.required_skills.push(sk);
          }
        }
        if (!existing.source_template_ids.includes(id)) {
          existing.source_template_ids.push(id);
        }
      } else {
        slotAcc.set(slotRole, {
          slot_role: slotRole,
          min: raw.min ?? 1,
          max: raw.max ?? raw.min ?? 1,
          required_skills: reqSkills,
          source_template_ids: [id],
        });
      }
    }

    return null;
  }

  const err = await walk(templateId, 1);
  if (err) return { error: err };
  if (!rootHeader) {
    // Defensive — walk should always populate rootHeader when
    // depth=1 succeeds.
    return {
      error: {
        error: 'missing_template',
        template_id: templateId,
        detail: 'Resolver completed without populating root header.',
      },
    };
  }

  const items = Array.from(itemAcc.values()).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const personnelSlots = Array.from(slotAcc.values()).sort((a, b) =>
    a.slot_role.localeCompare(b.slot_role)
  );

  return {
    resolved: {
      root: rootHeader,
      items,
      personnel_slots: personnelSlots,
      resolution_chain: chain,
      resolution_depth: maxDepth,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────

function parseSlots(raw: unknown): RawSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: RawSlot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const slotRole = typeof obj.slot_role === 'string' ? obj.slot_role : '';
    if (!slotRole) continue;
    const min = typeof obj.min === 'number' ? obj.min : undefined;
    const max = typeof obj.max === 'number' ? obj.max : undefined;
    const required_skills = Array.isArray(obj.required_skills)
      ? (obj.required_skills as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : undefined;
    out.push({ slot_role: slotRole, min, max, required_skills });
  }
  return out;
}
