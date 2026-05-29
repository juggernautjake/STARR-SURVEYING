'use client';
// app/admin/profile/components/DensityPicker.tsx
//
// Three-button radio that picks the hub density. Saves immediately
// via PUT /api/admin/me/hub-layout, echoing the rest of the layout
// fields so we don't clobber widgets / theme / fontScale.
//
// Slice 86 of customizable-hub-and-work-mode-2026-05-28.md.

import { useEffect, useState } from 'react';
import type { Density, HubLayoutRow } from '@/lib/hub/types';

const OPTIONS: { value: Density; label: string; description: string }[] = [
  { value: 'compact', label: 'Compact', description: 'Tight spacing, smaller text. Maxes info density.' },
  { value: 'comfortable', label: 'Comfortable', description: 'Default. Balanced spacing for most users.' },
  { value: 'spacious', label: 'Spacious', description: 'Larger spacing + text. Easier on the eyes.' },
];

interface DensityPickerProps {
  initialDensity: Density;
}

export function DensityPicker({ initialDensity }: DensityPickerProps) {
  const [selected, setSelected] = useState<Density>(initialDensity);
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

  async function pick(next: Density) {
    setSelected(next);
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
          density: next,
          fontScale: layout?.fontScale ?? 1.0,
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
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--theme-fg-primary)' }}>
        Density
      </h3>
      <div role="radiogroup" aria-label="Hub density" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={saving}
              onClick={() => pick(opt.value)}
              style={{
                flex: '1 1 160px',
                textAlign: 'left',
                padding: '0.65rem 0.85rem',
                border: `2px solid ${active ? 'var(--theme-accent)' : 'var(--theme-border)'}`,
                background: 'var(--theme-bg-surface)',
                color: 'var(--theme-fg-primary)',
                borderRadius: 8,
                cursor: saving ? 'progress' : 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{opt.label}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--theme-fg-secondary)', marginTop: 2 }}>
                {opt.description}
              </div>
            </button>
          );
        })}
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
