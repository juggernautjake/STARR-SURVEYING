// __tests__/leads/enrichment.test.ts
//
// The property that matters most here is NOT "does it find things". It is that the four ways of
// finding nothing stay distinguishable — because collapsing them is the defect this codebase keeps
// producing, and a lead briefing that says "nothing found" when nobody looked is the version of it
// that costs money.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyLeadSignals,
  enrichLead,
  enrichmentBriefing,
  leadSubject,
  looksCommercial,
  type EnrichableLead,
} from '@/lib/leads/enrichment';
import type { OpenWebReport } from '@/lib/research/open-web';

const HOMEOWNER: EnrichableLead = {
  name: 'Dana Whitfield',
  propertyAddress: '412 Oak Ridge Rd, Belton',
  county: 'Bell',
};

const BUILDER: EnrichableLead = {
  name: 'Sam Ortega',
  company: 'Ortega Custom Homes LLC',
  propertyAddress: '900 Ranch Road 12, Salado',
  county: 'Bell',
};

/** A Tavily stand-in. `searchOpenWeb` takes `fetchImpl`, so nothing here touches a network. */
function fakeTavily(byQuery: (q: string) => Array<{ url: string; title: string; content: string; score: number }>) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({ results: byQuery(String(body.query ?? '')) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

const NOTHING = fakeTavily(() => []);

describe('looksCommercial', () => {
  it('recognises the suffixes and trades that mean "business"', () => {
    for (const n of ['Ortega Custom Homes LLC', 'Hill Country Development', 'Vance & Sons Construction',
                     'Bluebonnet Title Co', 'Cedar Ridge Ranch', 'Maddux Engineering, Inc.']) {
      expect(looksCommercial(n), n).toBe(true);
    }
  });

  it('does not turn ordinary people into businesses', () => {
    for (const n of ['Dana Whitfield', 'Jose Alvarez', 'Mary-Kate Sullivan', '', null, undefined]) {
      expect(looksCommercial(n), String(n)).toBe(false);
    }
  });
});

describe('leadSubject', () => {
  it('prefers the company over the personal name', () => {
    // Both a better search and a narrower one: a business has a public record, and looking up a
    // company is not the same act as looking up a private individual by name.
    expect(leadSubject(BUILDER)?.ownerName).toBe('Ortega Custom Homes LLC');
  });

  it('falls back to the personal name only when it is the sole identifier', () => {
    expect(leadSubject(HOMEOWNER)?.ownerName).toBe('Dana Whitfield');
  });

  it('refuses to search a lead with nothing to search', () => {
    // An empty query returns topical noise, and noise presented as enrichment is worse than a blank.
    expect(leadSubject({ name: '  ', company: null, propertyAddress: '' })).toBeNull();
    expect(leadSubject({})).toBeNull();
  });

  it('still searches an address-only lead', () => {
    const s = leadSubject({ propertyAddress: '412 Oak Ridge Rd', county: 'Bell' });
    expect(s?.address).toBe('412 Oak Ridge Rd');
    expect(s?.county).toBe('Bell');
  });
});

describe('the four ways of finding nothing stay distinguishable', () => {
  it('separates "no key" from "searched and found nothing"', async () => {
    const unset = await enrichLead(HOMEOWNER, { apiKey: '', fetchImpl: NOTHING });
    const searched = await enrichLead(HOMEOWNER, { apiKey: 'tvly-test', fetchImpl: NOTHING });

    // The whole point of the module's status field, in one assertion.
    expect(unset.status).toBe('not-configured');
    expect(searched.status).toBe('searched');
    expect(unset.status).not.toBe(searched.status);

    // And both produce zero signals — which is exactly why the status has to carry the difference.
    expect(unset.signals).toHaveLength(0);
    expect(searched.signals).toHaveLength(0);
  });

  it('separates a lead too thin to search from a search that ran', async () => {
    const thin = await enrichLead({ name: '   ' }, { apiKey: 'tvly-test', fetchImpl: NOTHING });
    expect(thin.status).toBe('insufficient-lead');
    expect(thin.report).toBeNull();
  });

  it('reports a provider outage as an outage, not as a missing setting', async () => {
    const down = await enrichLead(HOMEOWNER, {
      apiKey: 'tvly-test',
      fetchImpl: async () => new Response('upstream exploded', { status: 503 }),
    });
    // Telling an operator "not configured" during an outage sends them to change a correct setting.
    expect(down.status).toBe('search-failed');
    expect(down.status).not.toBe('not-configured');
  });

  it('says all four differently in the briefing, on the first line', async () => {
    const headers = new Set<string>();
    headers.add(enrichmentBriefing(await enrichLead(HOMEOWNER, { apiKey: '', fetchImpl: NOTHING })).split('\n')[0]);
    headers.add(enrichmentBriefing(await enrichLead(HOMEOWNER, { apiKey: 'k', fetchImpl: NOTHING })).split('\n')[0]);
    headers.add(enrichmentBriefing(await enrichLead({ name: ' ' }, { apiKey: 'k', fetchImpl: NOTHING })).split('\n')[0]);
    headers.add(enrichmentBriefing(await enrichLead(HOMEOWNER, {
      apiKey: 'k', fetchImpl: async () => new Response('', { status: 500 }),
    })).split('\n')[0]);

    expect(headers.size).toBe(4);
  });

  it('never presents an unsearched lead as a clean record', async () => {
    const text = enrichmentBriefing(await enrichLead(HOMEOWNER, { apiKey: '', fetchImpl: NOTHING }));
    expect(text).toMatch(/NOT SEARCHED/);
    expect(text).toMatch(/blank, not a clean record/);
  });
});

describe('signals', () => {
  it('reads the company off the lead without needing a search at all', () => {
    // Tavily being unset does not make the customer's own company field unreadable.
    const signals = classifyLeadSignals(BUILDER, null);
    expect(signals.map((s) => s.kind)).toContain('commercial-operator');
  });

  it('does not invent a business for a homeowner', () => {
    expect(classifyLeadSignals(HOMEOWNER, null)).toHaveLength(0);
  });

  it('weights an official record above an open-web mention', async () => {
    const official = await enrichLead(BUILDER, {
      apiKey: 'k',
      only: ['permits-planning'],
      fetchImpl: fakeTavily(() => [
        { url: 'https://www.bellcounty.texas.gov/agenda/2026-08', title: 'Planning agenda', content: 'Ortega', score: 0.9 },
      ]),
    });
    const blog = await enrichLead(BUILDER, {
      apiKey: 'k',
      only: ['permits-planning'],
      fetchImpl: fakeTavily(() => [
        { url: 'https://someblog.example.com/post', title: 'A post', content: 'Ortega', score: 0.9 },
      ]),
    });

    const permitOf = (e: Awaited<ReturnType<typeof enrichLead>>) =>
      e.signals.find((s) => s.kind === 'active-permit');

    expect(permitOf(official)?.confidence).toBe('strong');
    expect(permitOf(blog)?.confidence).toBe('weak');
  });

  it('refuses to state a signal without something to click', async () => {
    const e = await enrichLead(BUILDER, {
      apiKey: 'k',
      fetchImpl: fakeTavily(() => [
        { url: 'https://www.bellcounty.texas.gov/permits/1', title: 'Permit', content: 'x', score: 0.9 },
      ]),
    });
    expect(e.signals.length).toBeGreaterThan(0);
    for (const s of e.signals) {
      expect(s.sources.length, s.kind).toBeGreaterThan(0);
      // Either a URL to open, or an explicit statement that the lead itself is the source.
      expect(s.sources[0].url || s.sources[0].title).toBeTruthy();
    }
  });

  it('labels a lead-stated company as stated, never as a finding', () => {
    const s = classifyLeadSignals(BUILDER, null).find((x) => x.kind === 'commercial-operator')!;
    expect(s.sources[0].url).toBe('');
    expect(s.sources[0].title).toMatch(/Stated on the enquiry/);
  });

  it('sorts the strongest signal first — the briefing is read top-down under time pressure', async () => {
    const e = await enrichLead(BUILDER, {
      apiKey: 'k',
      fetchImpl: fakeTavily((q) =>
        /permit|planning/i.test(q)
          ? [{ url: 'https://www.bellcounty.texas.gov/p/1', title: 'Permit', content: 'x', score: 0.9 }]
          : [{ url: 'https://forum.example.com/t/9', title: 'Thread', content: 'x', score: 0.9 }],
      ),
    });
    const order = e.signals.map((s) => s.confidence);
    expect(order).toEqual([...order].sort((a, b) =>
      ({ strong: 0, moderate: 1, weak: 2 })[a] - ({ strong: 0, moderate: 1, weak: 2 })[b]));
  });
});

describe('it never breaks intake', () => {
  it('resolves rather than throwing when the provider throws', async () => {
    const e = await enrichLead(BUILDER, {
      apiKey: 'k',
      fetchImpl: async () => { throw new Error('DNS is on fire'); },
    });
    // A quote request must be saved and acknowledged whether or not a search API is having a good
    // day. The caller displays a status; it does not catch an exception.
    expect(['search-failed', 'searched']).toContain(e.status);
    expect(() => enrichmentBriefing(e)).not.toThrow();
  });

  it('produces a readable briefing for every status', async () => {
    for (const opts of [
      { apiKey: '', fetchImpl: NOTHING },
      { apiKey: 'k', fetchImpl: NOTHING },
      { apiKey: 'k', fetchImpl: async () => new Response('', { status: 500 }) },
    ]) {
      const text = enrichmentBriefing(await enrichLead(BUILDER, opts as never));
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/undefined|\[object/);
    }
  });
});

describe('the report is only attached when it was really searched', () => {
  it('leaves report null on a not-configured run', async () => {
    // A report full of `skipped: not-configured` angles rendered into a panel would look like a
    // search that came back empty. Withholding it forces the caller through `status`.
    const e = await enrichLead(BUILDER, { apiKey: '', fetchImpl: NOTHING });
    expect(e.report).toBeNull();
    expect(e.subject).not.toBeNull(); // but what WOULD have been searched is still shown
  });

  it('attaches it on a real search', async () => {
    const e = await enrichLead(BUILDER, { apiKey: 'k', fetchImpl: NOTHING });
    expect(e.report).not.toBeNull();
    expect((e.report as OpenWebReport).angles.length).toBeGreaterThan(0);
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────────
//
// The plan doc this slice came from also records `lib/research/prioritized-pipeline.ts`: 764 lines of
// plausible, well-commented code with ZERO callers, where nobody can now tell whether it ever ran.
// A module is not shipped because it exists. These assertions are the difference.

describe('the enrichment module is reachable from the product', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  const route = read('app/api/admin/leads/[id]/enrichment/route.ts');
  const card = read('app/admin/leads/[id]/BackgroundCard.tsx');
  const page = read('app/admin/leads/[id]/page.tsx');

  it('an API route calls it', () => {
    expect(route).toContain("from '@/lib/leads/enrichment'");
    expect(route).toContain('enrichLead(');
    expect(route).toContain('enrichmentBriefing(');
  });

  it('the route is admin-gated, not merely signed-in', () => {
    // It returns unverified web results about a named person or business. That is diligence for
    // whoever prices and staffs the job, not something to hand to every account.
    expect(route).toContain('isAdmin(session.user.roles)');
    expect(route).toContain("{ status: 403 }");
    expect(route).toContain("{ status: 401 }");
  });

  it('the route only reads — enrichment never writes to the lead', () => {
    expect(route).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(route).not.toContain('export const POST');
    expect(route).not.toContain('export const PATCH');
  });

  it('a card calls the route, and the page mounts the card', () => {
    // Either half missing leaves the feature invisible while every test above still passes.
    expect(card).toContain('/enrichment');
    expect(page).toContain("import BackgroundCard from './BackgroundCard'");
    expect(page).toContain('<BackgroundCard leadId={lead.id} />');
  });

  it('the card branches on status, not on how many signals came back', () => {
    // `signals.length === 0` means four different things. Branching on it is the exact bug this
    // module's status field exists to prevent.
    expect(card).toContain('STATUS_COPY');
    expect(card).toContain("data.status === 'searched'");
  });

  it('does not reach the customer-facing draft', () => {
    // The doc's own line: search results are unverified by construction, and this firm's product is
    // a licensed professional's assurance. Nothing here may be quoted into a reply to a customer.
    const draft = read('lib/leads/ai-draft.ts');
    expect(draft).not.toContain('enrichment');
    expect(draft).not.toContain('enrichLead');
    // Checked as an IMPORT, not as a string: the route's own header explains that it stays away
    // from ai-draft, and a naive substring match fails on the sentence saying so.
    expect(route).not.toMatch(/^import[^;]*ai-draft/m);
  });
});
