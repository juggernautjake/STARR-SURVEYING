// __tests__/design/search.test.ts — the search has one acceptance test, and the owner wrote it.
//
// *"if I type 'date' into the element search bar, every element that deals with scheduling and dates
// and calendars and maybe even clocks and timers should show up in the search panel."*
//
// That is not a string match — `date` appears in none of "calendar month grid", "deadline chip" or
// "stopwatch pill". So the concept graph is the feature, and these tests are mostly about it.

import { describe, it, expect } from 'vitest';
import { ENTRIES } from '@/lib/design/catalogue';
import { buildIndex, search, searchWithFallback, parseQuery, editDistance } from '@/lib/design/search';
import { conceptsForTerm, expandTerm, CONCEPTS } from '@/lib/design/search/concepts';

const index = buildIndex(ENTRIES);
const ids = (hits: { entry: { id: string } }[]) => hits.map((h) => h.entry.id);

describe('the concept graph', () => {
  it('puts date, calendar, deadline, clock and timer in the same concept', () => {
    for (const term of ['date', 'calendar', 'deadline', 'clock', 'timer', 'schedule', 'due']) {
      expect(conceptsForTerm(term), `"${term}" should reach the time concept`).toContain('time');
    }
  });

  it('tolerates a plural', () => {
    expect(conceptsForTerm('dates')).toContain('time');
    expect(conceptsForTerm('buttons')).toContain('action');
  });

  it('lets a word belong to more than one concept, because some words do', () => {
    // `filter` is both a choice and a data operation; `note` is both an input and a message.
    expect(conceptsForTerm('filter').length).toBeGreaterThan(1);
    expect(conceptsForTerm('note').length).toBeGreaterThan(1);
  });

  it('expands a term to its siblings', () => {
    const { concepts, terms } = expandTerm('deadline');
    expect(concepts).toContain('time');
    expect(terms).toContain('calendar');
    expect(terms).not.toContain('deadline');   // the term itself is not its own expansion
  });

  it('has no empty concepts and no duplicate ids', () => {
    const seen = new Set<string>();
    for (const concept of CONCEPTS) {
      expect(concept.terms.length, `${concept.id} is empty`).toBeGreaterThan(3);
      expect(seen.has(concept.id), `${concept.id} is declared twice`).toBe(false);
      seen.add(concept.id);
    }
  });
});

describe('the query parser', () => {
  it('splits terms, phrases, filters and negations', () => {
    const q = parseQuery('date "date range" category:input -icon');
    expect(q.terms).toContain('date');
    expect(q.phrases).toContain('date range');
    expect(q.filters.category).toEqual(['input']);
    expect(q.negations).toContain('icon');
  });

  it('drops stopwords so "a button for the job" is not four dead terms', () => {
    expect(parseQuery('a button for the job').terms).toEqual(['button', 'job']);
  });
});

describe('editDistance', () => {
  it('measures small typos and gives up on big ones', () => {
    expect(editDistance('calendar', 'calender')).toBe(1);
    expect(editDistance('button', 'buton')).toBe(1);
    expect(editDistance('button', 'elephant', 3)).toBeGreaterThan(3);
  });
});

describe('search — the owner’s test', () => {
  it('typing "date" finds the date field first', () => {
    const hits = search(index, 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.id).toBe('input.date');
  });

  it('and also finds things whose names do not contain the word "date"', () => {
    const hits = search(index, 'date');
    const found = ids(hits);
    // Every one of these is in the `time` concept without having "date" in its label.
    expect(found.length).toBeGreaterThan(1);
    expect(found).not.toEqual(['input.date']);
  });

  it('every hit says WHY it matched', () => {
    for (const hit of search(index, 'date')) {
      expect(hit.reasons.length, `${hit.entry.id} matched with no reason`).toBeGreaterThan(0);
    }
  });

  it('a literal match outranks a concept match', () => {
    const hits = search(index, 'date');
    const literal = hits.findIndex((h) => h.entry.id === 'input.date');
    const conceptual = hits.findIndex((h) => h.reasons.some((r) => r.startsWith('concept')));
    if (conceptual !== -1) expect(literal).toBeLessThan(conceptual);
  });
});

describe('search — the rest of the behaviour', () => {
  it('finds a button by its purpose, not just its name', () => {
    expect(ids(search(index, 'save'))).toContain('button.admin');
    expect(ids(search(index, 'delete'))).toContain('button.icon');
  });

  it('finds an element by the real class name, which is what somebody half-remembering the code types', () => {
    expect(ids(search(index, 'admin-empty'))).toContain('feedback.empty');
    expect(ids(search(index, 'job-form__input')).length).toBeGreaterThan(0);
  });

  it('finds an element by the route it appears on', () => {
    expect(ids(search(index, 'route:/admin/jobs/new')).length).toBeGreaterThan(0);
  });

  it('survives a typo', () => {
    expect(ids(search(index, 'buton'))).toContain('button.admin');
    expect(ids(search(index, 'rectangel'))).toContain('shape.rectangle');
  });

  it('ANDs multiple terms', () => {
    const both = search(index, 'empty state');
    expect(ids(both)).toContain('feedback.empty');
    // A term nothing satisfies removes the entry entirely.
    expect(search(index, 'empty zzzzzzz')).toHaveLength(0);
  });

  it('filters by category and area', () => {
    const shapes = search(index, '', { categories: ['shape'] });
    expect(shapes.length).toBeGreaterThan(3);
    expect(shapes.every((h) => h.entry.category === 'shape')).toBe(true);
  });

  it('excludes with a minus', () => {
    const withIcon = ids(search(index, 'button'));
    const without = ids(search(index, 'button -icon'));
    expect(withIcon).toContain('button.icon');
    expect(without).not.toContain('button.icon');
  });

  it('an empty query returns everything, most-used first', () => {
    const hits = search(index, '');
    expect(hits.length).toBe(ENTRIES.length);
    expect(hits[0].entry.usageCount).toBeGreaterThanOrEqual(hits[hits.length - 1].entry.usageCount);
  });

  it('never dead-ends: an unmatched word falls back to its concept and says so', () => {
    const { hits, note } = searchWithFallback(index, 'chronometer');
    // `chronometer` is not in any vocabulary; if the graph can place it, results come back with a
    // note. If it cannot, the note still explains rather than showing an empty panel.
    expect(note).toBeTruthy();
    if (hits.length) expect(note).toMatch(/showing/i);
  });

  it('explains itself even when there is genuinely nothing', () => {
    const { hits, note } = searchWithFallback(index, 'qqzzxx');
    expect(hits).toHaveLength(0);
    expect(note).toMatch(/Nothing matched/);
  });
});

describe('the catalogue the search runs over', () => {
  it('has no duplicate ids', () => {
    const seen = new Set<string>();
    for (const entry of ENTRIES) {
      expect(seen.has(entry.id), `${entry.id} is declared twice`).toBe(false);
      seen.add(entry.id);
    }
  });

  it('every entry can say where it came from', () => {
    for (const entry of ENTRIES) {
      expect(entry.source.length, `${entry.id} cites no source`).toBeGreaterThan(0);
      expect(entry.sourceHash, `${entry.id} has no hash`).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('every entry is searchable — a label, keywords and a concept', () => {
    for (const entry of ENTRIES) {
      expect(entry.label.length, `${entry.id} has no label`).toBeGreaterThan(0);
      expect(entry.keywords.length, `${entry.id} has no keywords`).toBeGreaterThan(2);
      expect(entry.concepts.length, `${entry.id} belongs to no concept`).toBeGreaterThan(0);
    }
  });

  it('every slot in the markup exists, and every declared slot is in the markup', () => {
    for (const entry of ENTRIES) {
      const inHtml = [...entry.html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      const declared = entry.slots.map((s) => s.name);
      for (const name of inHtml) {
        expect(declared, `${entry.id}: {{${name}}} is in the markup but not declared`).toContain(name);
      }
      for (const name of declared) {
        expect(inHtml, `${entry.id}: slot "${name}" is declared but never rendered`).toContain(name);
      }
    }
  });

  it('interactive entries carry the 40px tap contract', () => {
    for (const entry of ENTRIES) {
      if (entry.category !== 'button' || entry.id === 'button.link') continue;
      expect(entry.contract?.minTapTarget, `${entry.id} has no tap floor`).toBe(40);
    }
  });
});

// ── PRECISION, WHICH IS AS MUCH THE JOB AS RECALL (2026-08-23) ─────────────────────────────────
//
// A screenshot of the palette caught this: searching "sticky" returned the empty state, the card
// and the page button. Their DESCRIPTIONS contain "border", "box" and "radius", which are all in
// the `shape` concept — and every entry is three sentences away from every concept, so expanding
// through prose matched nearly everything. A search that returns everything has not helped anybody.
describe('search precision', () => {
  it('does not drag in unrelated entries through their prose', () => {
    const found = ids(search(index, 'sticky'));
    expect(found).toContain('shape.sticky');
    expect(found).not.toContain('feedback.empty');
    expect(found).not.toContain('card.basic');
    expect(found).not.toContain('button.page');
  });

  it('still reaches the right things through chosen keywords', () => {
    // `deadline` is a keyword on the date field, not its label; `due` is only in the concept.
    expect(ids(search(index, 'deadline'))).toContain('input.date');
    expect(ids(search(index, 'due'))).toContain('input.date');
  });

  it('keeps every result explainable', () => {
    for (const term of ['date', 'button', 'empty', 'table', 'rectangle']) {
      for (const hit of search(index, term)) {
        expect(hit.reasons.length, `"${term}" → ${hit.entry.id} with no reason`).toBeGreaterThan(0);
      }
    }
  });
});
