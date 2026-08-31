// worker/src/__tests__/browserbase-adapter-gate.test.ts
//
// ── THE BILL THIS PREVENTS ──────────────────────────────────────────────────────────────────────
//
// The owner asked to route ONE adapter — the Bell CAD portal, which refuses the worker's IP — to
// Browserbase. The obvious instruction was:
//
//     BROWSER_BACKEND=browserbase
//     BROWSERBASE_ENABLED_ADAPTERS=cad
//
// and it would have been expensive. Before this change the adapter list could only RESTRICT: it was
// consulted after the backend had already resolved to browserbase. That combination gave:
//
//     cad adapter          → browserbase   ✓ what was wanted
//     other GATED adapters → local         ✓ the list doing its restricting job
//     UNGATED calls        → browserbase   ✗ everything else, billed per session
//
// and the factory's own header says ungated calls "always honor BROWSER_BACKEND". The clerk
// scraping is ungated in places and does ~40 navigations per run on local Chromium perfectly well.
//
// The list reads like an opt-in everywhere it is described. Now it behaves like one.

import { describe, it, expect, afterEach } from 'vitest';
import { resolveBackend } from '../lib/browser-factory.js';

const ORIGINAL = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL }; });

/** The routing DECISION, asserted without launching anything. */
function backendFor(opts: { adapterId?: string }): string {
  return resolveBackend(opts);
}

describe('an adapter named in the list is promoted, without turning Browserbase on globally', () => {
  it('promotes the named adapter while BROWSER_BACKEND stays local', () => {
    process.env.BROWSER_BACKEND = 'local';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = 'cad';
    expect(backendFor({ adapterId: 'cad' })).toBe('browserbase');
  });

  it('leaves every OTHER adapter on local', () => {
    process.env.BROWSER_BACKEND = 'local';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = 'cad';
    // bell-clerk is the ~40-navigations-a-run path. It must not be promoted.
    expect(backendFor({ adapterId: 'bell-clerk' })).toBe('local');
  });

  it('leaves UNGATED calls on local — the ones that would otherwise have been billed', () => {
    process.env.BROWSER_BACKEND = 'local';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = 'cad';
    expect(backendFor({})).toBe('local');
  });

  it('does nothing at all when the list is empty', () => {
    // The default state. Nobody who has not opted in sees any change.
    process.env.BROWSER_BACKEND = 'local';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = '';
    expect(backendFor({ adapterId: 'cad' })).toBe('local');
    expect(backendFor({ adapterId: 'bell-clerk' })).toBe('local');
  });

  it('is not the auto-promotion that was deliberately stripped', () => {
    // That one inferred the backend from the mere PRESENCE of a credential — paid infrastructure
    // switched on because a key existed. A key alone must still change nothing.
    process.env.BROWSER_BACKEND = 'local';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = '';
    process.env.BROWSERBASE_API_KEY = 'bb-key-present-but-nothing-opted-in';
    process.env.BROWSERBASE_PROJECT_ID = 'proj';
    expect(backendFor({ adapterId: 'cad' })).toBe('local');
  });

  it('still RESTRICTS when the backend is globally browserbase', () => {
    // The original behaviour has to survive: an adapter not on the list falls back to local even
    // when Browserbase is on globally.
    process.env.BROWSER_BACKEND = 'browserbase';
    process.env.BROWSERBASE_ENABLED_ADAPTERS = 'cad';
    expect(backendFor({ adapterId: 'bell-clerk' })).toBe('local');
  });
});
