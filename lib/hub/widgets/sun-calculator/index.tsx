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

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

/** Format a sun time for display. The endpoint now returns ISO-8601 UTC
 *  timestamps, so when `time` is ISO we render the clock time in the
 *  surveyor's local zone (units='local') or UTC (units='utc', suffixed).
 *  A non-ISO string (e.g. the widget's offline fallback "6:32 AM") keeps
 *  the original passthrough behaviour — just a " UTC" suffix when asked. */
export function formatTime(time: string, units: SunUnits): string {
  if (ISO_RE.test(time)) {
    const d = new Date(time);
    if (!Number.isNaN(d.getTime())) {
      const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
      if (units === 'utc') {
        return `${d.toLocaleTimeString('en-US', { ...opts, timeZone: 'UTC' })} UTC`;
      }
      return d.toLocaleTimeString('en-US', opts);
    }
  }
  return units === 'utc' ? `${time} UTC` : time;
}

interface SunInfo { sunrise: string | null; sunset: string | null; daylight_hours: number; location_label: string; }

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
      <div style={tinyStatWrapStyle()} data-testid="sun-calculator-tiny">
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
  // Slice S6 — at medium+ surface a "next event in …" countdown
  // (next sunrise OR next sunset), and at large+ render a daylight
  // progress bar showing how much of today's daylight is still
  // ahead. Both are null-safe so a non-ISO time payload (offline
  // fallback) keeps the rest of the widget rendering.
  const showCountdown = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showDaylightBar = bucket === 'large' || bucket === 'xlarge';
  const countdown = nextSunEvent(info.sunrise, info.sunset, Date.now());
  const daylight = daylightProgress(info.sunrise, info.sunset, Date.now());

  return (
    <div
      data-testid={`sun-calculator-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, height: '100%' }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-warning)' }}>↑ {info.sunrise ? formatTime(info.sunrise, units) : '—'}</span>
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-accent)' }}>↓ {info.sunset ? formatTime(info.sunset, units) : '—'}</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        {info.daylight_hours.toFixed(1)} hours daylight
        {showLocation && ` · ${info.location_label}`}
      </span>
      {showCountdown && countdown && (
        <span
          data-testid="sun-calculator-countdown"
          style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-primary)' }}
        >
          {countdown.kind === 'sunrise' ? '↑' : '↓'} Next {countdown.kind} in {formatCountdown(countdown.minutesFromNow)}
        </span>
      )}
      {showDaylightBar && daylight && (
        <div
          data-testid="sun-calculator-daylight-bar"
          aria-label={`Daylight progress ${daylight.percentComplete}%`}
          style={daylightBarTrackStyle}
        >
          <span style={{ ...daylightBarFillStyle, width: `${daylight.percentComplete}%` }} />
        </div>
      )}
      {/* Slice 16 — twilight row hides at small bucket regardless of
          the toggle: the existing sunrise/sunset/location lines
          already saturate the vertical room at that size. The toggle
          stays meaningful at medium+ buckets. */}
      {showTwilight && bucket !== 'small' && (
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

/** Pick the next upcoming sun event from sunrise + sunset ISO
 *  timestamps. Returns null when neither is parseable. Pure +
 *  exported. */
export function nextSunEvent(
  sunriseIso: string | null | undefined,
  sunsetIso: string | null | undefined,
  nowMs: number,
): { kind: 'sunrise' | 'sunset'; minutesFromNow: number } | null {
  const sunrise = parseIsoFuture(sunriseIso, nowMs);
  const sunset = parseIsoFuture(sunsetIso, nowMs);
  if (sunrise === null && sunset === null) return null;
  if (sunrise !== null && (sunset === null || sunrise <= sunset)) {
    return { kind: 'sunrise', minutesFromNow: Math.max(0, Math.round(sunrise / 60_000)) };
  }
  return { kind: 'sunset', minutesFromNow: Math.max(0, Math.round((sunset ?? 0) / 60_000)) };
}

/** Returns the daylight-progress fraction (0–100) for today between
 *  the two ISO timestamps. Returns null when either ISO is missing or
 *  the day hasn't started / has fully ended. Pure + exported. */
export function daylightProgress(
  sunriseIso: string | null | undefined,
  sunsetIso: string | null | undefined,
  nowMs: number,
): { percentComplete: number } | null {
  if (!sunriseIso || !sunsetIso) return null;
  const rise = Date.parse(sunriseIso);
  const set = Date.parse(sunsetIso);
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return null;
  if (nowMs <= rise) return { percentComplete: 0 };
  if (nowMs >= set) return { percentComplete: 100 };
  return { percentComplete: Math.round(((nowMs - rise) / (set - rise)) * 100) };
}

/** "1h 23m" / "5m" / "in <1m". Pure + exported. */
export function formatCountdown(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hr = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min === 0 ? `${hr}h` : `${hr}h ${min}m`;
}

function parseIsoFuture(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso || !ISO_RE.test(iso)) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const delta = t - nowMs;
  // Sun events repeat daily — accept anything in the next 24h.
  if (delta < 0 || delta > 24 * 3600 * 1000) return null;
  return delta;
}

const daylightBarTrackStyle: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  background: 'var(--theme-bg-elevated)',
  overflow: 'hidden',
  marginTop: 4,
};
const daylightBarFillStyle: React.CSSProperties = {
  display: 'block',
  height: '100%',
  background: 'linear-gradient(90deg, var(--theme-warning), var(--theme-accent))',
};

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
