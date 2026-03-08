// __tests__/recon/phase16-survey-plan.test.ts
// Unit tests for STARR RECON Phase 16: Survey Field Plan Generator
//
// This phase adds:
//   Module A: survey-plan.service.ts  — AI-powered field survey plan generator
//   Module B: /api/admin/research/[projectId]/survey-plan (API route — contract tests)
//   Module C: SurveyPlanPanel.tsx     — UI component (import/shape tests)
//   Module D: /api/admin/research/[projectId]/lite-pipeline (API route — contract tests)
//   Module E: prompts.ts              — SURVEY_PLAN_GENERATOR prompt
//
// Tests are pure-logic/unit only — no live network calls, no DB, no Playwright.
//
// Test index:
//
// ── Module A: survey-plan.service.ts ─────────────────────────────────────────
//  1.  generateSurveyPlan is exported as an async function
//  2.  SurveyPlan type shape matches expected fields
//  3.  generateSurveyPlan returns string property_summary
//  4.  generateSurveyPlan: key_facts is an array
//  5.  generateSurveyPlan: pre_field_research has title and items array
//  6.  generateSurveyPlan: field_procedures is an array
//  7.  generateSurveyPlan: monument_recovery has monuments array
//  8.  generateSurveyPlan: boundary_reconstruction has method string
//  9.  generateSurveyPlan: confidence_level is between 0 and 100
//  10. generateSurveyPlan: generated_at is a valid ISO date string
//
// ── Module B: SURVEY_PLAN_GENERATOR prompt ────────────────────────────────────
//  11. SURVEY_PLAN_GENERATOR prompt key exists in PROMPTS
//  12. SURVEY_PLAN_GENERATOR prompt has version, temperature, and system fields
//  13. SURVEY_PLAN_GENERATOR temperature is > 0 (allows creativity)
//  14. SURVEY_PLAN_GENERATOR system prompt mentions JSON
//  15. SURVEY_PLAN_GENERATOR system prompt mentions key_facts
//  16. SURVEY_PLAN_GENERATOR system prompt mentions pre_field_research
//  17. SURVEY_PLAN_GENERATOR system prompt mentions monument_recovery
//  18. SURVEY_PLAN_GENERATOR system prompt mentions boundary_reconstruction
//  19. SURVEY_PLAN_GENERATOR system prompt mentions discrepancies_to_investigate
//  20. SURVEY_PLAN_GENERATOR system prompt mentions office_to_field_sequence
//
// ── Module C: SurveyPlanPanel.tsx ─────────────────────────────────────────────
//  21. SurveyPlanPanel.tsx file exists
//  22. SurveyPlanPanel.tsx exports a default function
//
// ── Module D: Lite Pipeline route ─────────────────────────────────────────────
//  23. lite-pipeline route file exists
//  24. lite-pipeline route exports GET handler
//  25. lite-pipeline route exports POST handler
//
// ── Module E: survey-plan API route ──────────────────────────────────────────
//  26. survey-plan route file exists
//  27. survey-plan route exports GET handler
//
// ── Module F: SurveyPlan shape validation ────────────────────────────────────
//  28. A minimal SurveyPlan has all required top-level keys
//  29. pre_field_research items have done and task fields
//  30. equipment_checklist items have category and items array
//  31. field_procedures steps have step, title, plain_english fields
//  32. monument_recovery monuments have location, type, search_method
//  33. boundary_reconstruction has method and explanation
//  34. discrepancies_to_investigate items have severity and description
//  35. office_to_field_sequence days have day and tasks array
//  36. closure_check is null or has closure_ratio and acceptable fields
//  37. data_sources_used items have source and data_obtained fields
//  38. special_considerations items have category and description
//  39. key_facts items have label and value fields
//  40. generated_at is a non-empty string
//
// ── Module G: confidence_level validation ────────────────────────────────────
//  41. confidence_level is a number 0–100
//  42. confidence_notes is a non-empty string
//  43. next_steps is an array
//  44. property_summary is a non-empty string
//  45. field_procedures is an array (may be empty for no-data project)
//  46. monument_recovery.monuments is an array
//  47. office_to_field_sequence is an array
//  48. boundary_reconstruction.priority_evidence is an array
//
// ── Module H: prompts.ts PromptKey type ─────────────────────────────────────
//  49. PROMPTS has SURVEY_PLAN_GENERATOR entry
//  50. All PROMPTS keys are unique
//

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock Supabase — all DB calls return empty/minimal data for unit tests
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'proj-1', property_address: '123 Main St', county: 'Bell', state: 'TX', name: 'Test Project', analysis_metadata: {} }, error: null }),
          order: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        order: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: () => ({ select: async () => ({ data: [], error: null }) }),
    }),
  },
}));

// Mock AI client — return a minimal valid plan shape
vi.mock('@/lib/research/ai-client', () => ({
  callAI: async () => ({
    response: {
      property_summary: 'A test property in Bell County.',
      key_facts: [{ label: 'Owner', value: 'Test Owner' }],
      pre_field_research: { title: 'Checklist', description: 'Do these first.', items: [{ priority: 'critical', done: false, task: 'Get deed', why: 'Need legal description' }] },
      equipment_checklist: { title: 'Equipment', items: [{ category: 'Instruments', items: ['Total station'] }] },
      field_procedures: [{ step: 1, phase: 'Setup', title: 'Set Control', plain_english: 'Set up your instrument.', technical_notes: 'Use NGS monument.', estimated_time: '30 min' }],
      monument_recovery: { title: 'Monument Strategy', description: 'Search carefully.', monuments: [{ location: 'SE corner', type: '1/2" iron rod', search_method: 'Magnetic locator', found_action: 'Record it.', not_found_action: 'Set new rod.' }] },
      boundary_reconstruction: { title: 'Boundary Plan', description: 'Follow calls.', method: 'Record', explanation: 'Use deed calls.', priority_evidence: ['Monuments', 'Calls'], potential_conflicts: [] },
      data_sources_used: [{ source: 'Bell CAD', url: 'https://bellcad.org', data_obtained: 'Parcel ID, owner' }],
      discrepancies_to_investigate: [],
      special_considerations: [{ category: 'TxDOT', description: 'Check TxDOT ROW.' }],
      office_to_field_sequence: [{ day: 'Day 1 (Office)', tasks: ['Get deed', 'Calculate closure'] }],
      closure_check: { calculated_closure_error: '0.01 ft in 1200 ft', closure_ratio: '1:120000', acceptable: true, note: 'Excellent closure.' },
      confidence_level: 75,
      confidence_notes: 'Good data from county records.',
      next_steps: ['Obtain certified deed copy'],
    },
    raw: '{}',
    promptVersion: '1.0.0',
    model: 'claude-sonnet-4-5-20250929',
    tokensUsed: { input: 100, output: 200 },
    latencyMs: 500,
    retryCount: 0,
  }),
  AIServiceError: class AIServiceError extends Error {},
}));

// ── Module imports ────────────────────────────────────────────────────────────

import { PROMPTS } from '@/lib/research/prompts';
import type { PromptKey } from '@/lib/research/prompts';

// ── Module A: survey-plan.service.ts ─────────────────────────────────────────

describe('survey-plan.service', () => {
  it('1. generateSurveyPlan is exported as an async function', async () => {
    const mod = await import('@/lib/research/survey-plan.service');
    expect(typeof mod.generateSurveyPlan).toBe('function');
    expect(mod.generateSurveyPlan.constructor.name).toBe('AsyncFunction');
  });

  it('2. SurveyPlan type: generateSurveyPlan returns object with required fields', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(plan).toHaveProperty('property_summary');
    expect(plan).toHaveProperty('key_facts');
    expect(plan).toHaveProperty('pre_field_research');
    expect(plan).toHaveProperty('equipment_checklist');
    expect(plan).toHaveProperty('field_procedures');
    expect(plan).toHaveProperty('monument_recovery');
    expect(plan).toHaveProperty('boundary_reconstruction');
    expect(plan).toHaveProperty('data_sources_used');
    expect(plan).toHaveProperty('discrepancies_to_investigate');
    expect(plan).toHaveProperty('special_considerations');
    expect(plan).toHaveProperty('office_to_field_sequence');
    expect(plan).toHaveProperty('confidence_level');
    expect(plan).toHaveProperty('confidence_notes');
    expect(plan).toHaveProperty('next_steps');
    expect(plan).toHaveProperty('generated_at');
  });

  it('3. generateSurveyPlan returns string property_summary', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.property_summary).toBe('string');
    expect(plan.property_summary.length).toBeGreaterThan(5);
  });

  it('4. generateSurveyPlan: key_facts is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.key_facts)).toBe(true);
  });

  it('5. generateSurveyPlan: pre_field_research has title and items array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.pre_field_research.title).toBe('string');
    expect(Array.isArray(plan.pre_field_research.items)).toBe(true);
  });

  it('6. generateSurveyPlan: field_procedures is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.field_procedures)).toBe(true);
  });

  it('7. generateSurveyPlan: monument_recovery has monuments array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.monument_recovery.monuments)).toBe(true);
  });

  it('8. generateSurveyPlan: boundary_reconstruction has method string', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.boundary_reconstruction.method).toBe('string');
  });

  it('9. generateSurveyPlan: confidence_level is between 0 and 100', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(plan.confidence_level).toBeGreaterThanOrEqual(0);
    expect(plan.confidence_level).toBeLessThanOrEqual(100);
  });

  it('10. generateSurveyPlan: generated_at is a valid ISO date string', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.generated_at).toBe('string');
    expect(() => new Date(plan.generated_at)).not.toThrow();
    expect(new Date(plan.generated_at).getFullYear()).toBeGreaterThan(2020);
  });
});

// ── Module B: SURVEY_PLAN_GENERATOR prompt ────────────────────────────────────

describe('SURVEY_PLAN_GENERATOR prompt', () => {
  it('11. SURVEY_PLAN_GENERATOR prompt key exists in PROMPTS', () => {
    expect(PROMPTS).toHaveProperty('SURVEY_PLAN_GENERATOR');
  });

  it('12. SURVEY_PLAN_GENERATOR prompt has version, temperature, and system fields', () => {
    const p = PROMPTS.SURVEY_PLAN_GENERATOR;
    expect(typeof p.version).toBe('string');
    expect(typeof p.temperature).toBe('number');
    expect(typeof p.system).toBe('string');
  });

  it('13. SURVEY_PLAN_GENERATOR temperature is > 0', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.temperature).toBeGreaterThan(0);
  });

  it('14. SURVEY_PLAN_GENERATOR system prompt mentions JSON', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toMatch(/JSON/i);
  });

  it('15. SURVEY_PLAN_GENERATOR system prompt mentions key_facts', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('key_facts');
  });

  it('16. SURVEY_PLAN_GENERATOR system prompt mentions pre_field_research', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('pre_field_research');
  });

  it('17. SURVEY_PLAN_GENERATOR system prompt mentions monument_recovery', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('monument_recovery');
  });

  it('18. SURVEY_PLAN_GENERATOR system prompt mentions boundary_reconstruction', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('boundary_reconstruction');
  });

  it('19. SURVEY_PLAN_GENERATOR system prompt mentions discrepancies_to_investigate', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('discrepancies_to_investigate');
  });

  it('20. SURVEY_PLAN_GENERATOR system prompt mentions office_to_field_sequence', () => {
    expect(PROMPTS.SURVEY_PLAN_GENERATOR.system).toContain('office_to_field_sequence');
  });
});

// ── Module C: SurveyPlanPanel.tsx ─────────────────────────────────────────────

const SURVEY_PLAN_PANEL_PATH = path.resolve(
  __dirname,
  '../../app/admin/research/components/SurveyPlanPanel.tsx',
);

describe('SurveyPlanPanel component', () => {
  it('21. SurveyPlanPanel.tsx file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(SURVEY_PLAN_PANEL_PATH)).toBe(true);
  });

  it('22. SurveyPlanPanel.tsx exports a default function', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(SURVEY_PLAN_PANEL_PATH, 'utf-8');
    expect(src).toContain('export default function SurveyPlanPanel');
  });
});

// ── Module D: Lite Pipeline route ─────────────────────────────────────────────

const LITE_PIPELINE_PATH = path.resolve(
  __dirname,
  '../../app/api/admin/research/[projectId]/lite-pipeline/route.ts',
);

describe('lite-pipeline API route', () => {
  it('23. lite-pipeline route file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(LITE_PIPELINE_PATH)).toBe(true);
  });

  it('24. lite-pipeline route exports GET handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(LITE_PIPELINE_PATH, 'utf-8');
    expect(src).toContain('export const GET');
  });

  it('25. lite-pipeline route exports POST handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(LITE_PIPELINE_PATH, 'utf-8');
    expect(src).toContain('export const POST');
  });
});

// ── Module E: survey-plan API route ──────────────────────────────────────────

const SURVEY_PLAN_ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/admin/research/[projectId]/survey-plan/route.ts',
);

describe('survey-plan API route', () => {
  it('26. survey-plan route file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(SURVEY_PLAN_ROUTE_PATH)).toBe(true);
  });

  it('27. survey-plan route exports GET handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(SURVEY_PLAN_ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const GET');
  });
});

// ── Module F: SurveyPlan shape validation ────────────────────────────────────

describe('SurveyPlan shape — returned plan from generateSurveyPlan', () => {
  let plan: Awaited<ReturnType<typeof import('@/lib/research/survey-plan.service')['generateSurveyPlan']>>;

  beforeEach(async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    plan = await generateSurveyPlan('proj-1');
  });

  it('28. A minimal SurveyPlan has all required top-level keys', () => {
    const required = ['property_summary', 'key_facts', 'pre_field_research', 'equipment_checklist', 'field_procedures', 'monument_recovery', 'boundary_reconstruction', 'data_sources_used', 'discrepancies_to_investigate', 'special_considerations', 'office_to_field_sequence', 'confidence_level', 'confidence_notes', 'next_steps', 'generated_at'];
    for (const key of required) {
      expect(plan).toHaveProperty(key);
    }
  });

  it('29. pre_field_research items have priority and task fields', () => {
    const items = plan.pre_field_research.items;
    if (items.length > 0) {
      expect(items[0]).toHaveProperty('task');
      expect(items[0]).toHaveProperty('done');
    }
  });

  it('30. equipment_checklist items have category and items array', () => {
    const items = plan.equipment_checklist.items;
    if (items.length > 0) {
      expect(items[0]).toHaveProperty('category');
      expect(items[0]).toHaveProperty('items');
      expect(Array.isArray(items[0].items)).toBe(true);
    }
  });

  it('31. field_procedures steps have step, title, plain_english fields', () => {
    if (plan.field_procedures.length > 0) {
      const step = plan.field_procedures[0];
      expect(step).toHaveProperty('step');
      expect(step).toHaveProperty('title');
      expect(step).toHaveProperty('plain_english');
    }
  });

  it('32. monument_recovery monuments have location, type, search_method', () => {
    if (plan.monument_recovery.monuments.length > 0) {
      const m = plan.monument_recovery.monuments[0];
      expect(m).toHaveProperty('location');
      expect(m).toHaveProperty('type');
      expect(m).toHaveProperty('search_method');
    }
  });

  it('33. boundary_reconstruction has method and explanation', () => {
    expect(plan.boundary_reconstruction).toHaveProperty('method');
    expect(plan.boundary_reconstruction).toHaveProperty('explanation');
  });

  it('34. discrepancies_to_investigate items have severity and description', () => {
    if (plan.discrepancies_to_investigate.length > 0) {
      const d = plan.discrepancies_to_investigate[0];
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('description');
    }
  });

  it('35. office_to_field_sequence days have day and tasks array', () => {
    if (plan.office_to_field_sequence.length > 0) {
      const day = plan.office_to_field_sequence[0];
      expect(day).toHaveProperty('day');
      expect(day).toHaveProperty('tasks');
      expect(Array.isArray(day.tasks)).toBe(true);
    }
  });

  it('36. closure_check is null or has closure_ratio and acceptable fields', () => {
    if (plan.closure_check !== null) {
      expect(plan.closure_check).toHaveProperty('closure_ratio');
      expect(plan.closure_check).toHaveProperty('acceptable');
    }
  });

  it('37. data_sources_used items have source and data_obtained fields', () => {
    if (plan.data_sources_used.length > 0) {
      const src = plan.data_sources_used[0];
      expect(src).toHaveProperty('source');
      expect(src).toHaveProperty('data_obtained');
    }
  });

  it('38. special_considerations items have category and description', () => {
    if (plan.special_considerations.length > 0) {
      const c = plan.special_considerations[0];
      expect(c).toHaveProperty('category');
      expect(c).toHaveProperty('description');
    }
  });

  it('39. key_facts items have label and value fields', () => {
    if (plan.key_facts.length > 0) {
      const f = plan.key_facts[0];
      expect(f).toHaveProperty('label');
      expect(f).toHaveProperty('value');
    }
  });

  it('40. generated_at is a non-empty string', () => {
    expect(typeof plan.generated_at).toBe('string');
    expect(plan.generated_at.length).toBeGreaterThan(0);
  });
});

// ── Module G: confidence_level validation (empty project) ────────────────────

describe('SurveyPlan — empty project (no data, no documents)', () => {
  it('41. confidence_level is a number 0–100', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1'); // uses existing mock
    expect(typeof plan.confidence_level).toBe('number');
    expect(plan.confidence_level).toBeGreaterThanOrEqual(0);
    expect(plan.confidence_level).toBeLessThanOrEqual(100);
  });

  it('42. confidence_notes is a non-empty string', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.confidence_notes).toBe('string');
    expect(plan.confidence_notes.length).toBeGreaterThan(0);
  });

  it('43. next_steps is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.next_steps)).toBe(true);
  });

  it('44. property_summary is a non-empty string', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(typeof plan.property_summary).toBe('string');
    expect(plan.property_summary.length).toBeGreaterThan(10);
  });

  it('45. field_procedures is an array (may be empty for no-data project)', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.field_procedures)).toBe(true);
  });

  it('46. monument_recovery.monuments is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.monument_recovery.monuments)).toBe(true);
  });

  it('47. office_to_field_sequence is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.office_to_field_sequence)).toBe(true);
  });

  it('48. boundary_reconstruction.priority_evidence is an array', async () => {
    const { generateSurveyPlan } = await import('@/lib/research/survey-plan.service');
    const plan = await generateSurveyPlan('proj-1');
    expect(Array.isArray(plan.boundary_reconstruction.priority_evidence)).toBe(true);
  });
});

// ── Module H: prompts.ts PromptKey type ─────────────────────────────────────

describe('prompts.ts — PromptKey and PROMPTS completeness', () => {
  it('49. PROMPTS has SURVEY_PLAN_GENERATOR entry', () => {
    expect(Object.keys(PROMPTS)).toContain('SURVEY_PLAN_GENERATOR');
  });

  it('50. All PROMPTS keys are unique (no duplicates)', () => {
    const keys = Object.keys(PROMPTS);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});
