// __tests__/leads/intake-forms-agree.test.ts
//
// THERE ARE THREE LIVE LEAD-INTAKE FORMS, and they are three separate hand-written copies:
//
//   app/page.tsx                      the home page
//   app/contact/page.tsx              /contact
//   app/components/SurveyCalculator.tsx  the pricing calculator
//
// A fourth, `app/components/ContactForm.tsx`, is rendered nowhere — its own header has said so since
// 2026-08-06, and it notes the tell: *it has been kept in step with the others across at least three
// commits, which is how you know people believe it is live*. That one is on the orphan list and its
// fate is the owner's call.
//
// ── WHY THIS TEST EXISTS ────────────────────────────────────────────────────────────────────────
//
// Duplicated forms drift. That is not a prediction, it is what duplication does — and here the drift
// is SILENT and expensive:
//
//   · A form that stops sending `attributionFormFields` still submits perfectly. The lead saves,
//     the email arrives, and the gclid is simply gone — so an ad-driven enquiry lands looking
//     organic and Google Ads never learns the click converted.
//   · A form that stops calling `trackConversion` still submits perfectly, and Smart Bidding
//     optimises against a funnel missing a third of its conversions.
//   · A form that loses its honeypot still submits perfectly, and starts forwarding spam.
//
// Every one of those failures looks like a working form. Nothing errors, no test fails, and the
// symptom is a slow shortfall in a number nobody is watching per-form.
//
// Checked 2026-08-27 by hand: all three carry all three. This pins that so the fourth copy — or the
// next edit to one of them — cannot quietly drop one.
//
// ── SOURCE TEXT, NOT RENDERING ──────────────────────────────────────────────────────────────────
//
// These are large client components wired to app state and a live POST. Rendering them to assert
// "did it call trackConversion" would need most of the app stubbed, and the stub is what would rot.
// The claim here is structural — this file wires that helper — and source text answers it exactly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every form a member of the public can actually submit. */
const LIVE_FORMS = [
  { file: 'app/page.tsx', source: 'home_page' },
  { file: 'app/contact/page.tsx', source: 'contact_page' },
  { file: 'app/components/SurveyCalculator.tsx', source: 'quote_calculator' },
] as const;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('the live intake forms are the ones we think they are', () => {
  it('every one of them posts to /api/contact', () => {
    // The control. If a form were renamed or moved, the assertions below would pass against a file
    // that no longer takes enquiries, and this test would be measuring nothing.
    for (const { file } of LIVE_FORMS) {
      expect(read(file), file).toMatch(/['"]\/api\/contact['"]/);
    }
  });

  it('the unrendered fourth copy is still unrendered — if that changes, this list is wrong', () => {
    // Not a complaint about ContactForm.tsx existing. It is a tripwire: the day somebody renders it,
    // there are four forms to keep in step and this file needs a fourth row.
    const callers = LIVE_FORMS.map(({ file }) => read(file)).join('\n');
    expect(callers).not.toMatch(/<ContactForm[\s/>]/);
  });
});

describe('attribution survives on every path a lead can arrive by', () => {
  it('each form captures attribution and sends it with the submission', () => {
    // Without this the lead saves fine and arrives with no gclid — an ad click that looks organic.
    for (const { file } of LIVE_FORMS) {
      const src = read(file);
      // WORD-BOUNDARY ANCHORED, and that is not fussiness. A mutation test renamed the helper to
      // `ZZattributionFormFields` and the loose /attributionFormFields/ still matched it — the
      // assertion would have survived the exact edit it exists to catch.
      expect(src, file + ' must read attribution').toMatch(/\breadAttribution\s*\(/);
      expect(src, file + ' must send the attribution fields').toMatch(/\battributionFormFields\s*\(/);
    }
  });
});

describe('conversion tracking fires once per form, with its own source', () => {
  it('each form calls trackConversion', () => {
    for (const { file } of LIVE_FORMS) {
      expect(read(file), file).toMatch(/\btrackConversion\s*\(/);
    }
  });

  it('each form reports a DISTINCT source label', () => {
    // Shared labels would merge three funnels into one and make per-form performance unreadable —
    // which is the number that decides where the ad budget goes.
    for (const { file, source } of LIVE_FORMS) {
      expect(read(file), file).toContain(`trackConversion(ref, '${source}')`);
    }
    const labels = LIVE_FORMS.map((f) => f.source);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('no form fires it twice — the double-count was removed once already', () => {
    // SurveyCalculator carries an explicit "NO trackConversion() HERE — removed 2026-08-06" comment
    // at its second submit path. One call per form, and the calculator's own note is why.
    for (const { file } of LIVE_FORMS) {
      const calls = (read(file).match(/^\s*\btrackConversion\s*\(/gm) ?? []).length;
      expect(calls, file + ' should call trackConversion exactly once').toBe(1);
    }
  });
});

describe('spam protection is on every form, not just the obvious one', () => {
  it('each form renders the honeypot and reads its values', () => {
    // A form that keeps the component but stops reading the values still renders the trap and
    // ignores what walks into it — so both halves are asserted, not just the import.
    for (const { file } of LIVE_FORMS) {
      const src = read(file);
      expect(src, file + ' must render HoneypotFields').toMatch(/<HoneypotFields[\s/>]/);
      expect(src, file + ' must read the honeypot values').toMatch(/\bhoneypotValuesFrom\s*\(/);
    }
  });
});
