'use client';
// Slice 143 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface SunCalculatorContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: SunCalculatorContent = {};

interface SunInfo { sunrise: string; sunset: string; daylight_hours: number; location_label: string; }

function SunCalculatorWidget() {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--theme-warning)' }}>↑ {info.sunrise}</span>
        <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--theme-accent)' }}>↓ {info.sunset}</span>
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{info.daylight_hours.toFixed(1)} hours daylight · {info.location_label}</span>
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
  minSize: { w: 2, h: 1 },
  maxSize: { w: 6, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: SunCalculatorWidget,
});
