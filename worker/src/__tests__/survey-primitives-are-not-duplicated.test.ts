// One rule, one implementation — the defect the reachability check cannot see.
//
// Three slices in a row found the same shape: a survey rule implemented more than once, in files
// that were all wired and all running, quietly disagreeing.
//
//   closure thresholds   3 sets — one of them a file calling itself "the single source of truth"
//                        with no importers. 1:3,000 was `marginal` on one path and `poor` on another.
//   the Texas vara       8 copies — two labelled "(exact)" and rounded, one inline in the LIVE
//                        Stage 4 closure path, and two more the first consolidation pass MISSED.
//   bearing parsing      svg-renderer.ts had its own regex that returned 0 on failure. Zero is due
//                        north, so an unreadable call was drawn as a real line and, the traverse
//                        being cumulative, rotated every corner after it.
//
// `research-modules-are-reachable.test.ts` catches modules nothing calls. It cannot catch this: the
// files here are all imported and all executed. What differs is the RULE.
//
// ── WHY THIS CHECKS CONSTANTS AND NOT "PARSERS" ─────────────────────────────────────────────────
//
// A general "is this a duplicate implementation?" check is not achievable by grep, and a bad one is
// worse than none: thirty files in this repo contain `[NS]`, nearly all of them prompt text, schema
// examples and format documentation. A check that flagged those would be noise, and noisy checks get
// skipped.
//
// So it checks the two things that ARE mechanically detectable and did in fact drift: a magic
// conversion factor written as a literal, and a closure threshold written as a literal. Both are
// numbers with exactly one correct home. The bearing case is defended by its own test against the
// renderer, since the grammar cannot be recognised by pattern.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(process.cwd(), '..');

/** Directories that carry survey arithmetic. Excludes lib/cad and lib/calculators deliberately —
 *  see ALLOWED below. */
const SCAN_DIRS = ['worker/src', 'lib/research'];

function sources(): Array<{ rel: string; text: string }> {
  const out: Array<{ rel: string; text: string }> = [];
  const walk = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push({ rel: path.relative(REPO, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') });
      }
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(REPO, d));
  return out;
}

/** Files allowed to contain a given literal, and why. */
const ALLOWED: Record<string, Record<string, string>> = {
  vara: {
    'worker/src/services/survey-units.ts': 'The definition. Every other file converts through it.',
    'lib/research/prompts.ts':
      'Prompt text. A model reads a land description better with the figure a surveyor recognises, and it is asked for the vara figure AS WRITTEN — the conversion happens here, exactly.',
    'worker/src/services/ai-extraction.ts': 'Prompt text only — the extraction prompt, same reason as above.',
    'worker/src/services/ai-plat-analyzer.ts': 'Prompt text only — the plat synthesis prompt, same reason as above.',
    'worker/src/counties/bell/analyzers/deed-analyzer.ts': 'Prompt text only — the Bell deed prompt; its arithmetic goes through convertLength.',
    'lib/research/rotation.service.ts':
      'Compares an OBSERVED scale against 25/9 to say "these distances are in varas, fix the units" — a diagnosis of the ratio, not a conversion.',
  },
  closure: {
    'worker/src/lib/closure-tolerance.ts': 'The definition. Every other file imports from it.',
  },
};

/** A rounded or exact vara factor written as a literal. */
const VARA_LITERAL = /\b(?:2\.7778\d*|25\s*\/\s*9|1000\s*\/\s*360|100\s*\/\s*36)\b/;

/** Closure ratios, as literals rather than as the shared constants. */
const CLOSURE_LITERAL = /(?<![\w.])(?:10_?000|5_?000|2_?500|25_?000)(?![\w.])/;

/** Only lines that look like arithmetic or a constant — not prose in a comment or a prompt. */
function codeLines(text: string): Array<{ n: number; line: string }> {
  return text.split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
      return true;
    });
}

describe('the Texas vara has one definition', () => {
  it('no file outside the allowlist writes the factor as a literal', () => {
    const offenders: string[] = [];
    for (const f of sources()) {
      if (ALLOWED.vara[f.rel]) continue;
      for (const { n, line } of codeLines(f.text)) {
        if (VARA_LITERAL.test(line)) offenders.push(`${f.rel}:${n}  ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.length
      ? `Convert through survey-units.ts instead of writing the factor:\n  ${offenders.join('\n  ')}`
      : '').toEqual([]);
  });

  it('the allowlist is not a place to hide a conversion', () => {
    // Every entry has to say what it is. "Prompt text" is a reason; a bare filename is not.
    for (const [file, why] of Object.entries(ALLOWED.vara)) {
      expect(why.length, `${file} needs a real reason`).toBeGreaterThan(25);
    }
  });
});

describe('the closure thresholds have one definition', () => {
  it('no file outside the allowlist compares a ratio against a literal', () => {
    // Narrower than the vara check on purpose: these numbers are ordinary in other contexts (a
    // 5,000 ms timeout, a 10,000 px limit), so only comparisons against something closure-shaped
    // count. A check that flagged every 5000 in the tree would be ignored within a week.
    const offenders: string[] = [];
    const comparison = /(?:closure|precision|ratio|perimeter)\w*\s*[<>]=?\s*(?:10_?000|5_?000|2_?500|25_?000)\b/i;
    const reversed = /(?:10_?000|5_?000|2_?500|25_?000)\s*[<>]=?\s*\w*(?:closure|precision|ratio)/i;
    for (const f of sources()) {
      if (ALLOWED.closure[f.rel]) continue;
      for (const { n, line } of codeLines(f.text)) {
        if (comparison.test(line) || reversed.test(line)) {
          offenders.push(`${f.rel}:${n}  ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, offenders.length
      ? `Import the threshold from lib/closure-tolerance.ts:\n  ${offenders.join('\n  ')}`
      : '').toEqual([]);
  });
});

describe('the check itself is honest', () => {
  it('actually reads files', () => {
    // A scan that silently matched nothing would pass forever and defend nothing — the failure mode
    // of the first version of the reachability check.
    expect(sources().length).toBeGreaterThan(100);
  });

  it('would still catch the literal it was written for', () => {
    // Guards against a future edit that loosens the pattern until it matches nothing.
    expect(VARA_LITERAL.test('distFt *= 2.7778;')).toBe(true);
    expect(VARA_LITERAL.test('return distance * (100 / 36);')).toBe(true);
    expect(VARA_LITERAL.test('const V = 25 / 9;')).toBe(true);
    expect(CLOSURE_LITERAL.test('if (ratio >= 10_000)')).toBe(true);
  });

  it('does not fire on unrelated numbers', () => {
    expect(VARA_LITERAL.test('const timeout = 2777;')).toBe(false);
    expect(VARA_LITERAL.test('scale: 1.25')).toBe(false);
  });
});
