// The AI design review (P6-17).
//
// The owner's ask: *"Once the user saves it, the AI will evaluate the build and write up an assessment."*
//
// The thing worth pinning is the BOUNDARY. An assessment is an opinion on someone's creative work, so it
// must never gate a save, alter a value, or mark a piece invalid — the moment it can, an author is arguing
// with a model about their own homebrew, which is the opposite of "full control over every aspect".
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeAssessment, assessmentUserPrompt, isAssessmentStale, ASSESSMENT_SYSTEM_PROMPT, ASSESSMENT_LABELS,
} from '@/lib/dnd/homebrew/assess';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/homebrew/[id]/assess/route.ts');
const panel = read('app/dnd/_ui/AssessmentPanel.tsx');

const piece = (over: Partial<HomebrewContent> = {}): HomebrewContent => ({
  id: 'hb-1', kind: 'feat', name: 'Iron Jaw', system: 'dnd5e-2024',
  creator: { name: 'Jacob' }, status: 'draft', ...over,
});

describe('normalizeAssessment', () => {
  it('reads a well-formed review', () => {
    const a = normalizeAssessment({
      verdict: 'solid', summary: 'A clean feat.', strengths: ['tight'], concerns: [], gaps: ['no prereq'],
    })!;
    expect(a.verdict).toBe('solid');
    expect(a.gaps).toEqual(['no prereq']);
  });

  it('returns null without a summary — a half-parsed review is worse than none', () => {
    // It would be shown to the author as a considered opinion.
    expect(normalizeAssessment({ verdict: 'solid', strengths: ['x'] })).toBeNull();
    expect(normalizeAssessment({ summary: '   ' })).toBeNull();
    expect(normalizeAssessment(null)).toBeNull();
    expect(normalizeAssessment('nope')).toBeNull();
  });

  it('falls back to "watch" on an unknown verdict rather than dropping the review', () => {
    expect(normalizeAssessment({ summary: 'ok', verdict: 'amazing' })!.verdict).toBe('watch');
  });

  it('drops blank entries and caps each list', () => {
    const a = normalizeAssessment({
      summary: 'ok', strengths: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f'],
    })!;
    expect(a.strengths).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('every verdict has a human label', () => {
    for (const v of ['solid', 'watch', 'rough'] as const) {
      expect(ASSESSMENT_LABELS[v].length).toBeGreaterThan(3);
    }
  });
});

describe('the prompt is written to help, not to gatekeep', () => {
  it('says so explicitly', () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).toMatch(/not to gatekeep/i);
    expect(ASSESSMENT_SYSTEM_PROMPT).toMatch(/never tell them the content is not allowed/i);
  });

  it('forbids inventing a comparison it cannot make — Ground Rule 3 applied to a reviewer', () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).toMatch(/rather than inventing a comparison/i);
  });

  it('and asks for observations rather than commands', () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).toMatch(/not commands/i);
  });

  it('uses a word, not a score — a number invites optimising for it', () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).not.toMatch(/out of (ten|10)|score/i);
  });
});

describe('the prompt carries the context that changes what a fair review looks like', () => {
  it('tells the model a partial build is a supported state, not a flaw', () => {
    const p = assessmentUserPrompt(piece({ kind: 'class' }), { partialToLevel: 5 });
    expect(p).toMatch(/PARTIAL build/);
    expect(p).toMatch(/do not treat the missing levels as a flaw/i);
  });

  it('says nothing about partials for a completed class', () => {
    expect(assessmentUserPrompt(piece({ kind: 'class' }), { partialToLevel: 20 })).not.toMatch(/PARTIAL/);
  });

  it('tells it not to report a missing payload for a prose-only kind', () => {
    // Otherwise the review reliably calls "no mechanics" a gap on content that correctly has none.
    const p = assessmentUserPrompt(piece({ kind: 'rule', system: 'dnd5e-2024' }));
    expect(p).toMatch(/Do not report the absence of a mechanical payload as a gap/i);
  });

  it('sends the payload as JSON rather than describing it', () => {
    // A summary of a payload is where a reviewer's misreading would come from.
    const p = assessmentUserPrompt(piece({ payload: { effects: [{ target: 'str_score', operation: 'add', value: 2 }] } }));
    expect(p).toContain('Mechanical payload (JSON)');
    expect(p).toContain('str_score');
  });
});

describe('staleness', () => {
  it('flags a review written before the last edit', () => {
    const a = normalizeAssessment({ summary: 'ok', assessedAt: '2026-07-28T10:00:00Z' });
    expect(isAssessmentStale(a, '2026-07-28T12:00:00Z')).toBe(true);
  });

  it('and does not flag one written after it', () => {
    const a = normalizeAssessment({ summary: 'ok', assessedAt: '2026-07-28T12:00:00Z' });
    expect(isAssessmentStale(a, '2026-07-28T10:00:00Z')).toBe(false);
  });

  it('says nothing when either timestamp is missing', () => {
    expect(isAssessmentStale(normalizeAssessment({ summary: 'ok' }), '2026-07-28T12:00:00Z')).toBe(false);
    expect(isAssessmentStale(null, '2026-07-28T12:00:00Z')).toBe(false);
  });
});

describe('the route keeps the assessment advisory', () => {
  it('is a SEPARATE call, not part of the save', () => {
    // A model call on the save path makes saving slow and makes it fail when the model does — against the
    // Studio's whole promise that an unfinished piece is kept, not thrown away.
    const api = read('app/api/dnd/homebrew/route.ts');
    expect(api, 'POST /homebrew must not call the reviewer').not.toContain('ASSESSMENT_SYSTEM_PROMPT');
    expect(api).not.toContain('assessmentUserPrompt');
  });

  it('writes only `assessment` — never a value, never a status', () => {
    const update = route.slice(route.indexOf('.update('), route.indexOf('.update(') + 120);
    expect(update).toContain('assessment');
    for (const forbidden of ['status', 'visibility', 'payload', 'name']) {
      expect(update, `a review must not touch ${forbidden}`).not.toContain(`${forbidden}:`);
    }
  });

  it('and does not bump updated_at — a robot having an opinion is not a change to the piece', () => {
    // Bumping it would reorder the author's library and instantly mark the review stale against the very
    // piece it just described.
    const update = route.slice(route.indexOf('.update('), route.indexOf('.update(') + 120);
    expect(update).not.toContain('updated_at');
  });

  it('is rate-limited and creator-only', () => {
    expect(route).toContain("checkRateLimit('ai'");
    expect(route).toContain('canWriteHomebrew');
  });

  it('refuses an unusable response rather than storing a fragment', () => {
    expect(route).toMatch(/if \(!assessment\)/);
  });
});

describe('the panel positions it as an opinion', () => {
  it('shows strengths before concerns', () => {
    // A review that opens with problems reads as a rejection of work someone has just finished.
    expect(panel.indexOf("list('What works'")).toBeLessThan(panel.indexOf("list('Worth a look'"));
  });

  it('is creator-only', () => {
    const page = read('app/dnd/content/[id]/page.tsx');
    expect(page).toMatch(/\{mine && \(\s*<AssessmentPanel/);
  });

  it('and degrades honestly when AI is not configured', () => {
    expect(panel).toMatch(/isn’t configured/);
  });
});
