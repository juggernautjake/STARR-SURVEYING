// The receptionist's script, knowledge, quoting, and analysis — the parts that must hold without a
// phone.
//
// Owner, 2026-09-11: "the voice agent isn't locking us into decisions or giving answers to
// circumstantial questions … the AI should not just say 'we don't service that area' … I don't
// have an issue with the AI attempting to give quotes … but it should use the formula from the
// website … and it should firmly tell the customer and reiterate that any quote that it gives is
// subject to change once a live representative has reviewed the query information."
import { describe, it, expect } from 'vitest';
import { systemPrompt, parseEnvelope } from '@/lib/receptionist/brain';
import { knowledgeText, SERVICES, FAQ } from '@/lib/receptionist/knowledge';
import { quoteFor, sizeBucket, cornersBucket, QUOTE_DISCLAIMER } from '@/lib/receptionist/quote';
import { parseAnalysis, transcriptText } from '@/lib/receptionist/analysis';
import { SURVEY_TYPES } from '@/app/components/surveyConfigs';

describe('the script does not lock the firm in', () => {
  const p = systemPrompt();
  it('says "normally … but" instead of a flat no, and names the exception for bigger jobs', () => {
    expect(p).toMatch(/Never say a flat "no"/);
    expect(p).toMatch(/may be able to make an exception/);
    expect(p).toMatch(/travels much farther for larger projects/i);
  });
  it('never commits the firm, never invents facts, never takes payment', () => {
    expect(p).toMatch(/Never commit the firm/);
    expect(p).toMatch(/no scheduling, no dates/);
    expect(p).toMatch(/Never invent a fact/);
    expect(p).toMatch(/Never take payment/);
    expect(p).toMatch(/no legal opinions/);
  });
  it('quotes only through the calculator, with the disclaimer before and after', () => {
    expect(p).toMatch(/ONLY after you have/);
    expect(p).toMatch(/subject to change once a live representative reviews/);
    expect(p).toMatch(/"quote": \{"service"/);
  });
  it('is honest about being automated and knows the firm’s facts from the website', () => {
    expect(p).toMatch(/automated assistant/);
    expect(p).toContain('Belton');
    expect(p).toContain('833');
    for (const s of SERVICES) expect(p).toContain(s.name);
    expect(FAQ.length).toBeGreaterThanOrEqual(8);
    expect(knowledgeText()).toMatch(/happy to discuss areas outside our primary coverage/);
  });
});

describe('phone quotes reuse the website calculator', () => {
  it('maps acres and corners onto the calculator’s buckets', () => {
    expect(sizeBucket(0.2)).toBe('0.1');
    expect(sizeBucket(1)).toBe('1.5');
    expect(sizeBucket(3)).toBe('3.5');
    expect(sizeBucket(500)).toBe('200');
    expect(cornersBucket(4)).toBe('4');
    expect(cornersBucket(8)).toBe('7');
    expect(cornersBucket(20)).toBe('15');
  });
  it('a one-acre rural boundary quote is a sane range from the real formula, with the disclaimer', () => {
    const q = quoteFor({ service: 'boundary', acres: 1, propertyType: 'residential_rural', corners: 4, hasResidence: true, purpose: 'fence', milesFromBelton: 15 });
    expect(q).not.toBeNull();
    expect(q!.low).toBeGreaterThanOrEqual(400);
    expect(q!.high).toBeGreaterThan(q!.low);
    expect(q!.high).toBeLessThan(6000);
    expect(q!.spoken).toContain(QUOTE_DISCLAIMER);
    expect(q!.spoken).toMatch(/final price can change/);
    // What the caller could not answer is named, so Hank knows what the number assumed.
    expect(q!.assumed.join(' ')).toMatch(/vegetation|terrain/);
  });
  it('matches the website: same inputs through SURVEY_TYPES give a price inside the phone range', () => {
    const cfg = SURVEY_TYPES.find((t) => t.id === 'boundary')!;
    const v: Record<string, string> = {};
    for (const f of cfg.fields) v[f.id] = f.type === 'number' ? '15' : (f.options?.find((o) => o.value === 'unknown')?.value ?? f.options?.find((o) => ['none', 'no', '0'].includes(o.value))?.value ?? f.options?.[Math.floor((f.options?.length ?? 0) / 2)]?.value ?? '');
    Object.assign(v, { acreage: '0.75', propertyType: 'residential_rural', corners: '4', hasResidence: 'yes', purpose: 'fence', travelDistance: '15' });
    const site = Math.max(cfg.calculatePrice(v), cfg.minPrice);
    const q = quoteFor({ service: 'boundary', acres: 1, propertyType: 'residential_rural', corners: 4, hasResidence: true, purpose: 'fence', milesFromBelton: 15 })!;
    expect(site).toBeGreaterThanOrEqual(q.low);
    expect(site).toBeLessThanOrEqual(q.high);
  });
  it('rush adds 25 percent; an unknown service quotes nothing', () => {
    const base = quoteFor({ service: 'elevation', acres: 0.5 })!;
    const rush = quoteFor({ service: 'elevation', acres: 0.5, rush: true })!;
    expect(rush.high).toBeGreaterThan(base.high);
    expect(quoteFor({ service: 'palm-reading' })).toBeNull();
  });
  it('the envelope carries a quote request only when it is well-formed', () => {
    expect(parseEnvelope('{"say":"ok","quote":{"service":"boundary","acres":2}}')?.quote?.service).toBe('boundary');
    expect(parseEnvelope('{"say":"ok","quote":"cheap"}')?.quote).toBeUndefined();
  });
});

describe('call analysis parsing', () => {
  it('reads a well-formed analysis and clamps enums', () => {
    const a = parseAnalysis('{"summary":"Jane wants a boundary survey.","caller_type":"customer","intent":"boundary survey","urgency":"silly","sentiment":"positive","action_items":["Call Jane back"],"follow_up":"Hank today","suggested_project":{"name":"Boundary - 1 Main St"}}');
    expect(a?.caller_type).toBe('customer');
    expect(a?.urgency).toBe('normal');
    expect(a?.action_items).toEqual(['Call Jane back']);
    expect(a?.suggested_project?.name).toBe('Boundary - 1 Main St');
    expect(parseAnalysis('nope')).toBeNull();
  });
  it('renders a transcript with the right speakers', () => {
    const t = transcriptText([{ role: 'caller', text: 'hi' }, { role: 'assistant', text: 'hello' }, { role: 'owner', text: 'this is Hank' }], 'call me back');
    expect(t).toBe('Caller: hi\nReceptionist: hello\nHank: this is Hank\nVoicemail (transcribed): call me back');
  });
});
