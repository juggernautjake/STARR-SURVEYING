// The receptionist's script, knowledge, quoting, and analysis — the parts that must hold without a
// phone.
//
// Owner, 2026-09-11: "the voice agent isn't locking us into decisions or giving answers to
// circumstantial questions … the AI should not just say 'we don't service that area'."
//
// Owner, 2026-09-16, after hearing the first real calls: "I don't want to offer quotes anymore at
// all with the AI agent … only Hank can give official quotes … It doesn't need to know all of the
// legal stuff and clutter down the conversation." The quoting and land-law suites that used to sit
// in this file went with the modules they tested; what is left guards the promise that no price and
// no legal opinion can reach a caller.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { systemPrompt, parseEnvelope } from '@/lib/receptionist/brain';
import { knowledgeText, hoursSentence, SERVICES, FAQ, LAND_LAW, LAW_DISCLAIMER } from '@/lib/receptionist/knowledge';
import { OPENING_HOURS } from '@/lib/seo/business';
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
  // Owner, 2026-09-16: "I don't want to offer quotes anymore at all with the AI agent … only Hank
  // can give official quotes and … he will be able to give them a quote when he calls them back."
  it('gives no price of any kind, and hands every price question to Hank', () => {
    expect(p).toMatch(/PRICES: YOU DO NOT GIVE THEM/);
    expect(p).toMatch(/only Hank gives official quotes/);
    expect(p).toMatch(/You have no prices and no estimates of any kind/);
    expect(p).toMatch(/asks for a ballpark/);
    expect(p, 'nothing with a dollar figure survives in the prompt').not.toMatch(/\$\s?\d/);
    expect(p, 'nor the rush percentage').not.toMatch(/25 percent/);
    expect(p, 'and the envelope cannot carry one').not.toMatch(/"quote": \{"service"/);
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
  it('is in the website calculator, priced above a plain boundary survey for the same lot', () => {
    const bi = SURVEY_TYPES.find((t) => t.id === 'boundary_improvements');
    expect(bi?.name).toBe('Boundary & Improvements Survey');
    // The receptionist's own estimator is gone (2026-09-16); the website's calculator is the only
    // one left, and it still has to price the fuller survey above the bare one for the same lot.
    const plain = SURVEY_TYPES.find((t) => t.id === 'boundary')!;
    const lot: Record<string, string> = { acreage: '0.5', propertyType: 'residential_urban', corners: '4', hasResidence: 'yes', purpose: 'sale', travelDistance: '10' };
    const price = (t: typeof plain) => {
      const v: Record<string, string> = {};
      for (const f of t.fields) v[f.id] = f.type === 'number' ? '10' : (f.options?.find((o) => o.value === 'unknown')?.value ?? f.options?.[0]?.value ?? '');
      Object.assign(v, lot);
      return Math.max(t.calculatePrice(v), t.minPrice);
    };
    expect(price(bi!)).toBeGreaterThan(price(plain));
  });
  it('is offered on the contact form, the home page form, the pricing page, the resources page, and the schema.org services', () => {
    for (const f of ['app/contact/page.tsx', 'app/page.tsx', 'app/pricing/page.tsx', 'app/resources/page.tsx', 'lib/seo/business.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('Boundary & Improvements Survey');
    }
  });
});

describe('website pointers, the callback promise, and the hours', () => {
  const p = systemPrompt();
  // The estimate calculator is off the list as of 2026-09-16: a receptionist that may not give a
  // price may not send the caller somewhere to get one either. Everything else still stands.
  it('sends callers to the request form, resources, and invoice payment — but never to a price', () => {
    for (const s of ['request form', 'resources page', 'invoice']) expect(p).toContain(s);
    expect(p).not.toContain('calculator');
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

describe('call analysis parsing', () => {
  it('reads a well-formed analysis and clamps enums', () => {
    const a = parseAnalysis('{"summary":"Jane wants a boundary survey.","caller_type":"customer","intent":"boundary survey","urgency":"silly","sentiment":"positive","action_items":["Call Jane back"],"follow_up":"Hank today","suggested_project":{"name":"Boundary - 1 Main St"}}');
    expect(a?.caller_type).toBe('customer');
    expect(a?.urgency).toBe('normal');
    expect(a?.action_items).toEqual(['Call Jane back']);
    expect(a?.suggested_project?.name).toBe('Boundary - 1 Main St');
    expect(parseAnalysis('nope')).toBeNull();
  });
  it('reads the contact block, normalising the phone and email and dropping empties', () => {
    const a = parseAnalysis('{"summary":"s","contact":{"name":"Bob Jones","phone":"254 555 0199","email":"Bob at example dot com","address":null,"property_id":"123456","acres":"about 5","service":null}}');
    expect(a?.contact).toEqual({ name: 'Bob Jones', phone: '+12545550199', email: 'bob@example.com', address: null, property_id: '123456', acres: 5, service: null });
    expect(parseAnalysis('{"summary":"s","contact":{"name":null,"phone":"123"}}')?.contact).toBeNull();
  });
  it('renders a transcript with the right speakers', () => {
    const t = transcriptText([{ role: 'caller', text: 'hi' }, { role: 'assistant', text: 'hello' }, { role: 'owner', text: 'this is Hank' }], 'call me back');
    expect(t).toBe('Caller: hi\nReceptionist: hello\nHank: this is Hank\nVoicemail (transcribed): call me back');
  });
});
