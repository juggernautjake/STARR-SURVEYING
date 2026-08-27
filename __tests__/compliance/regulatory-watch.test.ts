// __tests__/compliance/regulatory-watch.test.ts
//
// §I3.5. The assertions that matter are rejections and one distinction.
//
// REJECTIONS, because searching "TBPELS rule change" returns a wall of continuing-education
// marketing — the CE providers sell rule-change courses, so their pages name the board, use every
// change word, and announce nothing. A compliance alert that fires on a seminar advert is muted
// within a fortnight, and a muted compliance alert is worse than none.
//
// THE DISTINCTION, because on this surface "we checked and nothing changed" and "we never checked"
// are opposite facts that produce an identical empty list. Everywhere else in this codebase that
// collapse has been a bug; here it would be a bug about a licence.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  regulatoryProfile,
  regulatoryQueries,
  regulatoryTopics,
  runRegulatoryWatch,
  type RegulatoryTopic,
} from '@/lib/compliance/regulatory-watch';
import { classifyAnnouncement } from '@/lib/research/announcement-watch';

const NOW = 2026;
const ALL: RegulatoryTopic[] = ['tbpels', 'flood-maps', 'recording-fees'];

const tavily = (results: Array<Record<string, unknown>>) =>
  async () => new Response(JSON.stringify({ results }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

const hit = (over: Partial<{ url: string; title: string; content: string; score: number; authority: number }> = {}) => ({
  url: 'https://www.tbpels.texas.gov/notice',
  title: 'Notice',
  content: 'Text.',
  score: 0.85,
  authority: 1.0,
  ...over,
});

describe('the topics are real and self-describing', () => {
  it('lists every topic with a reason it is watched', () => {
    const topics = regulatoryTopics();
    expect(topics.map((t) => t.id).sort()).toEqual([...ALL].sort());
    for (const t of topics) {
      expect(t.label.length).toBeGreaterThan(3);
      // A watch nobody can explain is a watch nobody maintains.
      expect(t.why.length).toBeGreaterThan(30);
    }
  });

  it('every query carries a rationale', () => {
    for (const topic of ALL) {
      const qs = regulatoryQueries(topic);
      expect(qs.length, topic).toBeGreaterThan(1);
      for (const q of qs) expect(q.rationale.length, topic).toBeGreaterThan(20);
    }
  });
});

describe('what it refuses to promote', () => {
  it('never calls a continuing-education advert "likely"', () => {
    // The single most common false positive here: a CE provider selling a course ABOUT the rule
    // change. Names the board, uses every change word, and is an advert.
    const h = classifyAnnouncement(hit({
      url: 'https://www.pdhacademy.com/courses/tbpels-rule-update',
      title: 'TBPELS rule amendment 2026 — new rule effective, earn your CE hours',
      content: 'The Texas Board of Professional Engineers and Land Surveyors adopted an amendment effective 2026. Enroll today.',
      authority: 0.2,
    }), regulatoryProfile('tbpels'), { currentYear: NOW });

    expect(h.verdict).not.toBe('likely');
    expect(h.reasons).toContain('vendor marketing — demoted');
  });

  it('rejects a board page that is merely describing the rules that exist', () => {
    // "Rules", "requirements", "licensing" is what a board page says every day of its life. If this
    // scored, the watch would fire forever.
    const h = classifyAnnouncement(hit({
      title: 'Rules and Requirements for Professional Land Surveyors',
      content: 'Licensing requirements, seal requirements and continuing education for surveyors in Texas.',
    }), regulatoryProfile('tbpels'), { currentYear: NOW });

    expect(h.verdict).toBe('noise');
  });

  it('rejects a rule change that is not about our subject', () => {
    const h = classifyAnnouncement(hit({
      url: 'https://www.tdlr.texas.gov/notice',
      title: 'Cosmetology rule amendment adopted effective March 1, 2026',
      content: 'The department adopted an amendment to its rules effective March 1, 2026.',
    }), regulatoryProfile('tbpels'), { currentYear: NOW });

    expect(h.verdict).toBe('noise');
  });

  it('drops results the search itself scored as barely relevant', () => {
    const h = classifyAnnouncement(hit({
      title: 'TBPELS rule amendment adopted effective January 1, 2026',
      content: 'The Texas Board of Professional Engineers and Land Surveyors adopted an amendment.',
      score: 0.1,
    }), regulatoryProfile('tbpels'), { currentYear: NOW });
    expect(h.verdict).toBe('noise');
  });
});

describe('what it does promote', () => {
  it('rates a real adopted amendment "likely"', () => {
    const h = classifyAnnouncement(hit({
      title: 'TBPELS — Notice of adopted rule amendment',
      content: 'The Texas Board of Professional Engineers and Land Surveyors adopted an amendment to 22 TAC Chapter 663, effective January 1, 2026.',
    }), regulatoryProfile('tbpels'), { currentYear: NOW });

    expect(h.verdict).toBe('likely');
    expect(h.excerpt).toMatch(/adopted an amendment/);
    expect(h.reasons).toContain('rule-change language');
  });

  it('finds the subject by any of the names it goes under', () => {
    // A Texas Register notice may cite the chapter without naming the board, and vice versa.
    // Requiring one exact string would reject most genuine hits.
    const byChapter = classifyAnnouncement(hit({
      title: 'Texas Register — 22 TAC 663 amendment adopted effective March 2026',
      content: 'Amendments to 22 TAC Chapter 663 are adopted, effective March 2026.',
    }), regulatoryProfile('tbpels'), { currentYear: NOW });
    expect(byChapter.verdict).toBe('likely');
  });

  it('does NOT demote an old rule for age the way a portal migration is demoted', () => {
    // A rule adopted in 2021 is still the rule. Portal migrations go stale in two years because the
    // portal has already moved; regulations do not work that way, and demoting them for age would
    // throw away the answer.
    const h = classifyAnnouncement(hit({
      title: 'TBPELS — adopted rule amendment',
      content: 'The Board adopted an amendment to 22 TAC Chapter 663 effective September 1, 2021.',
    }), regulatoryProfile('tbpels'), { currentYear: NOW });

    expect(h.verdict).toBe('likely');
    expect(h.reasons.join(' ')).not.toMatch(/stale/);
  });

  it('flood maps and fees each recognise their own subject', () => {
    const flood = classifyAnnouncement(hit({
      url: 'https://www.fema.gov/notice',
      title: 'Letter of Map Revision — effective June 2026',
      content: 'FEMA has issued a revision to the flood insurance rate map, effective June 2026.',
    }), regulatoryProfile('flood-maps'), { currentYear: NOW });
    expect(flood.verdict).toBe('likely');

    const fees = classifyAnnouncement(hit({
      url: 'https://www.bellcountytx.gov/clerk/fees',
      title: 'County Clerk fee schedule — new fees effective October 1, 2026',
      content: 'The county clerk recording fee schedule increased, effective October 1, 2026.',
    }), regulatoryProfile('recording-fees'), { currentYear: NOW });
    expect(fees.verdict).toBe('likely');
  });
});

describe('the four states of "nothing"', () => {
  it('separates "no key" from "checked and nothing changed"', async () => {
    const unset = await runRegulatoryWatch('tbpels', { apiKey: '', fetchImpl: tavily([]) });
    const quiet = await runRegulatoryWatch('tbpels', { apiKey: 'k', fetchImpl: tavily([]) });

    // On a compliance surface this is the assertion that matters most.
    expect(unset.status).toBe('not-configured');
    expect(unset.report).toBeNull();
    expect(quiet.status).toBe('searched');
    expect(quiet.report?.hits).toHaveLength(0);
    expect(unset.status).not.toBe(quiet.status);
  });

  it('reports an outage as an outage', async () => {
    const down = await runRegulatoryWatch('flood-maps', {
      apiKey: 'k', fetchImpl: async () => new Response('', { status: 503 }),
    });
    expect(down.status).toBe('search-failed');
  });

  it('logs a line per query so a silent check is still auditable', async () => {
    const run = await runRegulatoryWatch('tbpels', { apiKey: 'k', fetchImpl: tavily([]) });
    expect(run.steps).toHaveLength(regulatoryQueries('tbpels').length);
    for (const s of run.steps) expect(s).toMatch(/^\[reg-watch\]/);
  });
});

describe('it is reachable, admin-gated, and cannot write', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const route = read('app/api/admin/compliance/regulatory-watch/route.ts');
  const panel = read('app/admin/jobs/_tabs/RegulatoryWatchPanel.tsx');
  const tab = read('app/admin/jobs/_tabs/ComplianceTab.tsx');

  it('a route runs it', () => {
    expect(route).toContain("from '@/lib/compliance/regulatory-watch'");
    expect(route).toContain('runRegulatoryWatch(');
  });

  it('is admin-gated — the sibling compliance route once leaked the whole register', () => {
    expect(route).toContain('isAdmin(session.user.roles)');
    expect(route).toContain('{ status: 403 }');
    expect(route).toContain('{ status: 401 }');
  });

  it('is read-only — a search result must not change what we believe about our own licence', () => {
    expect(route).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(route).not.toContain('export const POST');
    expect(route).not.toContain('export const PATCH');
  });

  it('a panel calls the route and the compliance tab mounts the panel', () => {
    expect(panel).toContain('/api/admin/compliance/regulatory-watch');
    expect(tab).toContain("import RegulatoryWatchPanel from './RegulatoryWatchPanel'");
    expect(tab).toContain('<RegulatoryWatchPanel />');
  });

  it('the panel branches on status, not on hit count', () => {
    expect(panel).toContain('STATUS_COPY');
    expect(panel).toContain("run.status === 'searched'");
    expect(panel).toMatch(/blank, not an all-clear/);
  });

  it('only the topic list loads on mount — the searches wait for a click', () => {
    // Three topics × 2-3 searches on every tab open would bill continuously to answer a question
    // nobody asked that morning.
    expect(panel).toMatch(/useEffect[\s\S]{0,400}regulatory-watch'\)/);
    expect(panel).toContain('data-testid={`reg-watch-check-');
  });
});

describe('the shared core now has the second consumer it was extracted for', () => {
  it('both watches are profiles over announcement-watch, and neither re-implements it', () => {
    const core = readFileSync(join(process.cwd(), 'lib/research/announcement-watch.ts'), 'utf8');
    const portal = readFileSync(join(process.cwd(), 'lib/research/portal-watch.ts'), 'utf8');
    const reg = readFileSync(join(process.cwd(), 'lib/compliance/regulatory-watch.ts'), 'utf8');

    for (const [name, src] of [['portal', portal], ['regulatory', reg]] as const) {
      expect(src, name).toContain("from '@/lib/research/announcement-watch'");
      expect(src, name).not.toContain('api.tavily.com');
      // The classification lives in one place. A second copy would drift within a month.
      expect(src, name).not.toContain('function classifyAnnouncement');
    }
    expect(core).toContain('export function classifyAnnouncement');
  });

  it('the two profiles differ where they should and agree where they should', () => {
    const reg = regulatoryProfile('tbpels');
    // Rules stay in force far longer than a portal migration stays interesting.
    expect(reg.staleAfterYears).toBeGreaterThan(5);
    expect(reg.logPrefix).toBe('[reg-watch]');
    expect(reg.changeLabel).toBe('rule-change');
    expect(reg.sellerHosts.length).toBeGreaterThan(5);
  });
});
