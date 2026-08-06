// __tests__/marketing/conversion-firing-points.test.ts
//
// Every place the site reports a conversion to Google Ads, and the two rules all of them must follow.
//
// ── WHY THIS IS WORTH A TEST ────────────────────────────────────────────────────────────────────
//
// A wrong conversion does not throw, does not 500, and does not show up in any error log. It shows
// up months later as Smart Bidding spending the budget on the wrong clicks, because the account was
// trained on a lead count that was not true. The two failure shapes have both already happened here:
//
//   · DOUBLE-COUNTING — a `trackConversion()` with no `transaction_id`. Google treats a repeated
//     send as a second conversion, so one form submit plus a back/forward-cache restore is two
//     leads. Fixed on 2026-07-31 by deleting a DOM-polling script, and again on 2026-08-06 in
//     `ContactForm.tsx`, which still had a bare call.
//
//   · PHANTOM CONVERSIONS — found 2026-08-06: `SurveyCalculator.tsx` fired a conversion in its
//     `catch` branch, i.e. after the POST had FAILED and it had fallen back to a `mailto:`. Nothing
//     reached the server, so there was no lead row, no reference and no stored `gclid` — the
//     conversion could not be deduped, matched, valued or corrected. It reported a lead the business
//     had no record of.
//
// Source-asserted rather than rendered: these are call sites, and the property being checked is
// "where in the control flow does this line sit", which a render test cannot see.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Every file that calls `trackConversion`, found by scanning rather than listed, so a new intake
 *  surface is covered the day it is written instead of the day somebody remembers this file. */
function conversionCallSites(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        if (rel === 'app/utils/gtag.ts') continue;                 // the definition
        if (rel === 'app/components/GoogleAdsScript.tsx') continue; // prose about the removal
        const src = fs.readFileSync(p, 'utf8');
        if (/\btrackConversion\s*\(/.test(src)) out.push(rel);
      }
    }
  };
  walk(path.join(ROOT, 'app'));
  return out.sort();
}

const SITES = conversionCallSites();

describe('the conversion call sites', () => {
  it('finds the intake surfaces, so this suite is not silently testing nothing', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(3);
    expect(SITES).toContain('app/contact/page.tsx');
    expect(SITES).toContain('app/page.tsx');
    expect(SITES).toContain('app/components/SurveyCalculator.tsx');
  });

  it('every call passes a dedupe key', () => {
    // `trackConversion()` with empty parens sends no `transaction_id`. Google then counts a repeated
    // send as a new conversion, however the repeat arrives.
    const bare: string[] = [];
    for (const rel of SITES) {
      const src = read(rel);
      for (const line of src.split('\n')) {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*')) continue;   // fix notes quote the old call
        if (/\btrackConversion\s*\(\s*\)/.test(code)) bare.push(`${rel}: ${code}`);
      }
    }
    expect(
      bare,
      `These fire a conversion with no transaction_id, so a resubmit or a bfcache restore counts twice:\n  ${bare.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no conversion fires from a catch block', () => {
    // The phantom-conversion shape. A `catch` here means the submission did not reach the server, so
    // there is no lead, no reference and no stored click id — nothing the offline pipeline can ever
    // reconcile. Detected by walking braces from each `catch {` / `catch (…) {` to its close.
    const offenders: string[] = [];
    for (const rel of SITES) {
      const src = read(rel);
      const re = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        while (i < src.length && depth > 0) {
          const c = src[i];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          i++;
        }
        const body = src.slice(start, i);
        // Strip comments — the fix note in SurveyCalculator deliberately names the removed call.
        const code = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        if (/\btrackConversion\s*\(/.test(code)) {
          offenders.push(`${rel} (catch at offset ${m.index})`);
        }
      }
    }
    expect(
      offenders,
      `A conversion fired from a failure path — the submission never reached the server:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the Google Ads tag', () => {
  it('is mounted somewhere that renders on the public site', () => {
    // The tag lives in the marketing Footer, which `LayoutShell` renders for every public route and
    // suppresses on /admin, /platform and the harnesses. If nothing imported it, `window.gtag` would
    // never exist and every `trackConversion` call would hit its warning branch silently.
    const footer = read('app/components/Footer.tsx');
    expect(footer).toMatch(/import GoogleAdsScript/);
    expect(footer).toMatch(/<GoogleAdsScript\s*\/>/);
  });

  it('records where the click came from on every page, not just the form page', () => {
    // Almost nobody converts on the page they landed on. Capture must be in the root layout.
    const layout = read('app/layout.tsx');
    expect(layout).toMatch(/<AttributionCapture\s*\/>/);
  });
});
