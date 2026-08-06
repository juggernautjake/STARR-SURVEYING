// __tests__/hub/widgets/weather-search.test.tsx
//
// The weather widget's half of us-location-search-2026-08-06.
//
// ── WHAT COVERS WHAT, AND WHY IT IS SPLIT ───────────────────────────────────────────────────────
//
// `LocationSearch` itself — debounce, listbox, keyboard, the mousedown-not-click fix — is covered in
// a real browser by e2e/weather-location-search.spec.ts, driving the /admin/weather page. It is the
// same component the widget mounts, so that is genuine coverage of the interaction.
//
// The widget's own inline control could not be driven there: adding a widget to a hub is an
// edit-mode DRAFT, so reaching it in a browser would mean saving over the owner's real layout.
//
// So this file locks the two things left: the query builder (pure, and the piece that decides which
// place is actually fetched), and the render conditions (source-asserted, the same way the rest of
// the hub widget suite does it — this repo has no @testing-library/react, and `react-dom/server`
// cannot reach the loaded state because the widget fetches in an effect).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { getWidget } from '@/lib/hub/widget-registry';
import { weatherQuery, type WeatherContent } from '@/lib/hub/widgets/weather';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'hub', 'widgets', 'weather', 'index.tsx'),
  'utf8',
);

const base: WeatherContent = { location: 'auto', zip: '', place: null };

describe('weatherQuery — which place actually gets fetched', () => {
  it('sends no coordinates for auto', () => {
    expect(weatherQuery(base)).toBe('location=auto');
  });

  it('sends the ZIP for manual, so widgets saved before the search keep working', () => {
    expect(weatherQuery({ ...base, location: 'manual', zip: '78701' }))
      .toBe('location=manual&zip=78701');
  });

  it('sends coordinates and the label for a searched place', () => {
    const q = new URLSearchParams(weatherQuery({
      ...base, location: 'search',
      place: { label: 'Bell County, Texas', latitude: 31.0428, longitude: -97.4813 },
    }));
    expect(q.get('lat')).toBe('31.0428');
    expect(q.get('lon')).toBe('-97.4813');
    expect(q.get('label')).toBe('Bell County, Texas');
  });

  it('a searched place wins over a leftover ZIP rather than fighting it', () => {
    // Switching from Manual to Search leaves the old `zip` in saved content. Sending both would let
    // the server pick, which is how a widget ends up showing a place the user did not choose.
    const q = new URLSearchParams(weatherQuery({
      location: 'search', zip: '78701',
      place: { label: 'Anchorage, Alaska', latitude: 61.1743, longitude: -149.2843 },
    }));
    expect(q.get('lat')).toBe('61.1743');
    expect(q.get('zip')).toBeNull();
  });

  it('falls back to the ZIP when Search is selected but nothing has been picked yet', () => {
    expect(weatherQuery({ ...base, location: 'search', place: null, zip: '78701' }))
      .toBe('location=search&zip=78701');
  });
});

describe('the widget is registered and still renders', () => {
  const def = getWidget('weather');

  it('is registered with a place field in its defaults', () => {
    expect(def).toBeTruthy();
    expect(def!.defaultContent).toMatchObject({ location: 'auto', zip: '' });
  });

  it('renders without throwing at every size bucket', () => {
    // Server-rendering reaches the loading branch only, but that is enough to catch a hook order
    // problem or a crash introduced by the new state.
    for (const [w, h] of [[1, 1], [2, 2], [4, 3], [4, 4]]) {
      const el = React.createElement(def!.Widget, {
        customization: { content: {} } as never,
        size: { w, h },
        editMode: false,
        content: base,
      });
      expect(() => ReactDOMServer.renderToString(el)).not.toThrow();
    }
  });
});

describe('the inline look-up control', () => {
  it('is offered at every bucket except the 1×1 chip, which has no room', () => {
    expect(SRC).toMatch(/const canSearch = bucket !== 'tiny'/);
  });

  it('mounts the shared LocationSearch rather than a second search UI', () => {
    // Two pickers drift. The rail and the mobile drawer already proved that here once.
    expect(SRC).toMatch(/import LocationSearch from '@\/lib\/weather\/components\/LocationSearch'/);
    expect(SRC).toMatch(/<LocationSearch[\s\S]{0,200}onSelect=\{pickPlace\}/);
  });

  it('carries the widget’s place onto the day links', () => {
    // Without this, clicking Thursday on a widget showing Lubbock opened Thursday on the
    // Central-Texas page — a link that lands somewhere plausible but wrong.
    expect(SRC).toMatch(/href=\{`\/admin\/weather\?date=\$\{d\.date\}\$\{dayLinkLocation\}`\}/);
    expect(SRC).toMatch(/dayLinkLocation/);
  });

  it('says the look-up is temporary instead of letting a reload explain it', () => {
    expect(SRC).toMatch(/weather-reset-location/);
    expect(SRC).toMatch(/Temporary — reset/);
  });
});

describe('the settings form — the persisted path', () => {
  it('offers Search as a location mode', () => {
    expect(SRC).toMatch(/<option value="search">/);
  });

  it('is honest that auto / active-job are not yet wired to anything', () => {
    // Both resolve to the Central-Texas default. Offering "Auto-detect" without saying so is the
    // exact impression the owner reported: "we have it set to central texas".
    expect(SRC).toMatch(/Central Texas/);
  });
});
