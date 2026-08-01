// __tests__/customers/lead-repeat-badge.test.ts — the returning-customer badge is actually wired (A3).
//
// This is a SOURCE LOCK, and it is worth saying why rather than pretending it is equivalent to driving the
// page: `/admin` requires a Starr staff session, which this environment does not have, so the badge itself
// was not rendered in a browser. What IS verified here is the chain that the "authored but not shipped"
// defect actually breaks — the column is selected, the API returns it, the client reads it, and the badge
// is conditional on the right field. Every link in that chain has been the broken one in this repo before.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const DETAIL_API = read('app/api/admin/leads/[id]/route.ts');
const LIST_API = read('app/api/admin/leads/route.ts');
const PAGE = read('app/admin/leads/[id]/page.tsx');

describe('the chain from column to badge is unbroken', () => {
  it('both lead APIs select customer_id', () => {
    // The first link, and the easiest to forget: a column absent from SELECT_COLS is undefined on the
    // client with no error anywhere.
    expect(DETAIL_API).toMatch(/SELECT_COLS[\s\S]{0,400}customer_id/);
    expect(LIST_API).toMatch(/SELECT_COLS[\s\S]{0,400}customer_id/);
  });

  it('the detail API resolves and returns the customer summary', () => {
    expect(DETAIL_API).toMatch(/from\('customers'\)/);
    expect(DETAIL_API).toMatch(/job_count, lifetime_value_cents, is_repeat/);
    expect(DETAIL_API).toMatch(/NextResponse\.json\(\{ lead, customer \}\)/);
  });

  it('a lead with NO customer still returns, rather than erroring', () => {
    // A walk-in with no email or phone has no customer_id, and that is ordinary. The lookup must be
    // guarded, not assumed — this is the branch that would 500 the whole page for the least-attributable
    // customers, who are exactly the ones the office is most likely to be looking at on paper.
    expect(DETAIL_API).toMatch(/if \(typeof customerId === 'string' && customerId\)/);
    // The declaration spans several lines, so match the two ends of it rather than the whole shape.
    expect(DETAIL_API).toMatch(/let customer: \{/);
    expect(DETAIL_API).toMatch(/\} \| null = null;/);
  });

  it('the client reads it into state', () => {
    expect(PAGE).toMatch(/setCustomer\(res\?\.customer \?\? null\)/);
    expect(PAGE).toMatch(/safeFetch<\{ lead: Lead; customer: CustomerSummary \| null \}>/);
  });

  it('the badge renders only for a REPEAT customer', () => {
    // Labelling every lead "customer" would make the signal worthless — the badge exists to say
    // "you have worked for this person before", and that is only interesting when true.
    expect(PAGE).toMatch(/customer\?\.is_repeat && \(/);
    expect(PAGE).toMatch(/data-testid="lead-repeat-customer"/);
    expect(PAGE).toMatch(/Returning customer/);
  });

  it('pluralises the job count instead of saying "1 previous jobs"', () => {
    expect(PAGE).toMatch(/job_count === 1 \? '' : 's'/);
  });

  it('has styling of its own, so it is not an unstyled span', () => {
    // The pay-portal bug of 2026-07-31 was markup that shipped with no stylesheet behind it. Cheap check.
    expect(PAGE).toMatch(/\.lead-detail__repeat-pill \{[\s\S]{0,300}background:/);
  });
});
