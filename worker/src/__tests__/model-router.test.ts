// The cheapest model that can do the job (research plan R6).
//
// Measured before this: 25 hard-coded model ids across the worker, most a Sonnet pinned by date,
// chosen per call site by whoever wrote it. A yes/no "is this screenshot a plat" ran on the same
// model as "read this 1890s handwritten metes-and-bounds and reconcile it against the plat".
//
// Both directions cost money. Over-spec everything and "as cheap as possible" is unreachable —
// Opus is ~15× Haiku, and most calls in a run are classification and clean-text extraction.
// Under-spec the hard ones and the run produces confident nonsense about a boundary somebody is
// asked to stake, which costs a site visit.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ESCALATION_THRESHOLD,
  TIER_MODELS,
  escalate,
  modelFor,
  relativeCost,
  runWithEscalation,
  shouldEscalate,
  tierFor,
  type TaskKind,
} from '../infra/model-router.js';

describe('the task decides the model', () => {
  it('puts classification and clean text on the cheap tier', () => {
    // These are the bulk of a run. Paying mid-tier for them is where the money goes.
    expect(tierFor('classify')).toBe('cheap');
    expect(tierFor('read_text')).toBe('cheap');
    expect(modelFor('classify').model).toBe(TIER_MODELS.cheap);
  });

  it('puts scanned pages and structured extraction in the middle', () => {
    expect(tierFor('read_scan')).toBe('mid');
    expect(tierFor('extract')).toBe('mid');
  });

  it('reserves the top tier for judgement', () => {
    // Reconciling two sources that disagree, and writing the gameplan a crew acts on.
    expect(tierFor('reconcile')).toBe('top');
    expect(tierFor('synthesize')).toBe('top');
  });

  it('uses undated model ids', () => {
    // A dated pin (claude-sonnet-4-20250514) freezes a call site to a generation, which is how this
    // worker ended up two behind while the app had already standardised.
    for (const model of Object.values(TIER_MODELS)) {
      expect(model, `${model} is pinned to a date`).not.toMatch(/-\d{8}$/);
    }
  });

  it('keeps a real gap between the tiers, or routing would not be worth doing', () => {
    expect(relativeCost('top') / relativeCost('cheap')).toBeGreaterThanOrEqual(10);
  });
});

describe('escalation is what makes starting cheap safe', () => {
  it('goes up a tier at a time and stops at the ceiling', () => {
    const cheap = modelFor('classify');
    const mid = escalate(cheap)!;
    expect(mid.tier).toBe('mid');
    expect(mid.escalated).toBe(true);
    const top = escalate(mid)!;
    expect(top.tier).toBe('top');
    // Null, not a repeat of the top tier: a caller looping "escalate until confident" against a
    // model that cannot do better would spend the whole run budget on one unreadable page.
    expect(escalate(top)).toBeNull();
  });

  it('retries a low-confidence answer', () => {
    expect(shouldEscalate(0.4)).toBe(true);
    expect(shouldEscalate(0.95)).toBe(false);
    expect(shouldEscalate(ESCALATION_THRESHOLD)).toBe(false);
  });

  it('does NOT escalate when the call site reports no confidence', () => {
    // Escalating everything that cannot self-assess would put the whole pipeline on the top tier
    // and quietly undo the saving.
    expect(shouldEscalate(null)).toBe(false);
    expect(shouldEscalate(undefined)).toBe(false);
  });

  it('runs cheap-first and settles once the answer is good enough', async () => {
    const call = vi.fn(async (choice) => ({
      result: `answered by ${choice.tier}`,
      confidence: choice.tier === 'cheap' ? 0.3 : 0.9,
    }));
    const out = await runWithEscalation('classify' as TaskKind, call);
    expect(out.attempts).toBe(2);
    expect(out.choice.tier).toBe('mid');
    expect(out.result).toBe('answered by mid');
  });

  it('does not call twice when the cheap answer is confident', async () => {
    const call = vi.fn(async () => ({ result: 'ok', confidence: 0.99 }));
    const out = await runWithEscalation('classify', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.choice.escalated).toBe(false);
  });

  it('reports every attempt, so a task classified wrong is visible', async () => {
    // A task that escalates every single time is a task that was put in the wrong tier — and that
    // is invisible without the number.
    const seen: string[] = [];
    await runWithEscalation('classify', async (c) => ({ result: 1, confidence: 0.1 }), {
      onAttempt: (choice) => seen.push(choice.tier),
    });
    expect(seen).toEqual(['cheap', 'mid', 'top']);
  });

  it('gives up at the ceiling rather than looping', async () => {
    const call = vi.fn(async () => ({ result: 'still unsure', confidence: 0.1 }));
    const out = await runWithEscalation('reconcile', call);
    // Already top tier: one attempt, no escalation available.
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.choice.tier).toBe('top');
  });
});

describe('the call sites actually moved', () => {
  const ROOT = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  it('the heaviest consumers route by task', () => {
    for (const [file, task] of [
      ['src/counties/bell/analyzers/deed-analyzer.ts', 'read_scan'],
      ['src/counties/bell/analyzers/screenshot-classifier.ts', 'classify'],
      ['src/counties/bell/analyzers/lot-correlator.ts', 'reconcile'],
      ['src/counties/bell/reports/survey-plan-generator.ts', 'synthesize'],
      ['src/adapters/kofile-clerk-adapter.ts', 'read_scan'],
    ] as const) {
      expect(read(file), `${file} does not route`).toContain(`modelFor('${task}')`);
    }
  });

  it('leaves no undocumented dated pins in the worker', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', 'dist', '__tests__'].includes(e.name)) walk(p); }
        else if (e.name.endsWith('.ts')) {
          const src = fs.readFileSync(p, 'utf8');
          for (const m of src.matchAll(/model: '(claude-[a-z0-9.-]+)'/g)) {
            // The prompt registry pins deliberately — a prompt version records "this wording, on
            // this model, scored this accuracy", and routing it would compare v1 on Haiku against
            // v2 on Opus and call the difference a prompt improvement.
            if (p.includes('prompt-registry')) continue;
            offenders.push(`${path.relative(ROOT, p)} → ${m[1]}`);
          }
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders, `hard-coded model ids:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('the prompt registry says WHY it still pins', () => {
    expect(read('src/ai/prompt-registry.ts')).toContain('pin their model ON PURPOSE');
  });
});
