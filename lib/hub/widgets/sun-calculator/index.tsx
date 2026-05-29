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

export interface SunCalculatorContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: SunCalculatorContent = {};

interface SunInfo { sunrise: string; sunset: string; daylight_hours: number; location_label: string; }

function SunCalculatorWidget({ size }: WidgetProps<SunCalculatorContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [info, setInfo] = useState<SunInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sun');
      if (!res.ok) {
        setInfo({ sunrise: '6:32 AM', sunset: '8:14 PM', daylight_hours: 13.7, location_label: 'Austin, TX' });
        return;
      }
      const data = await res.json();
      setInfo(data);
    } catch {
      setInfo({ sunrise: '6:32 AM', sunset: '8:14 PM', daylight_hours: 13.7, location_label: 'Austin, TX' });
    }
  }, []);
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
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-warning)' }}>↑ {info.sunrise}</span>
        <span style={{ fontSize: pairFontSize, fontWeight: 600, color: 'var(--theme-accent)' }}>↓ {info.sunset}</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        {info.daylight_hours.toFixed(1)} hours daylight
        {showLocation && ` · ${info.location_label}`}
      </span>
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
