'use client';

// SupplementalInfoFields — the "+ Add more info" category picker (plan H2, owner 2026-09-05).
//
// Property ID and address are the MAIN search keys entered elsewhere in the form. This adds the
// SUPPLEMENTAL identifiers — key names, volume/page, instrument numbers, plat cabinet/slide — that help
// search and verify the property (and its neighbours) but are taken "with a grain of salt": they never
// reject a document. Each "+ Add more info" click asks the user to pick a CATEGORY, then appends a line
// with the right field(s). The user can add as many lines as they want, of any mix, and remove any.

import { useRef, useState } from 'react';

export type InfoCategory = 'name' | 'volume_page' | 'instrument' | 'cabinet_slide';

export interface SupplementalLine {
  key: string;
  category: InfoCategory;
  name?: string;
  volume?: string;
  page?: string;
  instrument?: string;
  cabinet?: string;
  slide?: string;
}

/** The structured supplemental info the run consumes — main keys (id/address) live elsewhere. */
export interface SupplementalInfoValue {
  instrumentNumbers: string[];
  ownerNames: string[];
  volumePages: Array<{ volume: string; page: string }>;
  cabinetSlides: Array<{ cabinet: string; slide: string }>;
}

export const CATEGORY_OPTIONS: Array<{ id: InfoCategory; label: string }> = [
  { id: 'name', label: 'Key name' },
  { id: 'volume_page', label: 'Volume / Page' },
  { id: 'instrument', label: 'Instrument number' },
  { id: 'cabinet_slide', label: 'Plat cabinet / slide' },
];

/** Fold the UI lines into the structured supplemental info the run consumes (empty lines dropped). */
export function linesToSupplemental(lines: SupplementalLine[]): SupplementalInfoValue {
  const out: SupplementalInfoValue = { instrumentNumbers: [], ownerNames: [], volumePages: [], cabinetSlides: [] };
  for (const l of lines) {
    if (l.category === 'name' && l.name?.trim()) out.ownerNames.push(l.name.trim());
    else if (l.category === 'instrument' && l.instrument?.trim()) out.instrumentNumbers.push(l.instrument.trim());
    else if (l.category === 'volume_page' && (l.volume?.trim() || l.page?.trim())) out.volumePages.push({ volume: (l.volume ?? '').trim(), page: (l.page ?? '').trim() });
    else if (l.category === 'cabinet_slide' && (l.cabinet?.trim() || l.slide?.trim())) out.cabinetSlides.push({ cabinet: (l.cabinet ?? '').trim(), slide: (l.slide ?? '').trim() });
  }
  return out;
}

const inputStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 14, minWidth: 0 };

export default function SupplementalInfoFields({
  lines,
  onChange,
}: {
  lines: SupplementalLine[];
  onChange: (lines: SupplementalLine[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const counter = useRef(0);

  const addLine = (category: InfoCategory) => {
    counter.current += 1;
    onChange([...lines, { key: `sup-${counter.current}`, category }]);
    setPicking(false);
  };
  const update = (key: string, patch: Partial<SupplementalLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  return (
    <div data-testid="supplemental-info">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>More info to search by (optional)</div>
      <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 8px' }}>
        Property ID and address are the main keys. Instrument numbers, names, volume/page and plat
        cabinet/slide help find and verify records — the more you add, the more chance some of it
        won&apos;t line up, so it&apos;s used as a hint, never to rule a document out.
      </p>

      {lines.map((l) => (
        <div key={l.key} data-testid={`supplemental-line-${l.category}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#475569', minWidth: 120 }}>
            {CATEGORY_OPTIONS.find((c) => c.id === l.category)?.label}
          </span>
          {l.category === 'name' && (
            <input aria-label="Key name" placeholder="e.g. George W. Ferrell" style={inputStyle}
              value={l.name ?? ''} onChange={(e) => update(l.key, { name: e.target.value })} />
          )}
          {l.category === 'instrument' && (
            <input aria-label="Instrument number" placeholder="e.g. 2020-1234" style={inputStyle}
              value={l.instrument ?? ''} onChange={(e) => update(l.key, { instrument: e.target.value })} />
          )}
          {l.category === 'volume_page' && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input aria-label="Volume" placeholder="Vol" style={{ ...inputStyle, width: 80 }}
                value={l.volume ?? ''} onChange={(e) => update(l.key, { volume: e.target.value })} />
              <span aria-hidden>/</span>
              <input aria-label="Page" placeholder="Page" style={{ ...inputStyle, width: 80 }}
                value={l.page ?? ''} onChange={(e) => update(l.key, { page: e.target.value })} />
            </span>
          )}
          {l.category === 'cabinet_slide' && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input aria-label="Cabinet" placeholder="Cabinet" style={{ ...inputStyle, width: 90 }}
                value={l.cabinet ?? ''} onChange={(e) => update(l.key, { cabinet: e.target.value })} />
              <span aria-hidden>/</span>
              <input aria-label="Slide" placeholder="Slide" style={{ ...inputStyle, width: 100 }}
                value={l.slide ?? ''} onChange={(e) => update(l.key, { slide: e.target.value })} />
            </span>
          )}
          <button type="button" aria-label="Remove" onClick={() => remove(l.key)}
            style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ))}

      {picking ? (
        <div data-testid="category-chooser" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#475569' }}>Add:</span>
          {CATEGORY_OPTIONS.map((c) => (
            <button key={c.id} type="button" onClick={() => addLine(c.id)}
              style={{ padding: '5px 10px', border: '1px solid #2563EB', borderRadius: 6, background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 13 }}>
              {c.label}
            </button>
          ))}
          <button type="button" onClick={() => setPicking(false)} style={{ border: 'none', background: 'none', color: '#64748B', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        </div>
      ) : (
        <button type="button" data-testid="add-more-info" onClick={() => setPicking(true)}
          style={{ padding: '6px 12px', border: '1px dashed #94A3B8', borderRadius: 6, background: '#F8FAFC', color: '#334155', cursor: 'pointer', fontSize: 13 }}>
          + Add more info
        </button>
      )}
    </div>
  );
}
