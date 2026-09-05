'use client';

// app/admin/research/components/GatherSelectionsField.tsx — the "what to find" checklist (plan S3).
//
// The operator picks which items the gather run should find, for the subject property and optionally
// for the adjoining properties. Mirrors the worker's GatherSelections (keys guarded by
// run-settings-mirror.test). Default is all_files with adjoiners off.

export type GatherSelectionKey =
  | 'recent_deed' | 'recent_easement' | 'recent_plat'
  | 'google_map' | 'gis_satellite' | 'gis_parcel'
  | 'all_deeds' | 'all_plats' | 'all_files';

export interface GatherSelectionsValue {
  items: GatherSelectionKey[];
  adjoiners: { enabled: boolean; items: GatherSelectionKey[] };
}

/** The checklist, grouped for the UI. Order is stable so the form reads the same every time. */
export const SELECTION_OPTIONS: Array<{ group: string; options: Array<{ key: GatherSelectionKey; label: string }> }> = [
  {
    group: 'Documents',
    options: [
      { key: 'all_files', label: 'All files (everything below)' },
      { key: 'recent_plat', label: 'Most recent plat' },
      { key: 'all_plats', label: 'All plats' },
      { key: 'recent_deed', label: 'Most recent deed' },
      { key: 'all_deeds', label: 'All deeds' },
      { key: 'recent_easement', label: 'Most recent easement' },
    ],
  },
  {
    group: 'Maps & imagery',
    options: [
      { key: 'google_map', label: 'Google map view' },
      { key: 'gis_satellite', label: 'GIS overhead (satellite)' },
      { key: 'gis_parcel', label: 'GIS parcel map' },
    ],
  },
];

/** Add or remove a key from a selection list (pure — the reducer the checkboxes use). */
export function toggleKey(keys: GatherSelectionKey[], key: GatherSelectionKey, on: boolean): GatherSelectionKey[] {
  const set = new Set(keys);
  if (on) set.add(key); else set.delete(key);
  // Keep a stable order matching SELECTION_OPTIONS.
  const order = SELECTION_OPTIONS.flatMap((g) => g.options.map((o) => o.key));
  return order.filter((k) => set.has(k));
}

export const DEFAULT_GATHER_SELECTIONS_VALUE: GatherSelectionsValue = {
  items: ['all_files'],
  adjoiners: { enabled: false, items: [] },
};

export interface GatherSelectionsFieldProps {
  value: GatherSelectionsValue;
  onChange: (next: GatherSelectionsValue) => void;
}

function Checklist({
  selected,
  onToggle,
  idPrefix,
}: {
  selected: GatherSelectionKey[];
  onToggle: (key: GatherSelectionKey, on: boolean) => void;
  idPrefix: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {SELECTION_OPTIONS.map((g) => (
        <fieldset key={g.group} style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.6, marginBottom: '0.25rem' }}>{g.group}</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.25rem 0.75rem' }}>
            {g.options.map((o) => (
              <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  id={`${idPrefix}-${o.key}`}
                  checked={selected.includes(o.key)}
                  onChange={(e) => onToggle(o.key, e.target.checked)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function GatherSelectionsField({ value, onChange }: GatherSelectionsFieldProps) {
  return (
    <div data-testid="gather-selections" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>What should this run find?</div>
        <Checklist
          idPrefix="subject"
          selected={value.items}
          onToggle={(key, on) => onChange({ ...value, items: toggleKey(value.items, key, on) })}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={value.adjoiners.enabled}
          onChange={(e) => onChange({ ...value, adjoiners: { ...value.adjoiners, enabled: e.target.checked } })}
        />
        <strong>Also research the adjoining properties</strong>
      </label>

      {value.adjoiners.enabled && (
        <div style={{ borderLeft: '3px solid var(--border, #e5e7eb)', paddingLeft: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.35rem' }}>For each adjoining property, find:</div>
          <Checklist
            idPrefix="adjoiner"
            selected={value.adjoiners.items}
            onToggle={(key, on) => onChange({ ...value, adjoiners: { ...value.adjoiners, items: toggleKey(value.adjoiners.items, key, on) } })}
          />
        </div>
      )}
    </div>
  );
}
