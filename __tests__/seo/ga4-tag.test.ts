import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── WHAT IS PINNED HERE ─────────────────────────────────────────────────────────────────────────
//
// The GA4 half of the tag is controlled by one environment variable, and BOTH of its states have to
// be right: unset must be a silent no-op (the state the site ships in until the owner creates the
// property), and a value that is not a GA4 measurement id must be refused rather than used.
//
// The refusal matters because of how it would fail otherwise. Pasting the Ads id (`AW-…`) into the
// GA4 variable is the obvious mistake, and `gtag` does not complain about an unknown destination — it
// accepts the event and drops it. There would be no error, no warning and no data: the owner would
// simply see an empty property and have nothing to look at to explain why.

async function loadTag(id?: string) {
  vi.resetModules();
  if (id === undefined) vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', '');
  else vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', id);
  return import('@/app/utils/gtag');
}

describe('GA4 measurement id', () => {
  const gtag = vi.fn();

  beforeEach(() => {
    gtag.mockClear();
    vi.stubGlobal('window', { gtag });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is disabled when the variable is unset — the shipped default', async () => {
    const tag = await loadTag();
    expect(tag.GA4_MEASUREMENT_ID).toBe('');
    expect(tag.ga4Enabled()).toBe(false);
  });

  it('refuses an Ads id pasted into the GA4 variable', async () => {
    const tag = await loadTag('AW-17921491739');
    expect(tag.GA4_MEASUREMENT_ID).toBe('');
    expect(tag.ga4Enabled()).toBe(false);
  });

  it('accepts a real measurement id, whitespace and all', async () => {
    const tag = await loadTag('  G-ABC1234XYZ  ');
    expect(tag.GA4_MEASUREMENT_ID).toBe('G-ABC1234XYZ');
    expect(tag.ga4Enabled()).toBe(true);
  });
});

describe('event routing', () => {
  const gtag = vi.fn();

  beforeEach(() => {
    gtag.mockClear();
    vi.stubGlobal('window', { gtag });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends nothing to GA4 while it is unconfigured, but still fires the Ads conversion', async () => {
    const tag = await loadTag();
    tag.trackConversion('SS-1234', 'home_page');

    // Exactly one send, and it is the Ads one. If GA4 leaked an event here it would be arriving at a
    // property that does not exist, from a site that reports itself as having no analytics.
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag.mock.calls[0][2]).toMatchObject({ send_to: tag.CONVERSION_LABEL });
  });

  it('names a destination on EVERY send once both are configured', async () => {
    const tag = await loadTag('G-ABC1234XYZ');
    tag.trackConversion('SS-1234', 'home_page');
    tag.trackPhoneClick('tel-9366620077-abc');
    tag.trackEvent('quote_calculated', 'engagement');

    // 5 = trackConversion (Ads + GA4) + trackPhoneClick (Ads + GA4) + trackEvent (GA4 only).
    expect(gtag).toHaveBeenCalledTimes(5);
    for (const call of gtag.mock.calls) {
      // The rule the whole design turns on: with two destinations configured, an event with no
      // `send_to` is delivered to BOTH. An Ads account would then receive events named
      // "quote_calculated", and GA4 would receive one named "conversion".
      expect(call[2]).toHaveProperty('send_to');
      expect([tag.CONVERSION_LABEL, tag.PHONE_CLICK_LABEL, tag.GA4_MEASUREMENT_ID]).toContain(
        (call[2] as { send_to: string }).send_to,
      );
    }
  });

  it('tells GA4 which of the three forms produced the lead', async () => {
    const tag = await loadTag('G-ABC1234XYZ');
    tag.trackConversion('SS-1234', 'contact_page');

    const ga4Call = gtag.mock.calls.find(
      (c) => (c[2] as { send_to: string }).send_to === 'G-ABC1234XYZ',
    );
    // The Ads account cannot distinguish the three intake surfaces — all three fire one label. This
    // parameter is the only place that distinction is recorded anywhere.
    expect(ga4Call?.[1]).toBe('generate_lead');
    expect(ga4Call?.[2]).toMatchObject({ form_name: 'contact_page', transaction_id: 'SS-1234' });
  });
});
