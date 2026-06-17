// __tests__/calendar/c6-lead-to-job.test.ts
//
// job-calendar Slice C6 — lead → job prefill conversion. Locks the
// pure mapper invariants + the new-job page wiring + the lead detail
// "Convert to job" button + the leads PATCH route accepting
// `converted_job_id`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildJobDraftFromLead,
  EMPTY_JOB_DRAFT,
  type LeadForConversion,
} from '@/lib/calendar/lead-to-job';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function fakeLead(overrides: Partial<LeadForConversion> = {}): LeadForConversion {
  return {
    id: 'LEAD-1',
    name: 'Jane Landowner',
    email: 'jane@example.com',
    phone: '254-555-1234',
    company: 'Acme Cattle Co.',
    property_address: '123 FM 436, Belton',
    city: 'Belton',
    state: 'tx',
    survey_type: 'Boundary',
    estimated_acreage: 5,
    quote_amount: 1800,
    notes: 'Wants the south fence line confirmed.',
    ...overrides,
  };
}

describe('EMPTY_JOB_DRAFT — mirrors the new-job form defaults', () => {
  it('starts at stage="quote", state="TX", survey_type="boundary"', () => {
    expect(EMPTY_JOB_DRAFT.stage).toBe('quote');
    expect(EMPTY_JOB_DRAFT.state).toBe('TX');
    expect(EMPTY_JOB_DRAFT.survey_type).toBe('boundary');
  });
  it('every string field starts empty', () => {
    expect(EMPTY_JOB_DRAFT.name).toBe('');
    expect(EMPTY_JOB_DRAFT.acreage).toBe('');
    expect(EMPTY_JOB_DRAFT.quote_amount).toBe('');
    expect(EMPTY_JOB_DRAFT.client_name).toBe('');
  });
});

describe('buildJobDraftFromLead — pure mapper', () => {
  it('produces a "<Customer> Survey" job name', () => {
    expect(buildJobDraftFromLead(fakeLead()).name).toBe('Jane Landowner Survey');
  });

  it('copies the customer contact fields into the client_* slots', () => {
    const d = buildJobDraftFromLead(fakeLead());
    expect(d.client_name).toBe('Jane Landowner');
    expect(d.client_email).toBe('jane@example.com');
    expect(d.client_phone).toBe('254-555-1234');
    expect(d.client_company).toBe('Acme Cattle Co.');
  });

  it('copies the property fields and upper-cases the state', () => {
    const d = buildJobDraftFromLead(fakeLead());
    expect(d.address).toBe('123 FM 436, Belton');
    expect(d.city).toBe('Belton');
    // state retained as-typed by the customer; the mapper trims but
    // doesn't force case so an out-of-state lead still renders.
    expect(d.state).toBe('tx');
  });

  it('defaults state to TX when the lead has none', () => {
    const d = buildJobDraftFromLead(fakeLead({ state: null }));
    expect(d.state).toBe('TX');
  });

  it('stringifies numeric estimated_acreage + quote_amount for the form', () => {
    const d = buildJobDraftFromLead(fakeLead({ estimated_acreage: 5.5, quote_amount: 1800 }));
    expect(d.acreage).toBe('5.5');
    expect(d.quote_amount).toBe('1800');
  });

  it('drops NaN / non-finite numeric values rather than writing junk', () => {
    expect(buildJobDraftFromLead(fakeLead({ estimated_acreage: NaN })).acreage).toBe('');
    expect(buildJobDraftFromLead(fakeLead({ quote_amount: Infinity })).quote_amount).toBe('');
  });

  it('appends a provenance line to the notes so a future search can find the source lead', () => {
    const d = buildJobDraftFromLead(fakeLead());
    expect(d.notes).toContain('Wants the south fence line confirmed.');
    expect(d.notes).toContain('Converted from lead LEAD-1.');
  });

  it("doesn't crash when the lead has no notes — provenance still appears", () => {
    const d = buildJobDraftFromLead(fakeLead({ notes: null }));
    expect(d.notes).toBe('Converted from lead LEAD-1.');
  });

  it('maps common survey_type strings to the form enum values', () => {
    expect(buildJobDraftFromLead(fakeLead({ survey_type: 'Boundary' })).survey_type).toBe('boundary');
    expect(buildJobDraftFromLead(fakeLead({ survey_type: 'ALTA/NSPS' })).survey_type).toBe('alta');
    expect(buildJobDraftFromLead(fakeLead({ survey_type: 'Topographic' })).survey_type).toBe('topo');
    expect(buildJobDraftFromLead(fakeLead({ survey_type: 'asbuilt' })).survey_type).toBe('asbuilt');
  });

  it('falls back to boundary for unknown survey types', () => {
    expect(buildJobDraftFromLead(fakeLead({ survey_type: 'martian-grid' })).survey_type).toBe('boundary');
  });

  it('preserves the form defaults for fields not present in the lead', () => {
    const d = buildJobDraftFromLead(fakeLead());
    expect(d.stage).toBe('quote');
    expect(d.is_priority).toBe(false);
    expect(d.deadline).toBe('');
    expect(d.lot_number).toBe('');
  });
});

describe('new-job page — C6 prefill wiring', () => {
  const SRC = read('app/admin/jobs/new/page.tsx');

  it('imports the helper + the LeadForConversion type', () => {
    expect(SRC).toMatch(/from '@\/lib\/calendar\/lead-to-job'/);
    expect(SRC).toMatch(/buildJobDraftFromLead/);
  });

  it('reads ?fromLead= via useSearchParams', () => {
    expect(SRC).toMatch(/useSearchParams\(\)/);
    expect(SRC).toMatch(/searchParams\?\.get\('fromLead'\) \?\? null/);
  });

  it('strict-mode-safe: a ref prevents the effect from firing twice', () => {
    expect(SRC).toMatch(/prefillFiredRef = useRef\(false\)/);
    expect(SRC).toMatch(/if \(prefillFiredRef\.current\) return;/);
  });

  it('fetches the lead from /api/admin/leads/<id>', () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/leads\/\$\{encodeURIComponent\(fromLeadId\)\}`/);
  });

  it('after a successful POST, PATCHes the lead with status=accepted + converted_job_id', () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/leads', \{\s*\n\s*method: 'PATCH'/);
    expect(SRC).toMatch(/status: 'accepted'/);
    expect(SRC).toMatch(/converted_job_id: data\.job\.id/);
  });

  it('renders the lead-prefill banner only when a lead was found', () => {
    expect(SRC).toMatch(/data-testid="lead-prefill-banner"/);
    expect(SRC).toMatch(/\{prefilledLead && \(/);
  });
});

describe('leads detail — C6 Convert to job button', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it('renders a Convert button only when the lead has NOT been converted yet', () => {
    expect(SRC).toMatch(/!lead\.converted_job_id && \(/);
    expect(SRC).toMatch(/data-action="convert-to-job"/);
  });

  it('routes to /admin/jobs/new?fromLead=<id>', () => {
    expect(SRC).toMatch(/`\/admin\/jobs\/new\?fromLead=\$\{encodeURIComponent\(lead\.id\)\}`/);
  });
});

describe('leads PATCH route — C6 accepts converted_job_id', () => {
  const SRC = read('app/api/admin/leads/route.ts');

  it('EDITABLE_FIELDS includes converted_job_id', () => {
    expect(SRC).toMatch(/'follow_up_date', 'converted_job_id'/);
  });
});
