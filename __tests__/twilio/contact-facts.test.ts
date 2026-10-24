// __tests__/twilio/contact-facts.test.ts — the receptionist gives the firm's contact details exactly.
//
// 2026-10-15: a caller whose email to info@ had bounced asked Ellie for the right address and was
// told "info at star surveying dot com. No hyphen in there." starsurveying.com accepts no mail, and
// starrsurveying.com (no hyphen) belongs to a different company. Every spoken form of the website
// had dropped the dash, and the model invented a rule to match. These tests hold the spoken forms
// to the written ones and keep the "never make it up" guardrails in every prompt.
import { describe, it, expect } from 'vitest';
import { EMAIL, SITE_URL, PHONE_DISPLAY, SPOKEN_SITE, SPOKEN_EMAIL, SPELLED_DOMAIN } from '@/lib/seo/business';
import { agentPrompt, agentKnowledgeDocs } from '@/lib/receptionist/agent-prompt';
import { systemPrompt } from '@/lib/receptionist/brain';
import { knowledgeText, WEBSITE } from '@/lib/receptionist/knowledge';
import { MACHINE_LINES } from '@/lib/receptionist/answering-machine';

// "info at starr dash surveying dot com" → "info@starr-surveying.com"
const unspeak = (s: string) => s.replace(/ at /g, '@').replace(/ dash /g, '-').replace(/ dot /g, '.').replace(/\s+/g, '');

describe('spoken contact details match the written ones', () => {
  it('the spoken email is the email', () => {
    expect(unspeak(SPOKEN_EMAIL)).toBe(EMAIL);
  });
  it('the spoken website is the website', () => {
    expect('www.' + unspeak(SPOKEN_SITE)).toBe(SITE_URL.replace(/^https?:\/\//, ''));
  });
  it('the spelling has two r\'s and the dash', () => {
    expect(SPELLED_DOMAIN).toMatch(/s, t, a, r, r/);
    expect(SPELLED_DOMAIN).toMatch(/dash/);
  });
});

describe('every prompt carries the exact contact details', () => {
  const prompts = {
    agent: agentPrompt(),
    relay: systemPrompt(),
    knowledge: knowledgeText({ prices: false, law: false }),
    agentDocs: agentKnowledgeDocs().map((d) => d.text).join('\n'),
  };
  for (const [name, p] of Object.entries(prompts)) {
    it(`${name}: says the website and email with the dash, never without`, () => {
      expect(p).not.toMatch(/starr? surveying dot com/i);
      expect(p).not.toMatch(/starsurveying|starrsurveying\.com/i);
    });
  }
  it('the agent prompt lists the phone, the email and its spelling', () => {
    const p = prompts.agent;
    expect(p).toMatch(/# Contact details/);
    expect(p).toContain(PHONE_DISPLAY);
    expect(p).toContain(EMAIL);
    expect(p).toContain(SPOKEN_EMAIL);
    expect(p).toContain(SPELLED_DOMAIN);
  });
  it('the agent is told never to invent a fix or change a contact detail', () => {
    expect(prompts.agent).toMatch(/Never make something up to solve a caller's problem/);
    expect(prompts.agent).toMatch(/never say there is no hyphen/);
    expect(prompts.agent).toMatch(/their email bounced/);
  });
  it('the relay brain has the same rule', () => {
    expect(prompts.relay).toMatch(/Contact details are fixed/);
    expect(prompts.relay).toContain(SPOKEN_EMAIL);
  });
  it('the answering machine and the website list use the spoken form', () => {
    expect(MACHINE_LINES.greeting).toContain(SPOKEN_SITE);
    expect(WEBSITE.home).toBe(SPOKEN_SITE);
  });
});
