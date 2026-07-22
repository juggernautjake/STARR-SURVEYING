'use client';
// SectionsManager — the custom-sections surface for the ROUTE-persisted sheets (PF2, IG) (D-13).
//
// The 5e sheet edits custom sections through its live store (`setChar` autosaves every keystroke). The
// bespoke PF2/IG sheets have no such store — like the roller/layout pickers, they persist by POSTing to a
// server route and reloading. Live per-keystroke POSTs would be unusable, so this manager BUFFERS edits in
// local state and commits the whole array on an explicit "Save changes" (mirroring how those sheets already
// save). The renderer + editor (`CustomSectionView`) and all mutations (`custom-sections.ts`) are shared
// with 5e, so the authoring experience is identical; only the persistence differs.
import React from 'react';
import CustomSectionView from './CustomSectionView';
import {
  normalizeCustomSections,
  addSection,
  type CustomSection,
} from '@/lib/dnd/custom-sections';

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const btn: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
  background: 'none', border: `1px solid ${LINE}`, color: 'inherit',
};

export default function SectionsManager({
  characterId,
  initial,
  canWrite,
}: {
  characterId: string | null | undefined;
  initial: CustomSection[];
  canWrite?: boolean;
}) {
  const clean = React.useMemo(() => normalizeCustomSections(initial), [initial]);
  const [sections, setSections] = React.useState<CustomSection[]>(clean);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Re-seed if the server data changes underneath us (e.g. after a reload).
  React.useEffect(() => setSections(clean), [clean]);

  const dirty = JSON.stringify(sections) !== JSON.stringify(clean);

  const save = async () => {
    if (!characterId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      });
      if (!r.ok) throw new Error(String(r.status));
      window.location.reload();
    } catch {
      setSaving(false);
      setError('Could not save. Please try again.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {sections.length === 0 && (
        <p style={{ opacity: 0.65, fontSize: 13.5 }}>
          No custom sections yet.{canWrite ? ' Add one to track anything the sheet doesn’t already — a vehicle, a contact list, downtime notes.' : ''}
        </p>
      )}
      {sections.map((s) => (
        <div key={s.id} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            {s.icon ? `${s.icon} ` : ''}
            {s.title}
          </div>
          <CustomSectionView
            section={s}
            editable={canWrite}
            onChange={(next) => setSections((cur) => cur.map((x) => (x.id === next.id ? next : x)))}
            onDelete={() => setSections((cur) => cur.filter((x) => x.id !== s.id))}
          />
        </div>
      ))}
      {canWrite && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
          <button type="button" style={btn} onClick={() => setSections((cur) => addSection(cur))}>
            ＋ Add section
          </button>
          <button
            type="button"
            style={{ ...btn, opacity: dirty && !saving ? 1 : 0.5, cursor: dirty && !saving ? 'pointer' : 'default', borderColor: dirty ? 'var(--hx-gold-1, ' + LINE + ')' : LINE }}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          {error && <span style={{ color: 'var(--hx-danger, #c0392b)', fontSize: 12.5 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
