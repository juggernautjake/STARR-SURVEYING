// A third vendor, and a 170-year coverage gap between two of its counties (plan R39).

import { describe, it, expect } from 'vitest';
import {
  USLR_COUNTIES,
  USLR_COVERAGE,
  USLR_FIELDS,
  USLR_PAGE_SIZE,
  USLR_REQUIRES_TRUSTED_CLICK,
  USLR_RESULTS_IN_POPUP,
  USLR_RESULTS_PROVEN,
  coverageWarning,
  describeUslrCompleteness,
  indexBegins,
  uslrUrl,
} from '../adapters/uslandrecords-discovery.js';
import { getClerkSystem } from '../services/clerk-registry.js';

describe('two counties, found one at a time', () => {
  it('builds each portal URL', () => {
    expect(uslrUrl('Falls')).toBe('https://i2i.uslandrecords.com/TX/Falls/D/');
    expect(uslrUrl('Robertson')).toBe('https://i2j.uslandrecords.com/TX/Robertson/D/');
  });

  it('does not pretend the subdomain is derivable', () => {
    // Falls is i2i and Robertson is i2j, but every other county tried on those subdomains 404s.
    // The letters are not a sequence to extrapolate.
    expect(USLR_COUNTIES.Falls.subdomain).toBe('i2i');
    expect(USLR_COUNTIES.Robertson.subdomain).toBe('i2j');
    expect(uslrUrl('Bosque')).toBeNull();
  });

  it('records the ASP.NET field names read off the live form', () => {
    expect(USLR_FIELDS.lastName).toBe('SearchFormEx1$ACSTextBox_LastName1');
    expect(USLR_FIELDS.search).toBe('SearchFormEx1$btnSearch');
  });
});

describe('driven, once the click was trusted', () => {
  it('claims results proven, because both counties returned records', () => {
    // Robertson: 239 rows back to 1870. Falls: 40 rows back to 1971.
    expect(USLR_RESULTS_PROVEN).toBe(true);
  });

  it('records that the popup was a blocker test, not the results target', () => {
    // This module first said results "open in a popup window". They do not — they render in the
    // page. The popup was the site checking whether pop-ups are allowed.
    expect(USLR_RESULTS_IN_POPUP).toBe(false);
  });

  it('records that only a TRUSTED click submits the form', () => {
    // A synthetic el.click() sends no POST at all — no error, no change. That symptom reads as
    // "the site is broken" when it means "our click was not real", which is why it is written down.
    expect(USLR_REQUIRES_TRUSTED_CLICK).toBe(true);
  });

  it('routes both counties to this vendor', () => {
    for (const [county, { fips }] of Object.entries(USLR_COUNTIES)) {
      expect(getClerkSystem(fips), county).toBe('uslandrecords');
    }
  });
});

describe('the two counties disagree about their own coverage by 170 years', () => {
  it('reads each certification banner as its own fact', () => {
    // Same vendor, same software, wildly different indexes. Assuming one county's coverage from
    // another's is exactly the kind of guess this project keeps paying for.
    expect(USLR_COVERAGE.Robertson.from).toBe('01/01/1800');
    expect(USLR_COVERAGE.Falls.from).toBe('09/23/1970');
  });

  it('knows when each index begins', () => {
    expect(indexBegins('Falls')?.getFullYear()).toBe(1970);
    expect(indexBegins('Robertson')?.getFullYear()).toBe(1800);
    expect(indexBegins('Bosque')).toBeNull();
  });

  it('warns before searching Falls for a pre-1970 deed', () => {
    // A 1940 Falls deed is not in this index. The empty result that comes back is a fact about the
    // county's website, and reporting it as a fact about the land would be wrong.
    const w = coverageWarning('Falls', new Date(1940, 0, 1));
    expect(w).toContain('online index begins 09/23/1970');
    expect(w).toContain('UNSEARCHABLE ONLINE, never as "no records"');
    expect(w).toContain('on paper at the courthouse');
  });

  it('does not warn for the same year on Robertson', () => {
    // Robertson genuinely indexes back to 1800, so 1940 is a real search there.
    expect(coverageWarning('Robertson', new Date(1940, 0, 1))).toBeNull();
  });

  it('does not warn when the window is inside coverage', () => {
    expect(coverageWarning('Falls', new Date(1995, 0, 1))).toBeNull();
  });

  it('stays silent about a county it knows nothing about', () => {
    // Silence beats inventing a coverage claim for an unsurveyed county.
    expect(coverageWarning('Bosque', new Date(1900, 0, 1))).toBeNull();
  });
});

describe('a paged read states its own completeness', () => {
  it('says nothing extra when every row was read', () => {
    // Robertson: 220 documents from all 239 party rows across 3 pages.
    const s = describeUslrCompleteness('Robertson', 220, 239, 3, 239);
    expect(s).toContain('220 document(s) from 239 party row(s) across 3 page(s)');
    expect(s).not.toContain('INCOMPLETE');
  });

  it('says INCOMPLETE when rows were missed', () => {
    // This is what the adapter reported before paging worked: 20 of 239.
    const s = describeUslrCompleteness('Robertson', 20, 20, 1, 239);
    expect(s).toContain('INCOMPLETE');
    expect(s).toContain('reported 239 row(s) but only 20 were read');
  });

  it('always says party lists are partial', () => {
    // A name search returns only the parties that matched, however many pages are walked.
    expect(describeUslrCompleteness('Falls', 39, 40, 2, 40)).toContain('PARTIAL');
  });

  it('refuses to claim completeness when the grid stated no total', () => {
    // Asserting completeness from silence is how a partial answer starts looking whole.
    const s = describeUslrCompleteness('Falls', 12, 12, 1, null);
    expect(s).toContain('completeness is UNKNOWN');
    expect(s).toContain('do not treat this as the whole result set');
  });

  it('records the page size the grid defaults to', () => {
    expect(USLR_PAGE_SIZE).toBe(20);
  });
});
