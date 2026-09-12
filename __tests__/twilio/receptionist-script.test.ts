// The receptionist's script, knowledge, quoting, and analysis — the parts that must hold without a
// phone.
//
// Owner, 2026-09-11: "the voice agent isn't locking us into decisions or giving answers to
// circumstantial questions … the AI should not just say 'we don't service that area' … I don't
// have an issue with the AI attempting to give quotes … but it should use the formula from the
// website … and it should firmly tell the customer and reiterate that any quote that it gives is
// subject to change once a live representative has reviewed the query information."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { systemPrompt, parseEnvelope } from '@/lib/receptionist/brain';
import { knowledgeText, hoursSentence, SERVICES, FAQ, LAND_LAW, LAW_RESOURCES, LAW_DISCLAIMER } from '@/lib/receptionist/knowledge';
import { OPENING_HOURS } from '@/lib/seo/business';
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

describe('the receptionist can explain the work and the process', () => {
  const p = systemPrompt();
  it('every service says what it is, when it is needed, what is delivered, and how long the field work runs', () => {
    for (const s of SERVICES) {
      expect(s.what.length).toBeGreaterThan(40);
      expect(s.when.length).toBeGreaterThan(20);
      expect(s.deliverable.length).toBeGreaterThan(20);
      expect(s.field.length).toBeGreaterThan(20);
    }
    expect(SERVICES.map((s) => s.id)).toContain('boundary_improvements');
  });
  it('knows the job process in the owner’s order and the price-change conditions', () => {
    const k = knowledgeText();
    for (const step of ['Consultation', 'Quote', 'Acceptance', 'Research and planning', 'Field work', 'Processing', 'Deliverables']) expect(k).toContain(step);
    expect(k).toMatch(/one or more days/);
    expect(k).toMatch(/more adverse than understood/);
    expect(k).toMatch(/Rush jobs usually carry an extra fee/);
    expect(k).toMatch(/long-distance jobs usually carry a travel fee/);
    expect(p).toMatch(/EXPLAINING THE WORK/);
    expect(p).toMatch(/boundary and improvements survey rather than a bare boundary/);
  });
});

describe('Boundary & Improvements is a real survey type everywhere a customer can pick one', () => {
  it('is in the calculator, priced above a plain boundary survey for the same lot', () => {
    const bi = SURVEY_TYPES.find((t) => t.id === 'boundary_improvements');
    expect(bi?.name).toBe('Boundary & Improvements Survey');
    const b = quoteFor({ service: 'boundary', acres: 0.5, propertyType: 'residential_urban', corners: 4, hasResidence: true, purpose: 'sale', milesFromBelton: 10 })!;
    const q = quoteFor({ service: 'boundary_improvements', acres: 0.5, propertyType: 'residential_urban', corners: 4, hasResidence: true, purpose: 'sale', milesFromBelton: 10 })!;
    expect(q.low).toBeGreaterThan(b.low);
    expect(q.spoken).toContain(QUOTE_DISCLAIMER);
  });
  it('is offered on the contact form, the home page form, the pricing page, the resources page, and the schema.org services', () => {
    for (const f of ['app/contact/page.tsx', 'app/page.tsx', 'app/pricing/page.tsx', 'app/resources/page.tsx', 'lib/seo/business.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('Boundary & Improvements Survey');
    }
  });
});

describe('land-law questions: correct, simple, sourced, and never advice', () => {
  const p = systemPrompt();
  const k = knowledgeText();
  it('carries the disclaimer, says it once, and never picks a side', () => {
    expect(p).toContain(LAW_DISCLAIMER);
    expect(LAW_DISCLAIMER).toMatch(/not legal advice/);
    expect(LAW_DISCLAIMER).toMatch(/laws and rules change/);
    expect(p).toMatch(/Say it once, not every turn/);
    expect(p).toMatch(/Never tell a caller who is right/);
  });
  it('covers the topics the owner named, each with a source', () => {
    for (const t of ['Encroachments', 'Adverse possession', 'Fences', 'Easements', 'Setbacks', 'Dividing land', 'Surveys at closing', 'Corner markers', 'Water boundaries', 'Flood zones', 'Finding records', 'Who may survey']) {
      expect(LAND_LAW.map((l) => l.topic).join('\n'), t).toMatch(new RegExp(t));
    }
    for (const l of LAND_LAW) expect(l.source.length, l.topic).toBeGreaterThan(20);
    expect(k).toMatch(/Occupations Code Chapter 1071/);
    expect(k).toMatch(/Local Government Code Chapter 212/);
    expect(k).toMatch(/Civil Practice and Remedies Code Chapter 16/);
    expect(k).toMatch(/Agriculture Code Chapter 143/);
    expect(k).toMatch(/T-47/);
  });
  it('handles the neighbor’s-shed case the way the owner described', () => {
    expect(p).toMatch(/where the line really is comes first/);
    expect(p).toMatch(/usually doesn't need a full boundary survey/);
    expect(p).toMatch(/usually costs less than most jobs/);
    expect(p).toMatch(/missing corners, conflicting deeds, a creek line, or a court-ready exhibit/);
    expect(k).toMatch(/A surveyor cannot decide who owns what/);
  });
  it('names online resources in a speakable form', () => {
    expect(LAW_RESOURCES.length).toBeGreaterThanOrEqual(6);
    expect(k).toContain('pels dot texas dot gov');
    expect(k).toContain('m s c dot fema dot gov');
    expect(k).toContain('texas law help dot org');
  });
});

describe('website pointers, the callback promise, and the hours', () => {
  const p = systemPrompt();
  it('sends callers to the request form, the calculator, resources, and invoice payment', () => {
    for (const s of ['request form', 'calculator', 'resources page', 'invoice']) expect(p).toContain(s);
    expect(p).toMatch(/starr surveying dot com/);
  });
  it('promises Hank will get back as soon as possible, never a specific time', () => {
    expect(p).toMatch(/try to get back to them as soon as possible/);
    expect(p).toMatch(/Do not promise a time/);
  });
  it('reads the hours from the same constants the Google listing is built from', () => {
    const h = OPENING_HOURS[0]!;
    const sentence = hoursSentence();
    expect(sentence).toContain(h.days[0]!);
    expect(p).toContain(sentence);
    expect(p).toMatch(/exactly the ones on the Google listing/);
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
