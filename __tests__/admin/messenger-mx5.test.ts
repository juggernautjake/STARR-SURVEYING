// __tests__/admin/messenger-mx5.test.ts
//
// Slice MX5 — cross-conversation search parity with the
// dedicated /admin/messages page. Pure helpers exercise the
// match-highlighting + context-snippet logic; source-locks
// pin the FloatingMessenger wiring (query state, results
// header copy, conversation name in each row, <mark> tag for
// highlighted segments).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { highlightSegments, snippetAroundMatch } from '../../lib/admin/messenger-search';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('highlightSegments (pure helper)', () => {
  it('returns a single non-match segment when the query is empty', () => {
    expect(highlightSegments('Hello world', '')).toEqual([
      { text: 'Hello world', match: false },
    ]);
  });

  it('alternates non-match + match segments around each occurrence', () => {
    expect(highlightSegments('foo bar foo baz', 'foo')).toEqual([
      { text: 'foo', match: true },
      { text: ' bar ', match: false },
      { text: 'foo', match: true },
      { text: ' baz', match: false },
    ]);
  });

  it('matches are case-insensitive (preserves the original casing in the segment)', () => {
    expect(highlightSegments('Foo and FOO', 'foo')).toEqual([
      { text: 'Foo', match: true },
      { text: ' and ', match: false },
      { text: 'FOO', match: true },
    ]);
  });

  it('handles a snippet with no match (single non-match segment)', () => {
    expect(highlightSegments('Hello world', 'xyz')).toEqual([
      { text: 'Hello world', match: false },
    ]);
  });
});

describe('snippetAroundMatch (pure helper)', () => {
  it('returns the text unchanged when it already fits within maxLen', () => {
    expect(snippetAroundMatch('short', 'anything', 100)).toBe('short');
  });

  it("falls back to a head-and-ellipsis when the query is missing or not found", () => {
    const long = 'x'.repeat(200);
    expect(snippetAroundMatch(long, '', 50)).toBe('x'.repeat(50) + '…');
    expect(snippetAroundMatch(long, 'foo', 50)).toBe('x'.repeat(50) + '…');
  });

  it("centers the snippet on the match when the content is too long", () => {
    const content =
      'lorem ipsum '.repeat(20) // padding
      + 'NEEDLE HERE'
      + ' dolor sit'.repeat(20);
    const out = snippetAroundMatch(content, 'NEEDLE', 50);
    // We should see the match inside the trimmed window + a
    // leading / trailing ellipsis to signal the trim.
    expect(out).toMatch(/^…/);
    expect(out).toMatch(/…$/);
    expect(out.toLowerCase()).toContain('needle');
  });
});

describe('FloatingMessenger — search view parity (MX5)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('imports the highlight + snippet helpers', () => {
    expect(SRC).toMatch(/import \{ highlightSegments, snippetAroundMatch \} from '@\/lib\/admin\/messenger-search'/);
  });

  it('holds an msgSearchQuery state so the highlights + summary can read it', () => {
    expect(SRC).toMatch(/const \[msgSearchQuery, setMsgSearchQuery\] = useState\(''\)/);
  });

  it('the search input is now controlled by msgSearchQuery', () => {
    expect(SRC).toMatch(/value=\{msgSearchQuery\}/);
  });

  it('renders the results-summary "N matches for <query>" copy when there are hits', () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-search-summary"/);
    expect(SRC).toMatch(/match\{searchResults\.length === 1 \? '' : 'es'\}/);
  });

  it('renders the conversation name next to the sender on every result row', () => {
    expect(SRC).toMatch(/getConvName\(conv\)/);
  });

  it('wraps the snippet in <mark> segments using the highlight helper', () => {
    expect(SRC).toMatch(/highlightSegments\(snippet, msgSearchQuery\)/);
    expect(SRC).toMatch(/<mark/);
  });

  it('the empty-state copy differentiates "type more" from "no matches"', () => {
    expect(SRC).toMatch(/No messages match "/);
    expect(SRC).toMatch(/Type at least 2 characters to search/);
  });

  it('search rows still link into the originating conversation via openConversation', () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-search-result"/);
    expect(SRC).toMatch(/openConversation\(conv\)/);
  });
});
