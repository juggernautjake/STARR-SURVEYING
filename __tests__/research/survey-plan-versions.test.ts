// The gameplan, kept and comparable (research plan R21).
//
// `generateSurveyPlan()` states it in its own docstring: "The plan is generated fresh each time (no
// DB caching) because the underlying data changes as analysis progresses." Three consequences:
//
//   1. Regenerating silently discarded the previous plan, and anything a person added to it.
//   2. Nothing recorded what the plan SAID when the crew went to the field — the version that
//      matters if the survey is ever questioned.
//   3. "What changed since last time" had no answer, because there was nothing to compare against.
//
// And the route called it on every GET, so a page refresh burned AI tokens and produced a different
// plan: the document a crew was working from changed underneath them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  diffPlans,
  editsAtRisk,
  mergedPlan,
  type PlanVersion,
} from '@/lib/research/survey-plan-versions';
import type { SurveyPlan } from '@/lib/research/survey-plan.service';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const plan = (over: Partial<SurveyPlan> = {}): SurveyPlan => ({
  property_summary: 'A 2.45 acre tract in Bell County.',
  key_facts: [{ label: 'Acreage', value: '2.45' }],
  pre_field_research: { title: 'Pre-field', description: '', items: [{ done: false, task: 'Pull the 1968 deed' }] },
  equipment_checklist: { title: 'Equipment', items: [] },
  field_procedures: [{ step: 1, phase: 'recon', title: 'Walk the perimeter', plain_english: '' }],
  monument_recovery: {
    title: 'Monuments', description: '',
    monuments: [{ location: 'NE corner', type: '1/2" iron rod', search_method: '', found_action: '', not_found_action: '' }],
  },
  ...over,
} as SurveyPlan);

const version = (v: number, p: SurveyPlan, over: Partial<PlanVersion> = {}): PlanVersion => ({
  id: `pv-${v}`,
  version: v,
  aiPlan: p,
  edits: null,
  reason: null,
  generatedAt: '2026-08-02T00:00:00.000Z',
  generatedBy: null,
  editedAt: null,
  editedBy: null,
  isCurrent: false,
  ...over,
});

describe('the AI original is never modified', () => {
  it('applies edits only at display time', () => {
    // Merging at write time would destroy the only copy of what the machine actually said, which is
    // the question an audit asks first.
    const v = version(1, plan(), { edits: { replaced: { property_summary: 'Rewritten by the RPLS.' } } });
    expect(mergedPlan(v).property_summary).toBe('Rewritten by the RPLS.');
    // The stored original is untouched.
    expect(v.aiPlan.property_summary).toBe('A 2.45 acre tract in Bell County.');
  });

  it('returns the original unchanged when nobody has edited', () => {
    const v = version(1, plan());
    expect(mergedPlan(v)).toBe(v.aiPlan);
  });

  it('never writes the merged result back', () => {
    const src = read('lib/research/survey-plan-versions.ts');
    const save = src.slice(src.indexOf('export async function saveEdits'));
    // saveEdits touches `edits`, `edited_by`, `edited_at` — never ai_plan.
    expect(save.slice(0, 500)).not.toContain('ai_plan');
  });
});

describe('what changed, by name', () => {
  it('reports a monument the plan no longer asks for', () => {
    // "The plan changed" is useless to a crew that already read the old one.
    const a = version(1, plan());
    const b = version(2, plan({
      monument_recovery: {
        title: 'Monuments', description: '',
        monuments: [{ location: 'SW corner', type: 'fence post', search_method: '', found_action: '', not_found_action: '' }],
      },
    }));
    const d = diffPlans(a, b);
    expect(d.entries).toContainEqual({ section: 'Monument recovery', kind: 'removed', detail: '1/2" iron rod @ NE corner' });
    expect(d.entries).toContainEqual({ section: 'Monument recovery', kind: 'added', detail: 'fence post @ SW corner' });
  });

  it('identifies items by content, not by position', () => {
    // Inserting one step at the top would otherwise report every later step as changed.
    const a = version(1, plan());
    const b = version(2, plan({
      field_procedures: [
        { step: 1, phase: 'recon', title: 'Call the owner', plain_english: '' },
        { step: 2, phase: 'recon', title: 'Walk the perimeter', plain_english: '' },
      ],
    }));
    const d = diffPlans(a, b);
    expect(d.entries.filter((e) => e.section === 'Field procedure')).toEqual([
      { section: 'Field procedure', kind: 'added', detail: 'Call the owner' },
    ]);
  });

  it('shows a changed key fact as before → after', () => {
    const d = diffPlans(version(1, plan()), version(2, plan({ key_facts: [{ label: 'Acreage', value: '2.51' }] })));
    expect(d.entries).toContainEqual({ section: 'Key facts', kind: 'changed', detail: 'Acreage: 2.45 → 2.51' });
  });

  it('says plainly when nothing changed', () => {
    expect(diffPlans(version(1, plan()), version(2, plan())).headline).toContain('identical to version 1');
  });
});

describe('edits left behind on an older version', () => {
  it('warns that the notes are not on the current plan', () => {
    // A crew that annotated version 2 and finds version 3 current must be told, not silently shown
    // a clean plan.
    const r = editsAtRisk([
      version(3, plan(), { isCurrent: true }),
      version(2, plan(), { edits: { notes: 'Gate is locked, call ahead' } }),
    ]);
    expect(r.lostFrom).toEqual([2]);
    expect(r.message).toContain('NOT on version 3');
    expect(r.message).toContain('before the crew goes out');
  });

  it('says nothing when the current version carries the edits', () => {
    const r = editsAtRisk([version(1, plan(), { isCurrent: true, edits: { notes: 'x' } })]);
    expect(r.lostFrom).toEqual([]);
    expect(r.message).toBe('');
  });
});

describe('the storage contract', () => {
  const seed = read('seeds/533_research_survey_plans.sql');

  it('allows exactly one current plan per project', () => {
    // Two "current" plans is precisely the ambiguity the table exists to remove.
    expect(seed).toMatch(/CREATE UNIQUE INDEX[\s\S]*idx_survey_plans_one_current[\s\S]*WHERE is_current/);
  });

  it('keeps the original and the edits in separate columns', () => {
    expect(seed).toContain('ai_plan             JSONB NOT NULL');
    expect(seed).toContain('edits               JSONB');
  });

  it('records WHY a version exists', () => {
    // Without it a version list is a list of timestamps.
    expect(seed).toContain('reason              TEXT');
  });

  it('demotes rather than deletes the previous version', () => {
    // A plan a crew has already worked from is evidence of what they were told.
    const src = read('lib/research/survey-plan-versions.ts');
    expect(src).toContain("update({ is_current: false })");
    expect(src).not.toMatch(/\.delete\(\)/);
  });
});

describe('regenerating is an action, not a page view', () => {
  const route = read('app/api/admin/research/[projectId]/survey-plan/route.ts');

  it('stops rewriting the plan on every GET', () => {
    // It burned AI tokens on a refresh AND changed the document underneath the crew.
    const get = route.slice(route.indexOf('export const GET'), route.indexOf('export const POST'));
    expect(get).toContain('currentVersion(projectId)');
    expect(get).toContain('if (!current)');
  });

  it('regenerates only on POST, as a new version', () => {
    expect(route).toContain('export const POST');
    const post = route.slice(route.indexOf('export const POST'));
    expect(post).toContain('saveVersion(projectId, plan');
  });

  it('returns what changed when a previous version existed', () => {
    const post = route.slice(route.indexOf('export const POST'));
    expect(post).toContain('diffPlans(previous, saved)');
  });

  it('surfaces the version and any stranded edits to the panel', () => {
    const panel = read('app/admin/research/components/SurveyPlanPanel.tsx');
    expect(panel).toContain('Regenerate as a new version');
    expect(panel).toContain('editsAtRisk');
  });
});
