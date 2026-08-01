// __tests__/leads/self-reported-source.test.ts — how_heard stops being thrown away. A13.
//
// The public form has asked "How Did You Hear About Us?" since launch. The contact route put the answer
// in the notification email and NOWHERE ELSE — so every submission answered the attribution question and
// the answer was deleted on arrival.
//
// For a phone or referral lead, which at this business is most of them, this is the only attribution
// signal that exists at all. Finding 6 is why it matters.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLeadRowFromForm, type LeadIntakeInput } from '@/lib/leads/intake';

const base = (over: Partial<LeadIntakeInput> = {}): LeadIntakeInput => ({
  name: 'Jane Landowner',
  email: 'jane@example.com',
  phone: '575-555-1234',
  referenceNumber: 'SS-260801-120000-ABC',
  source: 'Website',
  ...over,
});

describe('buildLeadRowFromForm — the customer\'s own answer is kept', () => {
  it('writes how_heard onto the row', () => {
    expect(buildLeadRowFromForm(base({ howHeard: 'Google Search' })).how_heard).toBe('Google Search');
  });

  it('is null, not an empty string, when they skipped the dropdown', () => {
    // An empty string is a value a status filter or a GROUP BY would treat as a real answer, which would
    // invent a "" bucket on the dashboard next to the real ones.
    expect(buildLeadRowFromForm(base({ howHeard: '' })).how_heard).toBeNull();
    expect(buildLeadRowFromForm(base({ howHeard: '   ' })).how_heard).toBeNull();
    expect(buildLeadRowFromForm(base()).how_heard).toBeNull();
  });

  it('trims what the customer sent', () => {
    expect(buildLeadRowFromForm(base({ howHeard: '  Facebook  ' })).how_heard).toBe('Facebook');
  });

  it('does not disturb the rest of the row', () => {
    // The whole point is that this is additive — a regression here would break intake for a field nobody
    // was asking about.
    const row = buildLeadRowFromForm(base({ howHeard: 'A friend' }));
    expect(row.status).toBe('new');
    expect(row.created_by).toBe('website-form');
    expect(row.name).toBe('Jane Landowner');
  });
});

describe('the contact route actually passes it through', () => {
  // The standing lesson in this repo is that a green suite misses "authored but not wired". The mapper
  // handling `howHeard` is worthless if the route never sets it — which is exactly the bug this slice
  // fixes, and it lived for months.
  const SRC = readFileSync(join(process.cwd(), 'app/api/contact/route.ts'), 'utf8');

  it('sets howHeard on the lead intake payload', () => {
    expect(SRC).toMatch(/howHeard:\s*data\.howHeard/);
  });

  it('still normalizes it from either body key', () => {
    // The public form posts `how_heard`; other callers post `howHeard`. Both were already accepted and
    // must stay that way.
    expect(SRC).toMatch(/body\.howHeard\s*\|\|\s*body\.how_heard/);
  });
});

describe('the staff-recorded field is separate, and separate on purpose', () => {
  const CARD = readFileSync(join(process.cwd(), 'app/admin/leads/[id]/AttributionCard.tsx'), 'utf8');
  const API = readFileSync(join(process.cwd(), 'app/api/admin/leads/[id]/attribution/route.ts'), 'utf8');

  it('only mentioned_ad is writable — the customer\'s answer is not editable by staff', () => {
    // Letting staff overwrite how_heard would turn a self-report into a staff opinion while keeping the
    // NAME of a self-report, and then no row could be told from any other.
    expect(API).toMatch(/mentioned_ad:\s*mentionedAd/);
    expect(API).not.toMatch(/how_heard:\s*/);
  });

  it('clears the recorder and timestamp when the value is cleared', () => {
    // "Recorded by X at Y" beside an empty field describes an observation that no longer exists.
    expect(API).toMatch(/mentioned_ad_by:\s*mentionedAd\s*\?/);
    expect(API).toMatch(/mentioned_ad_at:\s*mentionedAd\s*\?/);
  });

  it('says out loud that this is never sent to Google', () => {
    // A recollection of a conversation is not a conversion signal. Uploading it would be inventing
    // attribution, which is the one thing this plan exists to avoid.
    expect(CARD).toMatch(/never sent to Google/i);
  });

  it('tells the reader when a click id already outranks anything typed', () => {
    expect(CARD).toMatch(/stronger evidence/i);
  });
});
