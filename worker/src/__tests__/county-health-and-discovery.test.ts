/**
 * Recording what works, recognising what is there, and finding what is missing.
 *
 * Owner, 2026-09-21, across three messages: record every resource and whether it works; run health
 * checks per county and across all of them; and build the discovery work of this session — the
 * Playwright driving, the endpoint hunting, the vendor identification — into the system itself.
 *
 * The signatures and failure shapes here were all read off live sites during that session.
 */

import { describe, it, expect } from 'vitest';
import {
  observe, summariseCounty, summariseFleet, healthLines, needsAttention, hostOf,
} from '../research/county-health.js';
import {
  fingerprint, vendorMismatch, knownVendors,
} from '../research/vendor-fingerprint.js';
import {
  appraisalCandidates, clerkCandidates, dataCandidates, probeHost, discoverCounty,
} from '../research/county-discovery.js';
import { readTransportError } from '../research/site-rejection.js';

// ── HEALTH ──────────────────────────────────────────────────────────────────────────────────────

const refused = readTransportError(new Error('net::ERR_TUNNEL_CONNECTION_FAILED'));
const deadHost = readTransportError(new Error('getaddrinfo ENOTFOUND esearch.wilcotx.gov'));

describe('an observation separates a refusal from an empty result', () => {
  it('rows found is working', () => {
    expect(observe({ county: 'Bell', role: 'clerk', found: 18 }).state).toBe('working');
  });

  it('no rows and no error is EMPTY, which may be correct', () => {
    // A clerk with nothing for a name is making a statement about the property. Calling that ill
    // health would make every quiet parcel look like an outage.
    expect(observe({ county: 'Bell', role: 'clerk', found: 0 }).state).toBe('empty');
  });

  it('a refusal of US is `refused` even if something came back', () => {
    const o = observe({ county: 'Williamson', role: 'appraisal', found: 3, verdict: refused });
    expect(o.state).toBe('refused');
  });

  it('a site being down is not our defect', () => {
    const down = readTransportError(new Error('The operation was aborted due to timeout'));
    expect(observe({ county: 'Bell', role: 'clerk', verdict: down }).state).toBe('site_down');
  });

  it('a role never attempted says so rather than looking healthy', () => {
    expect(observe({ county: 'Bell', role: 'plats', attempted: false }).state).toBe('not_tried');
  });

  it('carries the remedy forward', () => {
    expect(observe({ county: 'Williamson', role: 'appraisal', verdict: deadHost }).remedy)
      .toMatch(/configured hostname/i);
  });
});

describe('one county', () => {
  it('a broken APPRAISAL breaks the county — everything after it is guesswork', () => {
    const r = summariseCounty('Williamson', [
      observe({ county: 'Williamson', role: 'appraisal', verdict: deadHost }),
      observe({ county: 'Williamson', role: 'clerk', found: 18 }),
    ]);
    expect(r.health).toBe('broken');
    expect(r.broken.map((o) => o.role)).toContain('appraisal');
  });

  it('a broken CLERK is only degraded — the parcel is still identified', () => {
    const r = summariseCounty('Bell', [
      observe({ county: 'Bell', role: 'appraisal', found: 1 }),
      observe({ county: 'Bell', role: 'clerk', verdict: refused }),
    ]);
    expect(r.health).toBe('degraded');
  });

  it('everything answering with data is healthy', () => {
    const r = summariseCounty('Bell', [
      observe({ county: 'Bell', role: 'appraisal', found: 1 }),
      observe({ county: 'Bell', role: 'clerk', found: 4 }),
    ]);
    expect(r.health).toBe('healthy');
    expect(healthLines(r).join(' ')).toMatch(/reached and answered/i);
  });

  it('empty everywhere is UNKNOWN, not healthy and not broken', () => {
    const r = summariseCounty('Bell', [observe({ county: 'Bell', role: 'clerk', found: 0 })]);
    expect(r.health).toBe('unknown');
  });

  it('nothing observed is unknown', () => {
    expect(summariseCounty('Llano', []).health).toBe('unknown');
  });

  it('only a refusal demands attention', () => {
    expect(needsAttention(observe({ county: 'X', role: 'clerk', verdict: refused }))).toBe(true);
    expect(needsAttention(observe({ county: 'X', role: 'clerk', found: 0 })), 'empty is a finding')
      .toBe(false);
    const down = readTransportError(new Error('timed out'));
    expect(needsAttention(observe({ county: 'X', role: 'clerk', verdict: down })), 'weather fixes itself')
      .toBe(false);
  });

  it('the lines name the host and the remedy', () => {
    const r = summariseCounty('Williamson', [
      observe({ county: 'Williamson', role: 'appraisal', host: 'esearch.wilcotx.gov', verdict: deadHost }),
    ]);
    const text = healthLines(r).join('\n');
    expect(text).toContain('esearch.wilcotx.gov');
    expect(text).toMatch(/→/);
  });
});

describe('every county at once, worst first', () => {
  const obs = [
    observe({ county: 'Bell', role: 'appraisal', found: 1 }),
    observe({ county: 'Bell', role: 'clerk', found: 9 }),
    observe({ county: 'Williamson', role: 'appraisal', verdict: deadHost }),
    observe({ county: 'Milam', role: 'appraisal', found: 1 }),
    observe({ county: 'Milam', role: 'clerk', verdict: refused }),
  ];

  it('sorts broken before degraded before healthy', () => {
    // Read when something is wrong; a broken county buried between Bastrop and Bosque is a broken
    // county nobody sees.
    const f = summariseFleet(obs);
    expect(f.counties[0]!.county).toBe('Williamson');
    expect(f.counties.map((c) => c.health)).toEqual(['broken', 'degraded', 'healthy']);
  });

  it('names the broken ones in the statement', () => {
    expect(summariseFleet(obs).statement).toContain('Williamson');
  });

  it('an empty fleet says so', () => {
    expect(summariseFleet([]).statement).toMatch(/no county has been observed/i);
  });
});

describe('hostOf', () => {
  it('reads a host', () => {
    expect(hostOf('https://search.wcad.org/x?y=1')).toBe('search.wcad.org');
  });
  it.each([['empty', ''], ['garbage', 'not a url'], ['null', null]])('%s is null', (_l, v) => {
    expect(hostOf(v as string | null)).toBeNull();
  });
});

// ── FINGERPRINTING ──────────────────────────────────────────────────────────────────────────────

describe('recognising the software — every signature read off a live page', () => {
  it('True Automation, by its API path and its id scheme', () => {
    const f = fingerprint({
      url: 'https://search.wcad.org/ProxyT/Search/Properties/quick/?f=x',
      title: 'PublicAccess > Home',
      body: '<input id="__dnnVariable"> PropertyQuickRefID',
    });
    expect(f.vendor).toBe('true_automation');
    expect(f.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('Tyler Eagle, by DOCSEARCH and the chip-list field id', () => {
    const f = fingerprint({
      url: 'https://williamsoncountytx-web.tylerhost.net/williamsonweb/search/DOCSEARCH149S1',
      title: 'Self-Service: Document Search',
      body: '<input id="field_BothNamesID" class="cblist-input-list">',
    });
    expect(f.vendor).toBe('tyler_eagle');
    // The note carries the rule that took a session to work out.
    expect(f.note).toMatch(/chip lists/i);
    expect(f.note).toMatch(/not the same sentence as "no results"/i);
  });

  it('Kofile, with the warning that it may hold the wrong index', () => {
    const f = fingerprint({ url: 'https://williamson.tx.publicsearch.us/?department=CCM' });
    expect(f.vendor).toBe('kofile');
    expect(f.note).toMatch(/Commissioners Court/i);
  });

  it('Odyssey, by its search route', () => {
    const f = fingerprint({
      url: 'https://judicialrecords.wilco.org/PublicAccess/Search.aspx?ID=200',
      body: "LaunchSearch('Search.aspx?ID=200'",
    });
    expect(f.vendor).toBe('tyler_odyssey');
    expect(f.note).toMatch(/probate|heirship/i);
  });

  it('Socrata, by its resource path', () => {
    const f = fingerprint({ url: 'https://data.wcad.org/resource/an3x-cnmw.json?$limit=1' });
    expect(f.vendor).toBe('socrata');
  });

  it('BIS, by the esearch hostname', () => {
    expect(fingerprint({ url: 'https://esearch.milamad.org/' }).vendor).toBe('bis');
  });

  it('an unknown page says so instead of guessing', () => {
    const f = fingerprint({ url: 'https://example.com/', body: '<h1>Hello</h1>' });
    expect(f.vendor).toBe('unknown');
    expect(f.note).toMatch(/drive it by hand/i);
  });

  it('every signature carries a note worth reading', () => {
    for (const v of knownVendors()) {
      expect(v.note.length, v.vendor).toBeGreaterThan(40);
      expect(v.markerCount, v.vendor).toBeGreaterThan(0);
    }
  });
});

describe('the mismatch check that would have caught Williamson', () => {
  it('flags a configured vendor that disagrees with the live site', () => {
    const found = fingerprint({ url: 'https://search.wcad.org/ProxyT/Search/Properties/quick/', title: 'PublicAccess' });
    const mm = vendorMismatch('bis', found);
    expect(mm?.mismatch).toBe(true);
    expect(mm!.message).toMatch(/configuration defect, not an outage/i);
  });

  it('says nothing when they agree', () => {
    expect(vendorMismatch('kofile', fingerprint({ url: 'https://bell.tx.publicsearch.us/' }))).toBeNull();
  });

  it('says nothing on a weak identification, rather than crying wolf', () => {
    expect(vendorMismatch('bis', { vendor: 'socrata', confidence: 0.2, evidence: [], note: '' })).toBeNull();
  });
});

// ── DISCOVERY ───────────────────────────────────────────────────────────────────────────────────

describe('candidate hostnames', () => {
  it('includes the district ABBREVIATION, which is how Williamson was found', () => {
    // A slug built only from the full county name never produces `search.wcad.org`, and that is
    // exactly how a fictional `esearch.wilcotx.gov` survived in the config for months.
    const c = appraisalCandidates('Williamson');
    expect(c.some((u) => u.includes('wcad.org'))).toBe(true);
    expect(c.some((u) => u.includes('search.wcad.org'))).toBe(true);
  });

  it('includes the commonest BIS shape first', () => {
    expect(appraisalCandidates('Milam')[0]).toContain('esearch.milamcad.org');
  });

  it('handles "X County" and odd spacing', () => {
    expect(appraisalCandidates('  Bell County ')).toEqual(appraisalCandidates('Bell'));
  });

  it('clerk candidates cover the three vendors that serve Texas', () => {
    const c = clerkCandidates('Williamson');
    expect(c.some((u) => u.includes('publicsearch.us'))).toBe(true);
    expect(c.some((u) => u.includes('tylerhost.net'))).toBe(true);
    expect(c.some((u) => u.includes('texasfile.com'))).toBe(true);
  });

  it('data candidates look for an open-data portal', () => {
    expect(dataCandidates('Williamson').some((u) => u.includes('data.wcad.org'))).toBe(true);
  });

  it('a nonsense county produces nothing rather than junk requests', () => {
    expect(appraisalCandidates('  ')).toEqual([]);
    expect(clerkCandidates('123')).toEqual([]);
  });
});

describe('probing', () => {
  const fake = (body: string, status = 200) => (async () => ({
    status, ok: status < 400,
    text: async () => body,
    headers: { forEach: () => {} },
  })) as unknown as typeof fetch;

  it('identifies what answered', async () => {
    const p = await probeHost('https://search.wcad.org/', {
      fetchImpl: fake('<title>PublicAccess > Home</title> PropertyQuickRefID __dnnVariable'),
    });
    expect(p.resolves).toBe(true);
    expect(p.fingerprint?.vendor).toBe('true_automation');
    expect(p.title).toContain('PublicAccess');
  });

  it('a dead hostname is marked NOT resolving — the defect we own', async () => {
    // Node's fetch reports every transport failure as "fetch failed" and hides the cause, which is
    // why the original diagnosis took a session. The cause chain is walked now.
    const wrapped = new Error('fetch failed');
    (wrapped as { cause?: unknown }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND esearch.wilcotx.gov'), { code: 'ENOTFOUND' },
    );
    const impl = (async () => { throw wrapped; }) as unknown as typeof fetch;

    const p = await probeHost('https://esearch.wilcotx.gov/', { fetchImpl: impl });
    expect(p.resolves).toBe(false);
    expect(p.verdict?.kind).toBe('no_such_host');
    expect(p.verdict?.retryable, 'no proxy reaches a host that does not exist').toBe(false);
  });

  it('a bot wall is reported rather than fingerprinted as content', async () => {
    const p = await probeHost('https://x.gov/', { fetchImpl: fake('Just a moment... checking your browser') });
    expect(p.verdict?.kind).toBe('bot_wall');
  });
});

describe('a discovery sweep', () => {
  it('checks DECLARED hosts first and names the dead ones', async () => {
    const impl = (async (url: string) => {
      if (String(url).includes('wilcotx')) {
        const e = new Error('fetch failed');
        (e as { cause?: unknown }).cause = new Error('getaddrinfo ENOTFOUND');
        throw e;
      }
      return {
        status: 200, ok: true,
        text: async () => '<title>PublicAccess</title> PropertyQuickRefID',
        headers: { forEach: () => {} },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await discoverCounty('Williamson', {
      declared: [{ url: 'https://esearch.wilcotx.gov/', expectVendor: 'bis' }],
      fetchImpl: impl,
      maxCandidates: 2,
    });

    expect(r.dead).toHaveLength(1);
    expect(r.nextSteps.join(' ')).toMatch(/does not resolve/i);
    expect(r.statement).toMatch(/do not resolve/i);
  });

  it('flags a vendor mismatch on a declared host', async () => {
    const impl = (async () => ({
      status: 200, ok: true,
      text: async () => '<title>PublicAccess > Home</title> PropertyQuickRefID __dnnVariable',
      headers: { forEach: () => {} },
    })) as unknown as typeof fetch;

    const r = await discoverCounty('Williamson', {
      declared: [{ url: 'https://search.wcad.org/', expectVendor: 'bis' }],
      fetchImpl: impl,
      maxCandidates: 0,
    });
    expect(r.findings[0]!.mismatch).toMatch(/true_automation/);
  });

  it('says what a PERSON still has to do', async () => {
    // A fingerprint says what the software is. It cannot say which field is a chip list, and
    // pretending otherwise is how a scraper gets written against a form nobody opened.
    const impl = (async () => ({
      status: 200, ok: true,
      text: async () => '<title>Self-Service</title> DOCSEARCH149S1',
      headers: { forEach: () => {} },
    })) as unknown as typeof fetch;

    const r = await discoverCounty('Williamson', { fetchImpl: impl, maxCandidates: 1 });
    expect(r.nextSteps.join(' ')).toMatch(/drive .* by hand/i);
  });
});
