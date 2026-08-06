'use client';
// Slice 141 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
// weather-severity-2026-06-19 — per-day tooltip + severity badge.
import { buildDayTooltip, computeDaySeverity } from '@/lib/weather/severity';
// us-location-search-2026-08-06 — any US city or county, not just a ZIP.
import LocationSearch from '@/lib/weather/components/LocationSearch';
import type { LocationHit } from '@/lib/weather/location-search';

// `search` added 2026-08-06 — owner: *"We have it set to central texas, but we need to have a
// search function for locations in the US."* The three original modes could only ever resolve to a
// ZIP or the Central-Texas default, so a county or an unincorporated work site was unreachable.
export type WeatherLocation = 'auto' | 'manual' | 'active-job' | 'search';

/** A place the user picked out of the search. Coordinates are stored, not re-geocoded: the search
 *  already resolved them, and re-resolving a name on every render is how "Austin" becomes a
 *  different Austin. */
export interface WeatherPlace {
  label: string;
  latitude: number;
  longitude: number;
}

export interface WeatherContent extends Record<string, unknown> {
  location: WeatherLocation;
  zip: string;
  /** Set when `location === 'search'`. */
  place?: WeatherPlace | null;
}
const DEFAULTS: WeatherContent = { location: 'auto', zip: '', place: null };

/** Query string for the forecast endpoint given a widget's settings. Exported so the page and the
 *  tests build the request the same way the widget does. */
export function weatherQuery(settings: WeatherContent): string {
  const params = new URLSearchParams({ location: settings.location });
  if (settings.location === 'search' && settings.place) {
    params.set('lat', String(settings.place.latitude));
    params.set('lon', String(settings.place.longitude));
    params.set('label', settings.place.label);
  } else if (settings.zip) {
    params.set('zip', settings.zip);
  }
  return params.toString();
}

interface WeatherDay {
  date: string;
  high_f: number;
  low_f: number;
  description: string;
  icon: string;
  // Raw WMO code for the severity engine.
  code?: number;
  // weather-extras-2026-06-18 — per-day rain chance.
  rain_chance_pct?: number | null;
  // weather-icon-accuracy-2026-06-19 — per-day max wind in mph.
  wind_mph?: number | null;
  // weather-severity-2026-06-19 — extras driving the tooltip +
  // severity engine.
  wind_gust_mph?: number | null;
  feels_like_max_f?: number | null;
  feels_like_min_f?: number | null;
  humidity_max_pct?: number | null;
}
interface WeatherSnapshot {
  temperature_f: number;
  description: string;
  icon: string;
  high_f: number;
  low_f: number;
  location_label: string;
  daily?: WeatherDay[];
  // weather-extras-2026-06-18 — current-conditions extras.
  feels_like_f?: number | null;
  humidity_pct?: number | null;
  rain_chance_pct?: number | null;
  // weather-icon-accuracy-2026-06-19 — current sustained wind in mph.
  wind_mph?: number | null;
}

// weather-icon-accuracy-2026-06-19 — wind threshold for the chip.
// Mirrors lib/weather/wmo.ts WIND_NOTABLE_MPH so the chip appears
// in the same range the icon refinement reacts to.
const WIND_CHIP_THRESHOLD_MPH = 15;

function WeatherWidget({ size, content }: WidgetProps<WeatherContent>) {
  const saved = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [searching, setSearching] = useState(false);

  // ── LOOK-UP vs SETTING ────────────────────────────────────────────────────────────────────────
  //
  // The inline search sets a temporary override, not the widget's saved location. That is a
  // deliberate split, not a shortcut:
  //
  //   · "What's it doing in Lubbock right now?" is a question you ask once, about somebody else's
  //     job site. Rewriting the dashboard every time you ask it is the wrong trade.
  //   · Widget content is persisted through the edit-mode DRAFT (`patchWidgetCustomization` +
  //     `saveDraft` both no-op unless `isEditMode`). Writing content from outside that flow would
  //     need a second save path to the same layout row, which could overwrite a draft the user is
  //     part-way through composing on another widget.
  //
  // So the override is session-scoped and says so, and the Settings panel — which already runs
  // through the draft correctly — is where the default gets changed. The banner below makes the
  // difference visible rather than leaving the user to discover it on reload.
  const [override, setOverride] = useState<WeatherPlace | null>(null);

  const effective: WeatherContent = override
    ? { ...saved, location: 'search', place: override }
    : saved;

  const query = weatherQuery(effective);
  const fetchWeather = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/weather?${query}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: WeatherSnapshot = await res.json();
      setWeather(data);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, [query]);
  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  const pickPlace = useCallback((hit: LocationHit) => {
    setOverride({ label: hit.label, latitude: hit.latitude, longitude: hit.longitude });
    setSearching(false);
  }, []);

  // No room for a search box in a 1×1 temperature chip; every larger size gets one.
  const canSearch = bucket !== 'tiny';

  /** Suffix carrying this widget's place onto the day links, so the page opens where the widget is
   *  looking. Empty for `auto` / `active-job`, which have no coordinates of their own. */
  const place = effective.location === 'search' ? effective.place : null;
  const dayLinkLocation = place
    ? `&lat=${place.latitude}&lon=${place.longitude}&label=${encodeURIComponent(place.label)}`
    : effective.zip
      ? `&zip=${encodeURIComponent(effective.zip)}`
      : '';

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !weather) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>—°</span>
          <span style={tinyStatLabelStyle()}>weather</span>
        </div>
      );
    }
    return <WidgetEmpty icon="☁️" title="Weather unavailable" description="The forecast service is unreachable right now — it'll reappear automatically." />;
  }

  // Tiny — single line: emoji + rounded temp + the °F unit.
  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span aria-hidden style={{ fontSize: 'clamp(1.25rem, 3vw, 2rem)', lineHeight: 1 }}>{weather.icon}</span>
        <span style={statNumberStyle(bucket)}>{Math.round(weather.temperature_f)}°</span>
      </div>
    );
  }

  // weather-extras-2026-06-18 — drop the forecast threshold to
  // medium so a 4×2 / 3×3 weather tile already shows the
  // upcoming days. Today's row is skipped (the always-on
  // "current" block above covers it) so the strip reads as
  // "next 4 days" without duplicating today's data.
  const showForecast =
    (bucket === 'medium' || bucket === 'large' || bucket === 'xlarge')
    && (weather.daily?.length ?? 0) > 1;
  const upcoming = showForecast ? (weather.daily ?? []).slice(1, 5) : [];

  // weather-extras-2026-06-18 — surface feels-like / humidity /
  // rain chance at small+ buckets (the tiny branch has already
  // returned above, so by this point bucket is small or wider).
  // Each chip is null-safe so a partial Open-Meteo payload
  // still renders the others.
  // weather-icon-accuracy-2026-06-19 — surface wind as a chip when
  // notable so the office knows why the icon may show 🌬️.
  const showWindChip = weather.wind_mph != null && weather.wind_mph >= WIND_CHIP_THRESHOLD_MPH;
  const showExtras = weather.feels_like_f != null
    || weather.humidity_pct != null
    || weather.rain_chance_pct != null
    || showWindChip;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, height: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden style={{ fontSize: '2rem' }}>{weather.icon}</span>
        <span style={statNumberStyle(bucket)}>{Math.round(weather.temperature_f)}°</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{weather.description}</span>

      {/* Location row — the label, and the control that changes it. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        <span>{weather.location_label} · H {Math.round(weather.high_f)}° / L {Math.round(weather.low_f)}°</span>
        {canSearch && (
          <button
            type="button"
            data-testid="weather-change-location"
            onClick={() => setSearching((s) => !s)}
            aria-expanded={searching}
            title="Look up another US city or county"
            className="wx-chip"
          >
            <span aria-hidden>📍</span> Change
          </button>
        )}
        {override && (
          <button
            type="button"
            data-testid="weather-reset-location"
            onClick={() => setOverride(null)}
            // Says "temporarily" because it IS temporary — see the override comment above. A user
            // who wants this to stick needs the Settings panel, and should not have to reload to
            // find that out.
            title="Showing a temporary look-up. Click to go back to this widget's saved location; set a permanent one in the widget's settings."
            className="wx-chip"
          >
            ↩ Temporary — reset
          </button>
        )}
      </span>

      {searching && (
        <div style={{ marginTop: 2 }}>
          <LocationSearch compact autoFocus onSelect={pickPlace} onDismiss={() => setSearching(false)} />
        </div>
      )}
      {showExtras && (
        <ul
          data-testid="weather-extras-strip"
          style={{
            listStyle: 'none', margin: '4px 0 0', padding: 0,
            display: 'flex', flexWrap: 'wrap', gap: 6,
            fontSize: 'var(--hub-font-xs, 0.72rem)',
          }}
        >
          {weather.feels_like_f != null && (
            <li
              data-testid="weather-extra-feels"
              title="Apparent (feels-like) temperature"
              style={extraChipStyle}
            >
              <span aria-hidden>🌡️</span>
              <span>Feels {Math.round(weather.feels_like_f)}°</span>
            </li>
          )}
          {weather.humidity_pct != null && (
            <li
              data-testid="weather-extra-humidity"
              title="Relative humidity"
              style={extraChipStyle}
            >
              <span aria-hidden>💧</span>
              <span>{weather.humidity_pct}% hum</span>
            </li>
          )}
          {weather.rain_chance_pct != null && (
            <li
              data-testid="weather-extra-rain"
              title="Chance of precipitation today"
              style={extraChipStyle}
            >
              <span aria-hidden>🌧️</span>
              <span>{weather.rain_chance_pct}% rain</span>
            </li>
          )}
          {showWindChip && (
            <li
              data-testid="weather-extra-wind"
              title="Current sustained wind"
              style={extraChipStyle}
            >
              <span aria-hidden>🌬️</span>
              <span>{weather.wind_mph} mph wind</span>
            </li>
          )}
        </ul>
      )}
      {showForecast && (
        <ul
          data-testid="weather-forecast-strip"
          style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${upcoming.length}, minmax(0, 1fr))`,
            gap: 4,
            marginTop: 'auto',
            paddingTop: 8,
            borderTop: '1px solid var(--theme-border, #e5e7eb)',
          }}
        >
          {upcoming.map((d) => {
            const severity = computeDaySeverity({
              code: d.code,
              high_f: d.high_f,
              low_f: d.low_f,
              feels_like_max_f: d.feels_like_max_f,
              feels_like_min_f: d.feels_like_min_f,
              humidity_max_pct: d.humidity_max_pct,
              rain_chance_pct: d.rain_chance_pct,
              wind_mph: d.wind_mph,
              wind_gust_mph: d.wind_gust_mph,
            });
            const tooltip = buildDayTooltip({
              date: d.date,
              description: d.description,
              code: d.code,
              high_f: d.high_f,
              low_f: d.low_f,
              feels_like_max_f: d.feels_like_max_f,
              feels_like_min_f: d.feels_like_min_f,
              humidity_max_pct: d.humidity_max_pct,
              rain_chance_pct: d.rain_chance_pct,
              wind_mph: d.wind_mph,
              wind_gust_mph: d.wind_gust_mph,
            });
            return (
              <li
                key={d.date}
                data-date={d.date}
                data-severity={severity?.kind ?? ''}
                style={{ listStyle: 'none' }}
              ><Link
                /* The location travels with the click. Without it, clicking Thursday on a widget
                   showing Lubbock opened the Lubbock forecast's date on the Central-Texas page —
                   the same "link that lands somewhere plausible but wrong" shape as the ?tab= bug. */
                href={`/admin/weather?date=${d.date}${dayLinkLocation}`}
                title={tooltip}
                aria-label={tooltip}
                tabIndex={0}
                style={{
                  textDecoration: 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: '4px 2px',
                  borderRadius: 6,
                  background: severity
                    ? 'color-mix(in srgb, var(--theme-bg-elevated, #f3f4f6) 70%, #fee2e2)'
                    : 'var(--theme-bg-elevated, transparent)',
                  outline: severity ? '1px solid color-mix(in srgb, var(--theme-fg-secondary, #6B7280) 30%, #f87171)' : 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  fontSize: 'var(--hub-font-xs, 0.72rem)',
                  color: 'var(--theme-fg-secondary)',
                }}
              >
                {severity && (
                  <span
                    aria-hidden
                    data-testid={`weather-day-severity-${severity.kind}`}
                    title={`${severity.label}: ${severity.advice}`}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      fontSize: '0.85rem', lineHeight: 1,
                    }}
                  >
                    {severity.icon}
                  </span>
                )}
                <span style={{ fontWeight: 600, color: 'var(--theme-fg-primary)' }}>
                  {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span aria-hidden style={{ fontSize: '1.15rem', lineHeight: 1 }}>{d.icon}</span>
                <span>
                  <strong style={{ color: 'var(--theme-fg-primary)' }}>{Math.round(d.high_f)}°</strong>
                  {' / '}
                  <span>{Math.round(d.low_f)}°</span>
                </span>
                {d.rain_chance_pct != null && (
                  <span style={{ color: 'var(--theme-fg-secondary)' }}>
                    🌧 {d.rain_chance_pct}%
                  </span>
                )}
              </Link></li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const extraChipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--theme-bg-elevated, #f3f4f6)',
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap',
};

function WeatherSettings({ value, onChange }: WidgetSettingsFormProps<WeatherContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Location</span>
        <select value={settings.location} onChange={(e) => onChange({ ...settings, location: e.target.value as WeatherLocation })}>
          {/* "Search" first, and the default for anyone choosing deliberately: it is the only option
              that can reach a county, an unincorporated site, or anywhere without a ZIP. */}
          <option value="search">Search a US city or county</option>
          <option value="auto">Auto-detect</option>
          <option value="manual">Manual ZIP</option>
          <option value="active-job">Active job site</option>
        </select>
      </label>

      {settings.location === 'search' && (
        <div>
          <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Place</span>
          {settings.place && (
            <p
              data-testid="weather-settings-current-place"
              className="wx-note"
            >
              Currently: <strong>{settings.place.label}</strong>
            </p>
          )}
          <LocationSearch
            compact
            placeholder={settings.place ? 'Search for a different place…' : 'Try “Flagstaff”, “Orleans Parish”, or a ZIP…'}
            onSelect={(hit: LocationHit) =>
              onChange({
                ...settings,
                location: 'search',
                place: { label: hit.label, latitude: hit.latitude, longitude: hit.longitude },
              })
            }
          />
          <p className="wx-hint">
            Counties come from the US Census; cities, towns and ZIPs from the forecast provider.
          </p>
        </div>
      )}

      {settings.location === 'manual' && (
        <label>
          <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>ZIP</span>
          <input type="text" value={settings.zip} placeholder="78701" onChange={(e) => onChange({ ...settings, zip: e.target.value })} />
        </label>
      )}

      {(settings.location === 'auto' || settings.location === 'active-job') && (
        // Honesty about what these two actually do. Neither is wired to a device location or to the
        // job the user is on; both resolve to the Central-Texas default, which is precisely the
        // "we have it set to central texas" the owner reported. Saying so in the panel beats letting
        // somebody pick "Auto-detect" and wonder why the forecast never follows them.
        <p className="wx-hint wx-hint--flush">
          These fall back to the firm&rsquo;s default area (Central Texas) until device location and
          job-site coordinates are wired up. To pin this widget somewhere specific, choose
          <strong> Search a US city or county</strong>.
        </p>
      )}
    </div>
  );
}

defineWidget<WeatherContent>({
  id: 'weather',
  label: 'Weather',
  description: "Today's forecast for your work site.",
  category: 'personal',
  iconName: 'CloudSun',
  defaultSize: { w: 2, h: 2 },
  // Slice 213 — minSize lowered to 1×1 with the tiny temp-card mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: WeatherWidget,
  SettingsForm: WeatherSettings,
});
