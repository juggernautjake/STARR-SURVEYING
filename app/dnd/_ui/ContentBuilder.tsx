'use client';
// ContentBuilder — the Studio's authoring form (P6-6).
//
// The owner's ask: *"the user should first select what kind of thing they are homebrewing … as well as the
// system … Then depending on what they choose, the building options will totally adjust to allow them to
// have full control over every aspect."*
//
// So this component renders **whatever `lib/dnd/homebrew/kinds.ts` says**, and knows nothing about any
// specific kind. Adding a buildable kind is a data change in the registry, never a change here — which is
// the only way eighteen kinds × four systems stays maintainable, and the single design decision the
// Studio rests on.
//
// HONEST ABOUT WHAT IT CANNOT YET DO. Five field types in the registry need bespoke editors (`effects`,
// `levels`, `statblock`, `image`, `list`). Those are later slices. Rather than render a text box that
// *looks* like it captures a statblock and silently drops it, each renders a labelled placeholder saying
// which slice builds it. A form that appears to accept input it discards is worse than one that admits the
// gap — the author would only find out after saving.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import {
  fieldsForKind, sectionsForKind, blankDraftFor, validateDraftFields, proseOnlyNotice,
  systemChoicesForKind, kindSpec, type FieldSpec,
} from '@/lib/dnd/homebrew/kinds';
import type { HomebrewKind } from '@/lib/dnd/homebrew/model';

/** Field types with a real editor today. Everything else is declared, shown, and marked as owed. */
const IMPLEMENTED = new Set(['text', 'textarea', 'number', 'select', 'tags', 'abilities', 'skills', 'dice', 'image']);

/** Which slice builds each of the remaining editors — named so the placeholder is a pointer, not an apology. */
const OWED_BY: Record<string, string> = {
  effects: 'P6-9', levels: 'P6-12', statblock: 'P6-13', list: 'P6-12',
};

export default function ContentBuilder({
  kind,
  system,
  availableSystems,
}: {
  kind: HomebrewKind;
  system: string;
  availableSystems: { key: string; name: string }[];
}) {
  const router = useRouter();
  const spec = kindSpec(kind);
  const fields = useMemo(() => fieldsForKind(kind), [kind]);
  const sections = useMemo(() => sectionsForKind(kind), [kind]);
  const systemOptions = useMemo(() => systemChoicesForKind(kind, availableSystems), [kind, availableSystems]);

  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...blankDraftFor(kind), name: '' }));
  const [sys, setSys] = useState(system);
  const [visibility, setVisibility] = useState('private');
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Artwork chosen before the piece exists. Uploaded immediately after creation — see the `image` branch. */
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const prose = proseOnlyNotice(kind, sys);

  /** `showWhen` gives one hop of conditionality — enough for "spellcasting ability only if it casts". */
  const visible = (f: FieldSpec) =>
    !f.showWhen || f.showWhen.equals.includes(String(values[f.showWhen.key] ?? ''));

  async function save() {
    const name = String(values.name ?? '').trim();
    const errs = [...(name ? [] : ['A name is required.']), ...validateDraftFields(kind, values)];
    if (errs.length) { setProblems(errs); return; }
    setSaving(true); setProblems([]);
    try {
      const r = await fetch('/api/dnd/homebrew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, kind, system: sys, name, visibility }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setProblems(j.problems ?? [j.error ?? 'Could not save that.']); setSaving(false); return; }

      // The piece exists now, so the artwork has somewhere to go. A failed IMAGE upload must not read as a
      // failed SAVE — the content is already stored, and telling the author otherwise would have them redo
      // work that is safely in the database. Report it and continue to the piece, where they can retry.
      if (pendingImage) {
        const fd = new FormData();
        fd.append('file', pendingImage);
        const ir = await fetch(`/api/dnd/homebrew/${j.content.id}/image`, { method: 'POST', body: fd });
        if (!ir.ok) {
          const ij = await ir.json().catch(() => ({}));
          setProblems([`Saved, but the image did not upload: ${ij.error ?? 'unknown error'}. You can add it again from the piece.`]);
        }
      }

      router.push(`/dnd/content/${j.content.id}`);
    } catch {
      setProblems(['Network error — please try again.']); setSaving(false);
    }
  }

  const label = { fontSize: 11.5, letterSpacing: '0.06em', color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' } as const;
  const help = { fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.45 } as const;

  function renderField(f: FieldSpec) {
    if (!visible(f)) return null;
    const v = values[f.key];
    const common = { className: styles.input, id: `hb-${f.key}`, style: { width: '100%', padding: '8px 10px' } };

    if (!IMPLEMENTED.has(f.type)) {
      return (
        <div key={f.key} style={{ display: 'grid', gap: 4 }}>
          <span style={label}>{f.label}</span>
          <div style={{ border: '1px dashed var(--hx-line)', padding: '9px 11px', borderRadius: 3, background: 'rgba(1,10,19,0.3)' }}>
            <span style={{ ...help, display: 'block' }}>
              The <strong style={{ color: 'var(--hx-teal-1)' }}>{f.type}</strong> editor is not built yet
              ({OWED_BY[f.type] ?? 'a later slice'}). Nothing you type here would be saved, so there is no box —
              describe it in <strong style={{ color: 'var(--hx-gold-2)' }}>Full rules text</strong> for now and
              it becomes editable when that slice lands.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div key={f.key} style={{ display: 'grid', gap: 4 }}>
        <label htmlFor={`hb-${f.key}`} style={label}>{f.label}{f.required && <span style={{ color: 'var(--hx-teal-1)' }}> *</span>}</label>
        {f.help && <span style={help}>{f.help}</span>}

        {f.type === 'textarea' && (
          <textarea {...common} rows={6} value={String(v ?? '')} placeholder={f.placeholder}
            onChange={(e) => set(f.key, e.target.value)} style={{ ...common.style, resize: 'vertical' }} />
        )}
        {(f.type === 'text' || f.type === 'dice') && (
          <input {...common} value={String(v ?? '')} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
        )}
        {f.type === 'number' && (
          <input {...common} type="number" min={f.min} max={f.max} step={f.step}
            value={v == null ? '' : String(v)}
            onChange={(e) => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />
        )}
        {f.type === 'select' && (
          <select {...common} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {f.type === 'tags' && (
          // Comma-separated in, array out. A tag pill editor is nicer and is not worth a slice of its own
          // yet; this stores the same shape, so replacing it later changes no data.
          <input {...common} value={Array.isArray(v) ? (v as string[]).join(', ') : String(v ?? '')}
            placeholder={f.placeholder ?? 'comma, separated'}
            onChange={(e) => set(f.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
        )}
        {f.type === 'image' && (
          // The upload endpoint is per-piece, so it needs an id — which does not exist until the first
          // save. Rather than fake it (a staged file that silently vanishes if the save fails, which is the
          // exact "looks like it worked" failure the placeholders exist to avoid), the file is picked here
          // and POSTed straight after the piece is created. `pendingImage` carries it across that boundary.
          <div style={{ display: 'grid', gap: 5 }}>
            <input
              id={`hb-${f.key}`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setPendingImage(e.target.files?.[0] ?? null)}
              style={{ fontSize: 12.5, color: 'var(--hx-text)' }}
            />
            {pendingImage && (
              <span style={{ ...help, color: 'var(--hx-teal-1)' }}>
                “{pendingImage.name}” uploads when you save.
              </span>
            )}
          </div>
        )}
        {(f.type === 'abilities' || f.type === 'skills') && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(f.options ?? []).map((o) => {
              const on = Array.isArray(v) && (v as string[]).includes(o.value);
              return (
                <button key={o.value} type="button"
                  onClick={() => set(f.key, on ? (v as string[]).filter((x) => x !== o.value) : [...((v as string[]) ?? []), o.value])}
                  aria-pressed={on}
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                    border: on ? '1px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
                    background: on ? 'rgba(10,200,185,0.14)' : 'rgba(255,255,255,0.03)',
                    color: on ? 'var(--hx-teal-1)' : 'var(--hx-text)',
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
        <div className={styles.framedPanelTop} />
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="hb-name" style={label}>Name <span style={{ color: 'var(--hx-teal-1)' }}>*</span></label>
          <input className={styles.input} id="hb-name" style={{ width: '100%', padding: '8px 10px' }}
            value={String(values.name ?? '')} onChange={(e) => set('name', e.target.value)}
            placeholder={`What is this ${spec.kind} called?`} />
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="hb-system" style={label}>System</label>
          <select className={styles.input} id="hb-system" style={{ width: '100%', padding: '8px 10px' }}
            value={sys} onChange={(e) => setSys(e.target.value)}>
            {systemOptions.map((o) => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
          </select>
        </div>

        {/* The honesty layer from the registry: when a kind cannot carry mechanics in the chosen system,
            say so HERE, before the author spends an hour on it — not by silently dropping the payload. */}
        {prose && (
          <p style={{
            margin: 0, fontSize: 12.5, lineHeight: 1.55, padding: '9px 11px', borderRadius: 3,
            border: '1px solid var(--hx-gold-1)', background: 'rgba(200,155,60,0.07)', color: 'var(--hx-text)',
          }}>
            {prose}
          </p>
        )}

        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="hb-visibility" style={label}>Who can see it</label>
          <select className={styles.input} id="hb-visibility" style={{ width: '100%', padding: '8px 10px' }}
            value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="private">Private — only me</option>
            <option value="unlisted">Unlisted — anyone with the link</option>
            <option value="public">Public — listed for everyone, and in the rules library</option>
          </select>
          <span style={help}>You can change this at any time. Publishing also puts it in its system’s library.</span>
        </div>
      </section>

      {sections.map((section) => {
        const inSection = fields.filter((f) => (f.section ?? '') === section && f.key !== 'name');
        if (!inSection.length) return null;
        return (
          <section key={section || 'main'} className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 14 }}>
            <div className={styles.framedPanelTop} />
            {section && <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>{section}</h2>}
            {inSection.map(renderField)}
          </section>
        );
      })}

      {problems.length > 0 && (
        <div className={styles.framedPanel} style={{ padding: '12px 14px', borderColor: 'var(--hx-danger, #ff6b6b)' }}>
          <strong style={{ color: 'var(--hx-danger, #ff6b6b)', fontSize: 13 }}>Fix these first</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--hx-text)', fontSize: 12.5, lineHeight: 1.6 }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={save} disabled={saving} style={{ padding: '10px 20px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ ...help, alignSelf: 'center' }}>
          Save whenever you like — an unfinished piece is kept as a draft, not thrown away.
        </span>
      </div>
    </div>
  );
}
