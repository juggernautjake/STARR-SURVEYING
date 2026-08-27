// __tests__/components/address-autocomplete-places-status.test.ts
//
// The bug this pins down was not a crash. It was two different things looking the same.
//
// `AddressAutocomplete` handled every non-OK Places status with one branch — clear the suggestions,
// render nothing — so a key Google REFUSES produced exactly the screen a genuinely unmatched address
// produces. The planning doc could only record the symptom as "may be broken", because from the
// outside there was nothing to tell apart.
//
// So the assertion that matters here is not "does REQUEST_DENIED return a message". It is that
// REQUEST_DENIED and ZERO_RESULTS return DIFFERENT things — which is the property the old code
// violated and the reason the fault was invisible for as long as it was.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyPlacesStatus, scriptProvidesPlaces } from '@/lib/maps/places-status';

describe('classifyPlacesStatus', () => {
  it('does not confuse a refused key with an address that simply has no match', () => {
    const denied = classifyPlacesStatus('REQUEST_DENIED');
    const empty = classifyPlacesStatus('ZERO_RESULTS');

    // The whole defect, in one assertion.
    expect(denied.kind).not.toBe(empty.kind);
    expect(denied.message).not.toBe(empty.message);

    expect(denied.kind).toBe('denied');
    expect(denied.message).toMatch(/Places/);
  });

  it('stays silent on a half-typed address', () => {
    // Firing a warning on every keystroke that has not matched yet would make the real warning
    // unreadable. Silence here is the feature.
    for (const status of ['ZERO_RESULTS', 'NOT_FOUND']) {
      const outcome = classifyPlacesStatus(status);
      expect(outcome.kind).toBe('empty');
      expect(outcome.message).toBeNull();
    }
  });

  it('passes OK through with nothing to say', () => {
    expect(classifyPlacesStatus('OK')).toEqual({ kind: 'ok', message: null });
  });

  it('separates a transient rate limit from a permanent denial', () => {
    // The component stops querying on `denied` and keeps trying on `transient`. If these collapsed
    // into one kind, either a rate limit would permanently disable suggestions for the page load, or
    // a denied key would bill a request per keystroke forever.
    expect(classifyPlacesStatus('OVER_QUERY_LIMIT').kind).toBe('transient');
    expect(classifyPlacesStatus('REQUEST_DENIED').kind).toBe('denied');
  });

  it('still speaks up for statuses nobody anticipated', () => {
    // INVALID_REQUEST, UNKNOWN_ERROR, whatever Google ships next, and the undefined a stubbed
    // callback hands over. An unnamed failure that hides is how the original one survived.
    for (const status of ['INVALID_REQUEST', 'UNKNOWN_ERROR', 'SOMETHING_NEW', undefined, null, '']) {
      const outcome = classifyPlacesStatus(status);
      expect(outcome.kind).toBe('broken');
      expect(outcome.message).toBeTruthy();
    }
  });
});

describe('scriptProvidesPlaces', () => {
  it('rejects the ordinary map script — the trap the component used to fall into', () => {
    // A page loading a plain map puts this on the document. The component used to adopt it, wait for
    // a load event, and then find `google.maps.places` undefined forever.
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?key=AIza123')).toBe(false);
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?key=AIza123&libraries=geometry')).toBe(false);
  });

  it('accepts a script that carries Places, alone or among other libraries', () => {
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?key=AIza123&libraries=places')).toBe(true);
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?key=AIza123&libraries=geometry,places')).toBe(true);
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?libraries=places,drawing&key=AIza123')).toBe(true);
  });

  it('is not fooled by the word appearing somewhere else in the URL', () => {
    // `places` in a callback name or a path is not the library parameter.
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/js?key=k&callback=initPlaces')).toBe(false);
    expect(scriptProvidesPlaces('https://maps.googleapis.com/maps/api/places/js?key=k')).toBe(false);
  });

  it('treats a missing src as no Places rather than throwing', () => {
    // `getAttribute` returns null for a script without src; the component must not crash on it.
    expect(scriptProvidesPlaces(null)).toBe(false);
    expect(scriptProvidesPlaces(undefined)).toBe(false);
    expect(scriptProvidesPlaces('')).toBe(false);
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────────
//
// A classifier nothing calls fixes nothing, and this repo's most common defect is code that is
// authored but not connected. These read the source, following the pattern in
// `pay-invoice-discoverability.test.tsx`, because the branches involved only fire inside a Google
// callback that cannot be driven from `renderToStaticMarkup`.

describe('AddressAutocomplete is actually wired to all of this', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/components/AddressAutocomplete.tsx'),
    'utf8',
  );

  it('routes prediction results through the classifier', () => {
    expect(src).toContain("from '@/lib/maps/places-status'");
    expect(src).toContain('classifyPlacesStatus(status)');
  });

  it('no longer swallows a non-OK status into an empty list', () => {
    // The exact shape of the original bug: the whole else-branch was `setSuggestions([])`, with
    // nothing recorded about WHY the list was empty.
    expect(src).not.toMatch(/}\s*else\s*{\s*setSuggestions\(\[\]\);\s*}/);
    expect(src).toContain('setNotice(outcome.message)');
  });

  it('renders the notice, and gives the dropdown precedence when there is one', () => {
    expect(src).toContain('address-autocomplete__notice');
    expect(src).toContain('notice && !(showSuggestions && suggestions.length > 0)');
  });

  it('guards against adopting a Maps script that has no Places library', () => {
    expect(src).toContain('scriptProvidesPlaces(existingScript.getAttribute(\'src\'))');
  });

  it('reports a script that fails to load instead of waiting forever', () => {
    expect(src).toContain("addEventListener('error', reportScriptFailure)");
  });
});

describe('the styles reach every caller, not just the jobs routes', () => {
  // This is the regression guard for a bug that was invisible: `.address-autocomplete__*` lived in
  // `AdminJobs.css`, which `app/admin/jobs/layout.tsx` imports — so it loads on /admin/jobs and
  // nowhere else. The second caller sits under /admin/research and rendered a bare bulleted <ul>
  // that pushed the form down the page. Nothing errored, so nothing reported it.
  const componentCss = readFileSync(
    join(process.cwd(), 'app/admin/components/AddressAutocomplete.css'),
    'utf8',
  );
  const jobsCss = readFileSync(
    join(process.cwd(), 'app/admin/styles/AdminJobs.css'),
    'utf8',
  );
  const componentSrc = readFileSync(
    join(process.cwd(), 'app/admin/components/AddressAutocomplete.tsx'),
    'utf8',
  );

  it('the component imports its own stylesheet', () => {
    expect(componentSrc).toContain("import './AddressAutocomplete.css'");
  });

  it('every class the component renders is defined in that stylesheet', () => {
    const used = new Set(
      [...componentSrc.matchAll(/address-autocomplete(?:__[a-z-]+)?(?:--[a-z-]+)?/g)].map(m => m[0]),
    );
    expect(used.size).toBeGreaterThan(4); // the query found something, not nothing
    for (const cls of used) {
      expect(componentCss, `.${cls} must be defined beside the component`).toContain('.' + cls);
    }
  });

  it('the route-scoped copy is gone, so the two cannot drift apart', () => {
    // A duplicate left in AdminJobs.css would keep working on /admin/jobs and silently diverge from
    // the one every other route gets — which is worse than the original bug, because it looks fixed.
    expect(jobsCss).not.toMatch(/^\.address-autocomplete/m);
  });
});
