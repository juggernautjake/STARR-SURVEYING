import { describe, it, expect } from 'vitest';
import {
  businessJsonLd,
  businessNode,
  websiteNode,
  BUSINESS_ID,
  SITE_URL,
  OFFICE_ADDRESS,
  OFFICE_ADDRESS_LINE1,
  OFFICE_ADDRESS_LINE2,
  PHONE_E164,
  SERVICE_AREA_COUNTIES,
  SERVICES,
  SERVICE_RADIUS_METERS,
} from '@/lib/seo/business';

// ── WHAT THESE TESTS ARE FOR ────────────────────────────────────────────────────────────────────
//
// Structured data fails SILENTLY. A malformed graph, a wrong domain, a stale phone number: the page
// renders identically, nothing throws, no test goes red, and the only symptom is that Google quietly
// declines to believe the site. The bug that prompted this whole file — a domain spelled three ways —
// survived for weeks for exactly that reason.
//
// So these assert the things that would be invisible if wrong.

describe('businessNode', () => {
  it('states every URL on the host the site actually serves', () => {
    // The 2026-08-25 defect, pinned. `www.starrsurveying.com` (no hyphen) does not resolve, and the
    // bare domain 301s. Any absolute URL in the graph must be the canonical host.
    const json = JSON.stringify(businessJsonLd());
    const urls = json.match(/https?:\/\/[^"]+/g) ?? [];
    const ownUrls = urls.filter((u) => u.includes('starr'));

    expect(ownUrls.length).toBeGreaterThan(0);
    for (const url of ownUrls) {
      expect(url.startsWith(`${SITE_URL}/`) || url === SITE_URL).toBe(true);
    }
  });

  it('gives the phone number in E.164, not the display format', () => {
    // `(936) 662-0077` in `telephone` is not wrong enough to break anything and not right enough to
    // be matched against the Google Business Profile listing.
    const node = businessNode();
    expect(node.telephone).toBe(PHONE_E164);
    expect(String(node.telephone)).toMatch(/^\+1/);
  });

  it('breaks the address into the parts a crawler can match, not one string', () => {
    const address = businessNode().address as Record<string, string>;
    expect(address['@type']).toBe('PostalAddress');
    expect(address.streetAddress).toBe(OFFICE_ADDRESS_LINE1);
    expect(address.addressLocality).toBe('Belton');
    expect(address.addressRegion).toBe('TX');
    expect(address.postalCode).toBe('76513');
    // And the display strings the pages render must be the same address, assembled from the same parts.
    expect(OFFICE_ADDRESS).toBe(`${OFFICE_ADDRESS_LINE1}, ${OFFICE_ADDRESS_LINE2}`);
  });

  it('does not claim Saturday hours', () => {
    // /contact says "By Appointment" for Saturday, which has no schema.org expression. Publishing any
    // Saturday specification would be a claim to be open at stated times — see the note in the source.
    const hours = businessNode().openingHoursSpecification as Array<{ dayOfWeek: string[] }>;
    const days = hours.flatMap((h) => h.dayOfWeek);
    expect(days).not.toContain('Saturday');
    expect(days).not.toContain('Sunday');
    expect(days).toContain('Monday');
    expect(days).toContain('Friday');
  });

  it('serves both a radius and the named counties', () => {
    const areas = businessNode().areaServed as Array<Record<string, unknown>>;
    const circle = areas.find((a) => a['@type'] === 'GeoCircle');
    expect(circle).toBeDefined();
    // A string, per schema.org's GeoCircle. A number here validates but is the less-supported form.
    expect(circle?.geoRadius).toBe(String(SERVICE_RADIUS_METERS));

    const counties = areas.filter((a) => a['@type'] === 'AdministrativeArea');
    expect(counties).toHaveLength(SERVICE_AREA_COUNTIES.length);
    // Bare "Bell County" is ambiguous — there are counties of that name in three states.
    for (const c of counties) {
      expect(String(c.name)).toMatch(/, Texas$/);
    }
  });

  it('offers every service under one catalog, each pointing back at this business', () => {
    const catalog = businessNode().hasOfferCatalog as { itemListElement: Array<Record<string, never>> };
    expect(catalog.itemListElement).toHaveLength(SERVICES.length);
    for (const offer of catalog.itemListElement) {
      const service = (offer as unknown as { itemOffered: Record<string, unknown> }).itemOffered;
      expect(service['@type']).toBe('Service');
      expect(service.name).toBeTruthy();
      // The back-reference is what stops each Service being read as an orphan with no provider.
      expect(service.provider).toEqual({ '@id': BUSINESS_ID });
    }
  });

  it('publishes no property with an empty or undefined value', () => {
    // An empty string in structured data is worse than an absent property: it asserts that the fact
    // is known and is nothing. This catches a constant that gets blanked later.
    const walk = (value: unknown, path: string): void => {
      if (value === undefined || value === null) throw new Error(`empty value at ${path}`);
      if (typeof value === 'string') {
        expect(value.trim(), `empty string at ${path}`).not.toBe('');
        return;
      }
      if (Array.isArray(value)) {
        expect(value.length, `empty array at ${path}`).toBeGreaterThan(0);
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${path}.${k}`);
      }
    };
    walk(businessJsonLd(), 'root');
  });
});

describe('businessJsonLd', () => {
  it('is one graph whose nodes resolve against each other', () => {
    const doc = businessJsonLd();
    expect(doc['@context']).toBe('https://schema.org');

    const graph = doc['@graph'] as Array<Record<string, unknown>>;
    const ids = new Set(graph.map((n) => n['@id']));

    // Every internal `@id` reference must name a node that is actually in the graph. A reference to a
    // node that is not there is the classic JSON-LD mistake: valid syntax, meaningless output.
    const refs: string[] = [];
    const collect = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(collect);
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o);
        if (keys.length === 1 && keys[0] === '@id') refs.push(String(o['@id']));
        else Object.values(o).forEach(collect);
      }
    };
    collect(graph);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ids.has(ref), `dangling @id reference: ${ref}`).toBe(true);
  });

  it('survives being embedded in a script tag', () => {
    // How the component writes it. If a value ever contains `</script`, the raw JSON would terminate
    // the element early and the rest would be parsed as markup.
    const escaped = JSON.stringify(businessJsonLd()).replace(/</g, '\\u003c');
    expect(escaped).not.toContain('<');
    expect(() => JSON.parse(escaped)).not.toThrow();
    expect(JSON.parse(escaped)).toEqual(businessJsonLd());
  });

  it('names the site as published by the business', () => {
    expect(websiteNode().publisher).toEqual({ '@id': BUSINESS_ID });
  });
});
