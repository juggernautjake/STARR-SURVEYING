// __tests__/dnd/glossary-keyword-reach.test.ts — the glossary is reachable WITHOUT embeddings.
//
// This exists to protect a DEFERRAL's reasoning, which is an unusual thing to test and the reason it is
// worth doing. The rules-platform doc defers "project the glossary into the store so semantic retrieval
// reaches the full articles" on the grounds that semantic search is inert without `VOYAGE_API_KEY`.
//
// That is only a fair trade because the glossary is ALREADY reachable another way: `searchLibrary` calls
// the in-memory `searchGlossary` directly and scores its hits ABOVE the generated catalog lines, so a
// player looking up "Blinded" gets the written article today, key or no key. If that path were ever
// removed, the deferral would silently stop being reasonable — the articles would become unreachable and
// nobody would connect it to a note in a planning doc.
//
// So: a deferral whose rationale depends on a code path deserves a guard on that path.
import { describe, it, expect } from 'vitest';
import { searchLibrary } from '@/lib/dnd/library';
import { glossaryFor } from '@/lib/dnd/glossary';

describe('the glossary reaches search without semantic retrieval', () => {
  it('a glossary term returns its written article', () => {
    const hits = searchLibrary('blinded', 'dnd5e-2024', 20);
    const article = hits.find((h) => h.name.toLowerCase() === 'blinded');
    expect(article, 'the Blinded article should be findable by keyword').toBeTruthy();
    // The real explanation, not a one-line stub from the generated condition list.
    expect(article!.body.length).toBeGreaterThan(40);
  });

  it('and OUTRANKS the thin catalog line for the same word', () => {
    // The article is scored +6 precisely so it beats the generated entry. If that inverted, a lookup would
    // return the stub and the glossary would be effectively unreachable even though it is still indexed.
    const hits = searchLibrary('blinded', 'dnd5e-2024', 20);
    const first = hits.findIndex((h) => h.name.toLowerCase() === 'blinded');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(3);
  });

  it('every focus system has glossary articles to reach', () => {
    for (const sys of ['dnd5e-2014', 'dnd5e-2024', 'pathfinder2e', 'intuitive-games'] as const) {
      expect(glossaryFor(sys).length, `${sys} should have a glossary`).toBeGreaterThan(0);
    }
  });

  it('search works with no embeddings present, which is the whole point', () => {
    // No key in this environment, and the call still returns results — the deferral's premise, asserted.
    expect(process.env.VOYAGE_API_KEY ?? '').toBe('');
    expect(searchLibrary('condition', 'dnd5e-2024', 10).length).toBeGreaterThan(0);
  });
});
