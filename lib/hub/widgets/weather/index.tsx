'use client';
// Slice 141 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export type WeatherLocation = 'auto' | 'manual' | 'active-job';

export interface WeatherContent extends Record<string, unknown> {
  location: WeatherLocation;
  zip: string;
}
const DEFAULTS: WeatherContent = { location: 'auto', zip: '' };

interface WeatherDay {
  date: string;
  high_f: number;
  low_f: number;
  description: string;
  icon: string;
  // weather-extras-2026-06-18 — per-day rain chance.
  rain_chance_pct?: number | null;
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
}

function WeatherWidget({ size, content }: WidgetProps<WeatherContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  const fetchWeather = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ location: settings.location });
      if (settings.zip) params.set('zip', settings.zip);
      const res = await fetch(`/api/admin/weather?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: WeatherSnapshot = await res.json();
      setWeather(data);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, [settings.location, settings.zip]);
  useEffect(() => { fetchWeather(); }, [fetchWeather]);

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
  const showExtras = weather.feels_like_f != null
    || weather.humidity_pct != null
    || weather.rain_chance_pct != null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, height: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden style={{ fontSize: '2rem' }}>{weather.icon}</span>
        <span style={statNumberStyle(bucket)}>{Math.round(weather.temperature_f)}°</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{weather.description}</span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{weather.location_label} · H {Math.round(weather.high_f)}° / L {Math.round(weather.low_f)}°</span>
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
          {upcoming.map((d) => (
            <li
              key={d.date}
              data-date={d.date}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '4px 2px',
                borderRadius: 6,
                background: 'var(--theme-bg-elevated, transparent)',
                fontSize: 'var(--hub-font-xs, 0.72rem)',
                color: 'var(--theme-fg-secondary)',
              }}
            >
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
                <span title="Chance of precipitation" style={{ color: 'var(--theme-fg-secondary)' }}>
                  🌧 {d.rain_chance_pct}%
                </span>
              )}
            </li>
          ))}
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
          <option value="auto">Auto-detect</option>
          <option value="manual">Manual ZIP</option>
          <option value="active-job">Active job site</option>
        </select>
      </label>
      {settings.location === 'manual' && (
        <label>
          <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>ZIP</span>
          <input type="text" value={settings.zip} placeholder="78701" onChange={(e) => onChange({ ...settings, zip: e.target.value })} />
        </label>
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
