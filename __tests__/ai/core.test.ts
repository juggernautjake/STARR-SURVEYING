// lib/ai — one client, one model config, one tool registry, one digest, one usage log (audit §5).
//
// §5 measured the state before this: *"six unrelated AI surfaces, each with its own hand-rolled
// prompt and its own Anthropic client"*, *"no tool use anywhere"*, *"no assistant knows anything
// about your data"*, *"model IDs are inconsistent and a generation behind"*, *"no central model
// config"*. Each of those is a test here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_MODEL, modelFor, modelRoster, requestParamsFor, type AiRole } from '@/lib/ai/models';
import { estimateCostCents, readUsage } from '@/lib/ai/usage';
import { renderContext, type AssistantContext } from '@/lib/ai/context';
import { requiresConfirmation, toolDefinitionsFor, toolsFor } from '@/lib/ai/tools';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('one model config', () => {
  it('is on the current Claude family, not a generation behind', () => {
    // §5: "claude-sonnet-4-5-20250929 (12 uses), claude-sonnet-4-6 (4), claude-opus-4-7 (1)…
    // The current family is Claude 5."
    expect(CURRENT_MODEL).toBe('claude-opus-5');
    // Haiku 4.5 is current — it is the cheap tier of the same generation, not a leftover. The
    // pattern names the stale IDs §5 actually found rather than a version-number heuristic that
    // cannot tell "one behind" from "deliberately cheaper".
    const STALE = ['claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', '20250929'];
    for (const entry of modelRoster()) {
      for (const stale of STALE) {
        expect(entry.model, `${entry.role} is on a stale model`).not.toContain(stale);
      }
    }
  });

  it('gives every role a stated reason for its configuration', () => {
    // A model choice with no reason recorded is one nobody can evaluate later.
    for (const entry of modelRoster()) {
      expect(entry.why.length, `${entry.role} has no rationale`).toBeGreaterThan(30);
    }
  });

  it('puts the cheap tier where it belongs and the ceiling where it matters', () => {
    expect(modelFor('guard').model).toBe('claude-haiku-4-5');
    expect(modelFor('reasoning').model).toBe(CURRENT_MODEL);
    // Guard runs in front of a waiting user, so thinking is off deliberately.
    expect(modelFor('guard').thinking).toBe(false);
    expect(modelFor('reasoning').thinking).toBe(true);
  });

  it('uses adaptive thinking, never a fixed token budget', () => {
    // The fixed-budget form is removed on the current family and returns a 400.
    const params = requestParamsFor('reasoning');
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(JSON.stringify(params)).not.toContain('budget_tokens');
  });

  it('omits thinking entirely when a role has it off', () => {
    expect(requestParamsFor('guard').thinking).toBeUndefined();
  });

  it('can be overridden per role from the environment', () => {
    // Q52 ("what is an acceptable monthly AI spend") is unanswered, so a deployment must be able to
    // move a role down a tier without a deploy — a budget ceiling that needs a release is one nobody
    // uses at the moment they need it.
    const prev = process.env.AI_MODEL_DRAFTING;
    process.env.AI_MODEL_DRAFTING = 'claude-haiku-4-5';
    try {
      expect(modelFor('drafting').model).toBe('claude-haiku-4-5');
      expect(modelRoster().find((r) => r.role === 'drafting')?.overridden).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.AI_MODEL_DRAFTING; else process.env.AI_MODEL_DRAFTING = prev;
    }
  });

  it('is the single source — no surface names a model literal any more', () => {
    // §5: "There's no central model config." Nineteen call sites, four IDs. This is the ratchet.
    const files = [
      'lib/research/ai-client.ts',
      'lib/cad/ai-engine/claude-deed-parser.ts',
      'lib/cad/ai-engine/drawing-chat.ts',
      'lib/cad/ai-engine/element-chat.ts',
      'lib/cad/ai/claude-proposer.ts',
      'lib/cad/ai/sketch-reconcile.ts',
      'lib/learn/reference-extract.ts',
      'lib/learn/tutor-guard.ts',
      'app/api/admin/leads/[id]/ai-draft/route.ts',
      'app/api/admin/learn/ai-tutor/route.ts',
      'app/api/admin/learn/define/route.ts',
      'app/api/admin/learn/ai-grade/route.ts',
      'app/api/admin/learn/quizzes/route.ts',
      'app/api/admin/research/testing/ai-analyze/route.ts',
      'app/api/admin/research/testing/ai-chat/route.ts',
      'app/api/admin/work-mode/assistant/route.ts',
    ];
    for (const f of files) {
      const src = read(f);
      // Model IDs only — 'claude-vision' and 'claude-pdf-ocr' are METHOD LABELS recorded on an
      // extraction result, not models to call. Matched on the family prefixes an ID actually uses.
      expect(src, `${f} still hard-codes a model id`).not.toMatch(/'claude-(opus|sonnet|haiku|fable|mythos)-[a-z0-9-]*'/);
      expect(src, `${f} does not use the central config`).toContain('modelFor(');
    }
  });
});

describe('usage log', () => {
  it('returns null rather than a guess for an unknown model', () => {
    // A fabricated number in a cost report is worse than a gap — nobody questions a number.
    expect(estimateCostCents({ model: 'some-future-model', inputTokens: 1000, outputTokens: 1000 })).toBeNull();
    expect(estimateCostCents({ model: 'claude-opus-5', inputTokens: 1_000_000, outputTokens: 0 })).toBeGreaterThan(0);
  });

  it('prices cache reads at a tenth, so a caching win is visible', () => {
    const cold = estimateCostCents({ model: 'claude-opus-5', inputTokens: 1_000_000, outputTokens: 0 })!;
    const warm = estimateCostCents({ model: 'claude-opus-5', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 })!;
    expect(warm).toBeLessThan(cold);
    expect(warm).toBeCloseTo(cold * 0.1, 1);
  });

  it('reads a usage object defensively', () => {
    expect(readUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(readUsage({ input_tokens: 5, output_tokens: 7 })).toMatchObject({ inputTokens: 5, outputTokens: 7 });
  });

  it('records failures too', () => {
    // A month where half the calls timed out still spent the tokens; a log of successes alone
    // cannot explain the bill.
    expect(read('lib/ai/client.ts')).toMatch(/error: lastError instanceof Error \? lastError\.name/);
  });

  it('never lets logging break the call it is measuring', () => {
    const src = read('lib/ai/usage.ts');
    expect(src).toMatch(/void supabaseAdmin/);
    expect(src).toMatch(/console\.error\('\[ai-usage\]/);
  });
});

describe('the context digest', () => {
  const base: AssistantContext = {
    user: { email: 'crew@example.test', name: 'Sam', roles: ['field_crew'] },
    firm: { name: 'Acme Surveying', state: 'TX' },
    page: { path: '/admin/me', label: 'Hub', description: 'Your personalised landing.' },
    clock: { clockedIn: true, since: '2026-08-01T13:00:00Z', jobName: 'CR 4 boundary' },
    jobs: [{ id: 'j1', number: '26-001', name: 'CR 4 boundary', stage: 'fieldwork', address: '123 CR 4' }],
    equipment: [{ name: 'Trimble S7', serial: 'S7-991' }],
    expiring: [{ title: 'RPLS renewal', daysRemaining: 21 }],
    withheld: ['job pricing, invoices and payroll'],
  };

  it('tells the model what the user is doing right now', () => {
    // §5: "It cannot see the crew's active job… It answers trig questions. That is a calculator with
    // manners, not an assistant."
    const rendered = renderContext(base);
    expect(rendered).toContain('CLOCKED IN');
    expect(rendered).toContain('CR 4 boundary');
    expect(rendered).toContain('Trimble S7');
    expect(rendered).toContain('/admin/me');
  });

  it('names what it cannot see rather than staying quiet about it', () => {
    // Without this the model either invents a figure or says the firm does not track it — and the
    // second is false, which is worse.
    const rendered = renderContext(base);
    expect(rendered).toMatch(/cannot see the following for this user's role/);
    expect(rendered).toMatch(/can't see it from their account rather than guessing/);
  });

  it('omits empty sections instead of listing absences', () => {
    // "Jobs: none / Equipment: none" reads as a list of failed lookups and costs tokens every turn.
    const empty = renderContext({ ...base, jobs: [], equipment: [], expiring: [], withheld: [] });
    expect(empty).not.toMatch(/Recent jobs/);
    expect(empty).not.toMatch(/Equipment checked out/);
    expect(empty).not.toMatch(/dates coming up/);
  });

  it('only reads the asking user’s own compliance dates', () => {
    // An assistant that volunteers a colleague's licence expiry is a privacy incident wearing a
    // helpful hat. Q51 asks exactly this.
    expect(read('lib/ai/context.ts')).toMatch(/\.eq\('subject_label', email\)/);
  });
});

describe('the tool registry', () => {
  it('exists at all — §5 measured zero tools across every AI surface', () => {
    expect(toolDefinitionsFor(['admin']).length).toBeGreaterThan(0);
  });

  it('filters by role BEFORE the list reaches the model', () => {
    // Sending a tool and then refusing the call is worse than not sending it: the model offers the
    // capability, the user asks, and the refusal reads as a bug rather than a boundary.
    const crew = toolsFor(['field_crew']).map((t) => t.name);
    const admin = toolsFor(['admin']).map((t) => t.name);
    expect(crew).not.toContain('compliance_due');
    expect(admin).toContain('compliance_due');
    // Everyone gets the reads that make the assistant useful at all.
    expect(crew).toContain('find_job');
    expect(crew).toContain('my_hours');
  });

  it('re-checks the role at execution, because the tool name comes from model output', () => {
    expect(read('lib/ai/tools.ts')).toMatch(/const tool = toolsFor\(ctx\.roles\)\.find/);
  });

  it('confirms before anything that writes', () => {
    expect(requiresConfirmation('log_mileage')).toBe(true);
    expect(requiresConfirmation('find_job')).toBe(false);
    // An unknown tool defaults to needing confirmation — the safe direction for a name that arrived
    // from model output.
    expect(requiresConfirmation('some_future_tool')).toBe(true);
  });

  it('writes nothing irreversible, and sends no customer email', () => {
    // Q57 ("is there anything the AI must never touch") is unanswered, so the first version reads
    // widely and writes narrowly. Each addition should be a decision somebody makes on purpose.
    const src = read('lib/ai/tools.ts');
    expect(src).not.toMatch(/\.delete\(\)/);
    expect(src).not.toMatch(/api\.resend\.com/);
    expect(src).not.toMatch(/from\('payroll_runs'\)|from\('pay_stubs'\)/);
    for (const t of toolsFor(['admin'])) {
      expect(t.reversible, `${t.name} is irreversible`).toBe(true);
    }
  });

  it('marks what it creates as AI-made', () => {
    // D4: an AI-created record must be identifiable and reversible. A row that does not say where it
    // came from is neither.
    expect(read('lib/ai/tools.ts')).toMatch(/source: 'ai-assistant'/);
  });

  it('returns a tool failure to the model rather than aborting the conversation', () => {
    expect(read('lib/ai/tools.ts')).toMatch(/return \{ ok: false, result: \{ error:/);
  });
});

describe('the assistant route', () => {
  const src = read('app/api/admin/assistant/route.ts');

  it('bounds the tool loop', () => {
    // A model searching for a job that does not exist will keep searching, and each turn is a paid
    // request.
    expect(src).toMatch(/const MAX_TOOL_TURNS = \d+/);
    expect(src).toMatch(/truncated: true/);
  });

  it('checks for confirmation BEFORE running any tool in the batch', () => {
    // Running the harmless ones first and then asking leaves the user approving a change that has
    // already half happened.
    const confirmAt = src.indexOf('const needsConfirm');
    const runAt = src.indexOf('await runTool(t.name');
    expect(confirmAt).toBeGreaterThan(0);
    expect(confirmAt).toBeLessThan(runAt);
  });

  it('returns all tool results in ONE user message', () => {
    // Splitting them teaches the model to stop making parallel calls, which makes every later
    // answer slower.
    expect(src).toMatch(/messages\.push\(\{ role: 'user', content: results \}\)/);
  });

  it('tells the model not to invent a job number', () => {
    // A made-up job number in a surveying firm sends a crew to the wrong property.
    expect(src.replace(/\s+/g, ' ')).toContain('Never invent a job number');
  });

  it('says plainly when AI is not configured', () => {
    // "The assistant is broken" and "nobody set up a key" get very different responses from the
    // person reading it.
    expect(src).toMatch(/not set up on this system yet/);
  });
});

describe('generated page help', () => {
  const src = read('app/api/admin/help/generate/route.ts');

  it('prefers curated help and labels which it returned', () => {
    // A reader who cannot tell a guess from a fact will trust them equally.
    expect(src).toMatch(/source: 'curated'/);
    expect(src).toMatch(/source: 'generated'/);
    const curatedAt = src.indexOf("source: 'curated'");
    const generateAt = src.indexOf('callAi(');
    expect(curatedAt).toBeLessThan(generateAt);
  });

  it('caches, because a help drawer is opened constantly', () => {
    expect(src).toMatch(/from\('help_generated'\)/);
    expect(read('seeds/526_help_generated.sql')).toMatch(/path\s+text PRIMARY KEY/);
  });

  it('is not tenant-scoped, because help describes the software not a firm’s data', () => {
    const seed = read('seeds/526_help_generated.sql');
    expect(seed).not.toMatch(/org_id/);
    expect(seed).toMatch(/[Dd]eliberately NOT tenant-scoped/);
  });

  it('tells the model not to invent buttons it was not told about', () => {
    // Help describing a button that is not there is worse than no help: the reader searches for it
    // and concludes the page is broken.
    expect(src).toMatch(/Do NOT\s*\n?\s*invent buttons/);
  });

  it('fails quietly to "no help yet" rather than showing an AI error', () => {
    expect(src).toMatch(/reason: 'generation_failed'/);
  });
});

describe('proactive alerts', () => {
  const src = read('lib/ai/proactive.ts');

  it('are deterministic queries, not model calls', () => {
    // "You are still clocked in" is a fact. Asking a model to notice it costs money, adds latency,
    // and risks a hallucinated alert — the one kind that destroys trust in all the others.
    expect(src).not.toMatch(/callAi\(|messages\.create/);
  });

  it('key on the SITUATION so a check that runs hourly does not re-alert', () => {
    expect(src).toMatch(/dedupeKey: `clock:\$\{r\.user_email\}:\$\{r\.clock_in_at\}`/);
  });

  it('let a renewed licence alert again on its new dates', () => {
    expect(src).toMatch(/dedupeKey: `compliance:\$\{i\.register_key\}:\$\{i\.expires_on\}/);
  });

  it('reuse the compliance register’s own thresholds rather than inventing a second set', () => {
    // Two definitions of "due soon" is how a page and a notification come to disagree about the
    // same licence.
    expect(src).toMatch(/import \{ assess/);
  });

  it('suppress everything when the ledger cannot be read', () => {
    // A duplicate storm across every alert mutes the channel permanently; a delayed alert recovers.
    expect(src).toMatch(/suppressing this run/);
  });

  it('do not mark anything delivered on a GET', () => {
    // Otherwise the first person to open the page silently consumes everyone else's notifications.
    const route = read('app/api/admin/alerts/route.ts');
    const getBody = route.slice(route.indexOf('export const GET'), route.indexOf('export const POST'));
    expect(getBody).not.toMatch(/markDelivered/);
  });

  it('measure an overrun against the accepted quote plus approved change orders', () => {
    // Against the original quote, every agreed scope change reads as an overrun.
    expect(src).toMatch(/job_estimate_vs_actual/);
  });

  it('do not silence every check when one query fails', () => {
    expect(src).toMatch(/Promise\.allSettled/);
  });
});
