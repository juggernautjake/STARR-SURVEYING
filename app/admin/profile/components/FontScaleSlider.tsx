'use client';
// app/admin/profile/components/FontScaleSlider.tsx
//
// Range slider for the hub font scale [0.875, 1.5]. Steps in 0.0625
// increments (16 steps total) so the user can pick whole-half-quarter
// values without overshooting. Saves immediately on release (`onMouseUp`
// / `onBlur` rather than every drag tick — otherwise we'd hit the API
// hundreds of times per slider drag).
//
// Slice 86 of customizable-hub-and-work-mode-2026-05-28.md.

import { useEffect, useState } from 'react';
import type { HubLayoutRow } from '@/lib/hub/types';

const MIN = 0.875;
const MAX = 1.5;
const STEP = 0.0625;

interface FontScaleSliderProps {
  initialFontScale: number;
}

export function FontScaleSlider({ initialFontScale }: FontScaleSliderProps) {
  const [value, setValue] = useState<number>(clamp(initialFontScale));
  const [layout, setLayout] = useState<HubLayoutRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/me/hub-layout', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { layout: HubLayoutRow | null };
        if (!cancelled) setLayout(data.layout);
      } catch {
        /* best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save(next: number) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/me/hub-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgets: layout?.widgets ?? [],
          activePersona: layout?.activePersona ?? null,
          theme: layout?.theme ?? 'starr-default',
          customTheme: layout?.customTheme ?? null,
          density: layout?.density ?? 'comfortable',
          fontScale: clamp(next),
          hubSettings: layout?.hubSettings ?? {},
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(err?.error ?? `Save failed (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { layout: HubLayoutRow };
      setLayout(data.layout);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--theme-fg-primary)' }}>
          Font scale
        </h3>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--theme-fg-secondary)' }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        onMouseUp={() => void save(value)}
        onTouchEnd={() => void save(value)}
        onBlur={() => void save(value)}
        disabled={saving}
        aria-label="Hub font scale"
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--theme-fg-muted)' }}>
        <span>87.5%</span>
        <span>100%</span>
        <span>150%</span>
      </div>
      {error && (
        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--color-error-bg)', color: 'var(--color-error)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {savedFlash && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#059669' }}>✓ Saved.</div>
      )}
    </div>
  );
}

function clamp(raw: number): number {
  if (!Number.isFinite(raw)) return 1.0;
  if (raw < MIN) return MIN;
  if (raw > MAX) return MAX;
  return raw;
}
