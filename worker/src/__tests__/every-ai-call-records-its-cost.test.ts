import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// "For each run we need an accurate total of how much money is spent."
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// 22 worker files call the Anthropic API. NINE of them never recorded usage, so their spend never
// reached `research_usage_events` — the table the run console sums to produce the figure on screen.
// Eight of the nine were research analysis, which is where the money actually goes:
//
//   bell/deed-analyzer, bell/plat-analyzer, bell/lot-correlator,
//   bell/document-relevance-validator, bell/gis-quality-analyzer, bell/screenshot-classifier,
//   ai-deed-analyzer, ai-plat-analyzer
//
// So "$2.14 spent" on a finished Bell run was the cost of the calls that happened to be
// instrumented. Not an estimate that drifted — a total that omitted whole phases.
//
// ── WHY THIS SCAN STRIPS COMMENTS FIRST ─────────────────────────────────────────────────────────
//
// The grep that found the nine also matched `infra/model-sampling.ts` and `lib/credit-guard.ts`, and
// both were FALSE POSITIVES: the match is in a doc comment showing callers how to use the helper.
// Counting those would have sent me instrumenting two files that make no API calls at all. This
// repository has been caught by a probe matching its own prose five times; the scan strips comments.

const ROOT = path.join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

function codeOnly(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

/**
 * Files that reach the Anthropic API without recording what it cost, allowed with a reason.
 *
 * A call outside a run has no run to bill, which is the only honest reason to be here.
 */
const ALLOWED: Record<string, string> = {
  'services/receipt-extraction.ts':
    'Receipts, not research. It runs from the receipt queue and a receipt has no research run to ' +
    'bill; its own spend is tracked by the receipts product.',
};

const files = walk(ROOT);
const callers = files.filter((f) => /\bclient\.messages\.create\(|anthropic\.messages\.create\(/.test(codeOnly(fs.readFileSync(f, 'utf8'))));

describe('every AI call a run makes reaches the run cost', () => {
  it('CONTROL: the scan finds the callers it should', () => {
    // A broken walk or a wrong pattern would report an empty list, and every assertion below would
    // pass against a codebase that bills nothing.
    const names = callers.map(rel);
    expect(names.length, 'the scan found almost no API callers — the pattern is wrong').toBeGreaterThan(10);
    expect(names).toContain('services/ai-extraction.ts');
    expect(names).toContain('counties/bell/analyzers/deed-analyzer.ts');
  });

  it('CONTROL: a doc comment is not counted as a caller', () => {
    // model-sampling.ts and credit-guard.ts both show `client.messages.create({ … })` in a comment
    // explaining how to call them. Instrumenting those would have been work on files that spend
    // nothing.
    const names = callers.map(rel);
    expect(names, 'a doc comment is being read as an API call').not.toContain('infra/model-sampling.ts');
    expect(names, 'a doc comment is being read as an API call').not.toContain('lib/credit-guard.ts');
  });

  it('records the cost of every call it makes', () => {
    const silent = callers
      .map(rel)
      .filter((f) => !(f in ALLOWED))
      .filter((f) => {
        const code = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8'));
        return !/recordAmbientAiCall\(|recordUsage\(/.test(code);
      });

    expect(
      silent,
      `These call the Anthropic API and never record what it cost:\n  ${silent.join('\n  ')}\n\n` +
        `Their spend never reaches research_usage_events, so it never reaches the figure the ` +
        `operator reads — the run reports less than it charged. Call recordAmbientAiCall with the ` +
        `model actually sent and the token counts off the response, or add the file to ALLOWED with ` +
        `a reason a call has no run to bill.`,
    ).toEqual([]);
  });

  it('gives every allowance a real reason', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, `${file} is allowed with no explanation`).toBeGreaterThan(40);
      expect(fs.existsSync(path.join(ROOT, file)), `${file} no longer exists`).toBe(true);
    }
  });

  it('prices with the model actually sent, not a constant', () => {
    // Pricing a Haiku call at Sonnet rates makes the cheap path look expensive and defeats the
    // cheap-first routing R6 shipped. Every recording site names either the routed model or the
    // file's own AI_MODEL.
    for (const f of callers.map(rel).filter((f) => !(f in ALLOWED))) {
      const code = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      const calls = code.match(/recordAmbientAiCall\([^,]+,\s*([^,]+),/g) ?? [];
      for (const c of calls) {
        // Case-insensitive "model": the routed `modelFor('x').model`, or a named constant such as
        // AI_MODEL or OCR_VERIFY_MODEL. The point is that a cost is priced against a MODEL and not
        // a hardcoded rate, not that every file spells the constant the same way.
        expect(
          /model/i.test(c),
          `${f} records a cost against something that is not a model: ${c}`,
        ).toBe(true);
      }
    }
  });
});
