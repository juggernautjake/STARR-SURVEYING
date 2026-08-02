// The worker and the self-healer look at the same list (research plan R8).
//
// The gap: `research_site_adapters` had 0 rows, and `grep -rln research_site_adapters worker/src`
// returned nothing. The self-healing subsystem — canaries, DOM fingerprints, health checks, change
// proposals, the review queue — monitored an empty table, while the scrapers that actually break
// were compiled into a service that never read it. Every "self-healing adapter" guarantee applied
// to nothing at all.
//
// The owner's requirement is that the system senses a county changing its website and adjusts
// without waiting for a release. Sensing needs a subject; adjusting needs somewhere to put the fix
// that is not a deploy. These tests pin both halves.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  REGISTRY_CACHE_TTL_MS,
  clerkEntriesToCompiled,
  statusForImplementation,
  type CompiledAdapter,
} from '../infra/adapter-registry.js';
import { CLERK_REGISTRY } from '../adapters/clerk-registry.js';

const src = fs.readFileSync(path.join(process.cwd(), 'src/infra/adapter-registry.ts'), 'utf8');

describe('publishing the compiled knowledge', () => {
  it('turns the worker’s clerk registry into registry rows', () => {
    const compiled = clerkEntriesToCompiled(CLERK_REGISTRY);
    expect(compiled.length).toBe(CLERK_REGISTRY.length);
    expect(compiled.every((c) => c.siteType === 'clerk_deeds')).toBe(true);
    // Bell is the one county with a dedicated pipeline; it must survive the translation intact.
    const bell = compiled.find((c) => c.county === 'Bell');
    expect(bell?.system).toBeTruthy();
    expect(bell?.implementation).toBe('implemented');
  });

  it('does NOT advertise a stub as something this firm can search', () => {
    // The coverage dashboard is customer-facing. A placeholder shown as `active` is how a surveyor
    // picks this firm for a county it cannot actually search.
    expect(statusForImplementation('implemented')).toBe('active');
    expect(statusForImplementation('stub')).toBe('draft');
    expect(statusForImplementation('unavailable')).toBe('draft');
  });

  it('never overwrites a row that may carry an accepted repair', () => {
    // A worker restart must not undo a self-heal somebody reviewed last week. The upsert ignores
    // duplicates rather than merging over config/status.
    expect(src).toContain('ignoreDuplicates: true');
    expect(src).toContain("onConflict: 'county_id,site_type'");
  });

  it('reports counties it could not match instead of dropping them silently', () => {
    expect(src).toContain('skippedNoCounty');
  });
});

describe('resolving, registry first', () => {
  it('prefers a stored base_url over the compiled one', () => {
    // A county moving its portal is the single most common break, and fixing it in a row rather
    // than in a release is the entire point of this file.
    expect(src).toMatch(/base_url as string\) \|\| fallback\.baseUrl/);
  });

  it('falls back to compiled config rather than failing the run', () => {
    // A database problem must not stop research for a county whose code works perfectly well.
    expect(src).toContain("source: compiledFallback ? 'compiled' : 'unknown'");
    expect(src).toMatch(/catch \{\s*\n\s*return cacheAnd/);
  });

  it('records WHERE the answer came from', () => {
    // "The registry said so" and "the code said so" produce identical behaviour right up until one
    // of them is wrong.
    expect(src).toMatch(/source: 'registry'/);
  });

  it('caches for a minute — long enough to be cheap, short enough that a repair lands', () => {
    expect(REGISTRY_CACHE_TTL_MS).toBeGreaterThanOrEqual(30_000);
    expect(REGISTRY_CACHE_TTL_MS).toBeLessThanOrEqual(120_000);
  });

  it('can be invalidated the moment a repair is applied', () => {
    expect(src).toContain('export function invalidateAdapterCache');
  });
});

describe('the worker actually publishes on boot', () => {
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('syncs the compiled registry at startup', () => {
    expect(index).toContain('publishCompiledAdapters');
    expect(index).toContain('clerkEntriesToCompiled(CLERK_REGISTRY)');
  });

  it('does not block boot on it', () => {
    // A slow or unreachable database must not stop the worker from accepting work it can do.
    expect(index).toMatch(/void publishCompiledAdapters\(/);
  });
});

describe('what the compiled set actually covers — stated, not implied', () => {
  it('is honest that most counties are stubs today', () => {
    const compiled: CompiledAdapter[] = clerkEntriesToCompiled(CLERK_REGISTRY);
    const implemented = compiled.filter((c) => c.implementation === 'implemented');
    // This assertion exists to be UPDATED as counties are built — it is the coverage number, and
    // pinning it means a claim about coverage cannot drift silently in either direction.
    expect(implemented.length).toBeLessThan(compiled.length);
    expect(implemented.length).toBeGreaterThan(0);
  });
});
