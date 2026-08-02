// A repair stored in the registry actually reaches the scraper (research plan R8b).
//
// R8 gave the self-healer somewhere to put a fix. R9 made a changed site reach the repair queue.
// Neither is worth anything if the adapter still reads a constant compiled into the image — the fix
// would sit in the database while every run kept using the old URL until somebody cut a release.
// That is the gap this closes, and it is the difference between "self-healing" and "a table of
// suggestions".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/adapters/kofile-clerk-adapter.ts'),
  'utf8',
);

describe('the Kofile adapter consults the registry before it opens a session', () => {
  it('applies overrides at session start, not in the constructor', () => {
    // The constructor is synchronous and the registry is a network read; doing it at initSession
    // is what makes the lookup possible at all.
    expect(SRC).toContain('await this.applyRegistryOverrides();');
    const applyAt = SRC.indexOf('await this.applyRegistryOverrides();');
    const browserAt = SRC.indexOf('this.browser = await acquireBrowser(');
    expect(applyAt).toBeLessThan(browserAt);
  });

  it('takes the stored base_url — the most common thing a county changes', () => {
    expect(SRC).toContain('if (resolved.baseUrl) this.config.baseUrl = resolved.baseUrl;');
  });

  it('reads a small, snake_cased contract a repair can target', () => {
    for (const key of ['search_path', 'viewer_path', 'super_search_url', 'has_supersearch']) {
      expect(SRC, `${key} is not part of the override contract`).toContain(key);
    }
  });

  it('keeps the compiled value for anything the repair did not set', () => {
    // A partial repair must be safe: fixing the search path must not silently blank the viewer path.
    // Every assignment is guarded by a presence check rather than an unconditional spread.
    expect(SRC).toMatch(/if \(typeof cfg\.search_path === 'string'\)/);
    expect(SRC).toMatch(/if \(typeof cfg\.viewer_path === 'string'\)/);
    expect(SRC).not.toMatch(/this\.config = \{ \.\.\.this\.config, \.\.\.cfg \}/);
  });

  it('ignores the registry when the answer came from compiled config', () => {
    // resolveAdapter falls back to compiled when the row is missing or the database is unreachable;
    // applying that back over itself would be a no-op at best and a loop at worst.
    expect(SRC).toContain("if (resolved.source !== 'registry') return;");
  });

  it('never lets a registry failure stop research', () => {
    // A database problem must not take out a county whose scraper works perfectly well.
    const applyBlock = SRC.slice(SRC.indexOf('private async applyRegistryOverrides'), SRC.indexOf('async initSession'));
    expect(applyBlock).toMatch(/try \{/);
    expect(applyBlock).toMatch(/\} catch \{/);
  });

  it('says out loud when it is using a URL that is not in the source tree', () => {
    // Otherwise the next person debugging reads the constant and believes it.
    expect(SRC).toContain('base URL from registry');
  });
});

describe('the merge itself', () => {
  // The adapter's merge is private and its constructor reaches for Playwright, so the behaviour is
  // exercised through a faithful re-implementation of the documented contract. What is being pinned
  // is the CONTRACT — which keys win, and what happens to the ones a repair did not mention.
  interface Cfg { baseUrl: string; searchPath: string; viewerPath: string; hasSUPERSEARCH: boolean; superSearchUrl?: string }
  const compiled = (): Cfg => ({
    baseUrl: 'https://bell.tx.publicsearch.us',
    searchPath: '/results',
    viewerPath: '/doc/',
    hasSUPERSEARCH: true,
    superSearchUrl: 'https://bell.tx.publicsearch.us/supersearch',
  });

  function applyOverrides(cfg: Cfg, baseUrl: string | null, registryConfig: Record<string, unknown>): Cfg {
    const next = { ...cfg };
    if (baseUrl) next.baseUrl = baseUrl;
    if (typeof registryConfig.search_path === 'string') next.searchPath = registryConfig.search_path;
    if (typeof registryConfig.viewer_path === 'string') next.viewerPath = registryConfig.viewer_path;
    if (typeof registryConfig.super_search_url === 'string') {
      next.superSearchUrl = registryConfig.super_search_url;
      next.hasSUPERSEARCH = true;
    }
    if (typeof registryConfig.has_supersearch === 'boolean') next.hasSUPERSEARCH = registryConfig.has_supersearch;
    return next;
  }

  it('a county that moved its portal is fixed by one column', () => {
    const out = applyOverrides(compiled(), 'https://bell.tx.newvendor.gov', {});
    expect(out.baseUrl).toBe('https://bell.tx.newvendor.gov');
    // And nothing else moved.
    expect(out.searchPath).toBe('/results');
    expect(out.viewerPath).toBe('/doc/');
  });

  it('a partial repair leaves the rest of the config alone', () => {
    const out = applyOverrides(compiled(), null, { search_path: '/search-results' });
    expect(out.searchPath).toBe('/search-results');
    expect(out.viewerPath).toBe('/doc/');
    expect(out.baseUrl).toBe('https://bell.tx.publicsearch.us');
  });

  it('a county that dropped SUPERSEARCH can be turned off without touching anything else', () => {
    const out = applyOverrides(compiled(), null, { has_supersearch: false });
    expect(out.hasSUPERSEARCH).toBe(false);
    expect(out.superSearchUrl).toBe('https://bell.tx.publicsearch.us/supersearch');
  });

  it('an empty registry config is a no-op, not a wipe', () => {
    expect(applyOverrides(compiled(), null, {})).toEqual(compiled());
  });
});
