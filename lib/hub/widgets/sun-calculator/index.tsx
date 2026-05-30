'use client';
// Slice 143 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md — bucket-aware
// rendering so the sunrise/sunset pair reads at every size.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 15c — wired to the Slice-12 schema fields:
//   - latitude / longitude: forwarded to the /api/admin/sun call as
//                          ?lat=…&lng=… query params so the surveyor
//                          can pin a specific site
//   - units:               'local' | 'utc'. When 'utc' the times get a
//                          " UTC" suffix so the surveyor sees a
//                          visible cue (real local↔UTC conversion
//                          needs the backend to return ISO timestamps;
//                          this slice locks the toggle for when it does)
//   - showTwilight:        when true, surfaces a "civil twilight"
//                          placeholder row underneath
import { resolveBool, resolveEnum } from '@/lib/hub/widgets/_shared/content-resolvers';

export type SunUnits = 'local' | 'utc';
const UNITS: ReadonlyArray<SunUnits> = ['local', 'utc'];

export interface SunCalculatorContent extends Record<string, unknown> {
  latitude?: string;
  longitude?: string;
  units?: SunUnits;
  showTwilight?: boolean;
}
const DEFAULTS: SunCalculatorContent = {
  latitude: '',
  longitude: '',
  units: 'local',
  showTwilight: false,
};

export const resolveLatitude     = (c: SunCalculatorContent): string    => typeof c.latitude === 'string' ? c.latitude.trim() : '';
export const resolveLongitude    = (c: SunCalculatorContent): string    => typeof c.longitude === 'string' ? c.longitude.trim() : '';
export const resolveUnits        = (c: SunCalculatorContent): SunUnits  => resolveEnum(c.units, UNITS, 'local');
export const resolveShowTwilight = (c: SunCalculatorContent): boolean   => resolveBool(c.showTwilight, false);

/** Build the ?lat=&lng= query string when the surveyor has pinned a
 *  site; returns '' when neither coordinate is set so the request
 *  hits the default site. */
export function buildSunQuery(lat: string, lng: string): string {
  const parts: string[] = [];
  if (lat) parts.push(`lat=${encodeURIComponent(lat)}`);
  if (lng) parts.push(`lng=${encodeURIComponent(lng)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Suffix the time with " UTC" when units=utc so the surveyor sees
 *  the unit without a backend round-trip. */
export function formatTime(time: string, units: SunUnits): string {
  return units === 'utc' ? `${time} UTC` : time;
}

interface SunInfo { sunrise: string; sunset: string; daylight_hours: number; location_label: string; }

function SunCalculatorWidget({ size, content }: WidgetProps<SunCalculatorContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const latitude = resolveLatitude(content);
  const longitude = resolveLongitude(content);
  const units = resolveUnits(content);
  const showTwilight = resolveShowTwilight(content);
  const [info, setInfo] = useState<SunInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    const url = `/api/admin/sun${buildSunQuery(latitude, longitude)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setInfo({ sunrise: '6:32 AM', sunset: '8:14 PM', daylight_hours: 13.7, location_label: 'Austin, TX' });
        return;
      }
      const data = await res.json();
      setInfo(data);
    } catch {
      setInfo({ sunrise: '6:32 AM', sunset: '8:14 PM', daylight_hours: 13.7, location_label: 'Austin, TX' });
    }
  }, [latitude, longitude]);
  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  if (!info) return <WidgetSkeleton rows={2} />;

  // Tiny — daylight hours only (the bigger metric); sunrise/sunset
  // pair won't fit alongside.
  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>
          {info.daylight_hours.toFixed(1)}h
        </span>
        <span style={tinyStatLabelStyle()}>daylight</span>
      </div>
    );
  }

  // Small+ — sunrise + sunset pair with bucket-scaled font; medium+
  // shows the location line.
  const pairFontSize =
    bucket === 'small'  ? 'var(--hub-font-base, 1rem)' :
    bucket === 'medium' ? 'var(--hub-font-lg, 1.125rem)' :
    bucket === 'large'  ? '1.5rem' :
                           '1.75rem';
  const showLocation = bucket !== 'small';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-warning)' }}>↑ {formatTime(info.sunrise, units)}</span>
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-accent)' }}>↓ {formatTime(info.sunset, units)}</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        {info.daylight_hours.toFixed(1)} hours daylight
        {showLocation && ` · ${info.location_label}`}
      </span>
      {showTwilight && (
        <span
          style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', fontStyle: 'italic' }}
          data-testid="sun-calculator-twilight"
        >
          Civil twilight: ~30 min before sunrise / after sunset
        </span>
      )}
    </div>
  );
}

defineWidget<SunCalculatorContent>({
  id: 'sun-calculator',
  label: 'Sun Calculator',
  description: 'Sunrise / sunset + daylight hours.',
  category: 'personal',
  iconName: 'Sun',
  defaultSize: { w: 3, h: 1 },
  // Slice 212 — minSize lowered to 1×1 with the tiny daylight mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: SunCalculatorWidget,
});
