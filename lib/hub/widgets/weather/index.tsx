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

interface WeatherSnapshot { temperature_f: number; description: string; icon: string; high_f: number; low_f: number; location_label: string; }

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
    return <WidgetEmpty icon="☁️" title="Weather unavailable" description="Once /api/admin/weather is wired, the forecast lands here." />;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden style={{ fontSize: '2rem' }}>{weather.icon}</span>
        <span style={statNumberStyle(bucket)}>{Math.round(weather.temperature_f)}°</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{weather.description}</span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{weather.location_label} · H {Math.round(weather.high_f)}° / L {Math.round(weather.low_f)}°</span>
    </div>
  );
}

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
