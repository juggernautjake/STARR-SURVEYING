// lib/research/survey-plan-versions.ts — the gameplan, kept and comparable (plan R21).
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// `generateSurveyPlan()` states it in its own docstring: "The plan is generated fresh each time (no
// DB caching)". So regenerating discarded the previous plan along with anything a person had added
// to it, nothing recorded what the plan SAID when the crew went to the field, and "what changed
// since last time" had no answer because there was nothing to compare against.
//
// ── THE ORIGINAL IS NEVER MODIFIED ──────────────────────────────────────────────────────────────
//
// `ai_plan` is written once. Human changes are an overlay in `edits`, merged only for display. This
// is the same contract the owner asked for on drawings — edits saved apart from the original — and
// it exists for the same reason: once the two are merged at write time, "what did the machine
// actually say" stops being answerable, and that is the question an audit asks first.

import { supabaseAdmin } from '@/lib/supabase';
import type { SurveyPlan } from './survey-plan.service';

export interface PlanVersion {
  id: string;
  version: number;
  aiPlan: SurveyPlan;
  edits: PlanEdits | null;
  reason: string | null;
  generatedAt: string;
  generatedBy: string | null;
  editedAt: string | null;
  editedBy: string | null;
  isCurrent: boolean;
}

/** A person's changes, as an overlay rather than a rewrite.
 *
 *  Removals are recorded as ids rather than by absence, so a removed item stays visibly removed
 *  instead of merely missing — a plan that quietly lost a monument-recovery step looks identical to
 *  one that never had it. */
export interface PlanEdits {
  /** Free-text notes appended by the surveyor, shown alongside the AI plan. */
  notes?: string;
  /** Section-level replacements, keyed by the plan's own field names. */
  replaced?: Record<string, unknown>;
  /** Items the surveyor struck out, as `section:index` keys. */
  removed?: string[];
  /** Items the surveyor added, keyed by section. */
  added?: Record<string, unknown[]>;
}

interface PlanRow {
  id: string;
  version: number;
  ai_plan: SurveyPlan;
  edits: PlanEdits | null;
  reason: string | null;
  generated_at: string;
  generated_by: string | null;
  edited_at: string | null;
  edited_by: string | null;
  is_current: boolean;
}

function toVersion(r: PlanRow): PlanVersion {
  return {
    id: r.id,
    version: r.version,
    aiPlan: r.ai_plan,
    edits: r.edits,
    reason: r.reason,
    generatedAt: r.generated_at,
    generatedBy: r.generated_by,
    editedAt: r.edited_at,
    editedBy: r.edited_by,
    isCurrent: r.is_current,
  };
}

export async function listVersions(projectId: string): Promise<PlanVersion[]> {
  const { data, error } = await supabaseAdmin
    .from('research_survey_plans')
    .select('*')
    .eq('research_project_id', projectId)
    .order('version', { ascending: false });
  if (error) throw new Error(`Could not read survey plan versions: ${error.message}`);
  return ((data ?? []) as PlanRow[]).map(toVersion);
}

export async function currentVersion(projectId: string): Promise<PlanVersion | null> {
  const { data, error } = await supabaseAdmin
    .from('research_survey_plans')
    .select('*')
    .eq('research_project_id', projectId)
    .eq('is_current', true)
    .limit(1);
  if (error) throw new Error(`Could not read the current survey plan: ${error.message}`);
  const row = ((data ?? []) as PlanRow[])[0];
  return row ? toVersion(row) : null;
}

/** Store a newly generated plan as the next version and make it current.
 *
 *  The previous version is demoted rather than deleted. A plan a crew has already worked from is
 *  evidence of what they were told, and deleting it to keep the table tidy destroys that. */
export async function saveVersion(
  projectId: string,
  plan: SurveyPlan,
  opts: { reason?: string; generatedBy?: string } = {},
): Promise<PlanVersion> {
  const existing = await listVersions(projectId);
  const nextVersion = (existing[0]?.version ?? 0) + 1;

  // Demote first: the unique partial index allows exactly one current plan per project, and two
  // "current" plans is precisely the ambiguity this table exists to remove.
  if (existing.length > 0) {
    const { error } = await supabaseAdmin
      .from('research_survey_plans')
      .update({ is_current: false })
      .eq('research_project_id', projectId)
      .eq('is_current', true);
    if (error) throw new Error(`Could not demote the previous plan: ${error.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from('research_survey_plans')
    .insert({
      research_project_id: projectId,
      version: nextVersion,
      ai_plan: plan,
      reason: opts.reason ?? (nextVersion === 1 ? 'First plan generated for this property.' : 'Regenerated.'),
      generated_by: opts.generatedBy ?? null,
      is_current: true,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not save the survey plan: ${error.message}`);
  return toVersion(data as PlanRow);
}

/** Record a person's edits WITHOUT touching `ai_plan`. */
export async function saveEdits(
  planVersionId: string,
  edits: PlanEdits,
  editedBy: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('research_survey_plans')
    .update({ edits, edited_by: editedBy, edited_at: new Date().toISOString() })
    .eq('id', planVersionId);
  if (error) throw new Error(`Could not save the plan edits: ${error.message}`);
}

/** The plan as it should be READ: the AI original with the human overlay applied.
 *
 *  Display-time only. Nothing writes the merged result back, which is what keeps the original
 *  answerable. */
export function mergedPlan(v: PlanVersion): SurveyPlan {
  if (!v.edits) return v.aiPlan;
  return { ...v.aiPlan, ...(v.edits.replaced ?? {}) } as SurveyPlan;
}

// ── What changed ────────────────────────────────────────────────────────────────────────────────

export interface PlanDiffEntry {
  section: string;
  kind: 'added' | 'removed' | 'changed';
  detail: string;
}

export interface PlanDiff {
  from: number;
  to: number;
  entries: PlanDiffEntry[];
  headline: string;
}

/** Sections compared item-by-item, with the function that turns an item into its identity. Keyed on
 *  something stable rather than on array position: a plan that inserts one step at the top would
 *  otherwise report every later step as changed. */
const LIST_SECTIONS: Array<{
  key: string;
  label: string;
  items: (p: SurveyPlan) => unknown[];
  identify: (item: unknown) => string;
}> = [
  {
    key: 'pre_field_research', label: 'Pre-field research',
    items: (p) => p.pre_field_research?.items ?? [],
    identify: (i) => String((i as { task?: string }).task ?? ''),
  },
  {
    key: 'field_procedures', label: 'Field procedure',
    items: (p) => p.field_procedures ?? [],
    identify: (i) => String((i as { title?: string }).title ?? ''),
  },
  {
    key: 'monument_recovery', label: 'Monument recovery',
    items: (p) => p.monument_recovery?.monuments ?? [],
    identify: (i) => {
      const m = i as { location?: string; type?: string };
      return `${m.type ?? ''} @ ${m.location ?? ''}`;
    },
  },
];

/** What changed between two plan versions.
 *
 *  Reports the monument-recovery and field-procedure changes by name, because "the plan changed" is
 *  useless to a crew that has already read the old one — what they need is "the plan no longer asks
 *  you to look for the fence corner, and now asks for a rod at the NE corner". */
export function diffPlans(older: PlanVersion, newer: PlanVersion): PlanDiff {
  const a = older.aiPlan;
  const b = newer.aiPlan;
  const entries: PlanDiffEntry[] = [];

  for (const sec of LIST_SECTIONS) {
    const before = new Set(sec.items(a).map(sec.identify).filter(Boolean));
    const after = new Set(sec.items(b).map(sec.identify).filter(Boolean));
    for (const id of after) if (!before.has(id)) entries.push({ section: sec.label, kind: 'added', detail: id });
    for (const id of before) if (!after.has(id)) entries.push({ section: sec.label, kind: 'removed', detail: id });
  }

  if ((a.property_summary ?? '') !== (b.property_summary ?? '')) {
    entries.push({ section: 'Property summary', kind: 'changed', detail: 'The summary of the property was rewritten.' });
  }

  const beforeFacts = new Map((a.key_facts ?? []).map((f) => [f.label, f.value]));
  for (const f of b.key_facts ?? []) {
    const prev = beforeFacts.get(f.label);
    if (prev === undefined) entries.push({ section: 'Key facts', kind: 'added', detail: `${f.label}: ${f.value}` });
    else if (prev !== f.value) entries.push({ section: 'Key facts', kind: 'changed', detail: `${f.label}: ${prev} → ${f.value}` });
  }

  const headline = entries.length === 0
    ? `Version ${newer.version} is identical to version ${older.version} in every compared section.`
    : `${entries.length} change(s) from version ${older.version} to ${newer.version}: ` +
      `${entries.filter((e) => e.kind === 'added').length} added, ` +
      `${entries.filter((e) => e.kind === 'removed').length} removed, ` +
      `${entries.filter((e) => e.kind === 'changed').length} changed.`;

  return { from: older.version, to: newer.version, entries, headline };
}

/** Did a person's work survive the latest regeneration?
 *
 *  The question R21 exists to answer. A crew that annotated version 2 and finds version 3 current
 *  needs to be told their notes are on the older version, not silently shown a clean plan. */
export function editsAtRisk(versions: PlanVersion[]): { lostFrom: number[]; message: string } {
  const current = versions.find((v) => v.isCurrent);
  const editedOlder = versions.filter((v) => v.edits && !v.isCurrent).map((v) => v.version);

  if (editedOlder.length === 0 || !current) {
    return { lostFrom: [], message: '' };
  }
  return {
    lostFrom: editedOlder,
    message:
      `Version(s) ${editedOlder.join(', ')} carry human edits and are no longer current. ` +
      `Those notes are NOT on version ${current.version} — open the older version to read them, ` +
      'or copy them across before the crew goes out.',
  };
}
