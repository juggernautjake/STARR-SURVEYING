'use client';
// One uploaded design, opened: its profile (editable) and its resolution variations.
//
// ── THE PROFILE IS THE SAME SHAPE AS A BUILT-IN MARK'S ──────────────────────────────────────────
//
// Deliberately. The Logos tab has taught anybody using this page what a profile looks like — the
// mark, the colourway swatches, "Use it for", "Do not", the type, the minimum size. An uploaded
// design that presented its information in a different order would read as a different kind of
// thing, and it is not one: it is a mark that arrived by upload instead of by commit.
//
// The difference is that this one has an Edit state, because this one CAN be edited. That is the
// honest distinction between the two libraries and it is the only one the UI draws.
//
// ── THE VARIATIONS ARE THE OTHER HALF OF THE ASK ────────────────────────────────────────────────
//
// Owner: *"We should be able to add multiple resolution variations to it as well."*
//
// Two ways to get one, and they are genuinely different operations rather than two buttons for the
// same thing: generate from the original (a resize — fast, exact, and the common case), or upload a
// file (a variation that is not a resize — a redrawn small size with thicker strokes, a one-colour
// version). The ladder only offers sizes at or below the original's width; see `offeredSizes`.

import { useState } from 'react';
import { Check, Download, Loader2, Pencil, Ruler, Trash2, Type as TypeIcon, Palette as PaletteIcon, X, Plus, UploadCloud } from 'lucide-react';

import { colourByName } from '@/lib/branding/palette';
import {
  ACCEPT_ATTRIBUTE, UPLOAD_KINDS, UPLOAD_PLATES, UPLOAD_STATUSES,
  humanBytes, offeredSizes, uploadedAssetUrl, validateProfile,
  type BrandAsset, type UploadKind, type UploadPlate, type UploadStatus,
} from '@/lib/branding/uploads';
import { ChoiceRow, ColourPicker, FontPicker, ListEditor } from './fields';

const STATUS_OPTIONS: { id: UploadStatus; label: string; hint: string }[] = [
  { id: 'approved', label: 'In the kit', hint: 'Part of the brand system. Shown to everybody who can see this page.' },
  { id: 'draft', label: 'Work in progress', hint: 'Uploaded but not settled. Visible here, flagged as unfinished.' },
  { id: 'archived', label: 'Retired', hint: 'Kept for the record and hidden from the library.' },
];

export default function UploadedAssetPanel({
  asset, onChanged, onDeleted, onClose,
}: {
  asset: BrandAsset;
  onChanged: (next: BrandAsset) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => toDraft(asset));
  const [variantLabel, setVariantLabel] = useState('');

  const ladder = offeredSizes(asset.width);
  // A size the asset already has is not offered again — the unique-label constraint would refuse it
  // and the message would be about a label the person never typed.
  const have = new Set(asset.variants.map((v) => v.width).filter(Boolean) as number[]);

  async function call(kind: string, run: () => Promise<Response>) {
    setBusy(kind);
    setError(null);
    try {
      const res = await run();
      const json = await res.json() as { asset?: BrandAsset; error?: string; ok?: boolean };
      if (!res.ok) { setError(json.error ?? 'That did not work.'); return false; }
      if (json.asset) onChanged(json.asset);
      return true;
    } catch {
      setError('The request failed — check your connection.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile() {
    const problems = validateProfile(draft);
    if (problems.length > 0) { setError(problems[0]!.message); return; }
    const ok = await call('save', () => fetch(`/api/admin/branding/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }));
    if (ok) setEditing(false);
  }

  async function generate(width: number) {
    const body = new FormData();
    body.set('width', String(width));
    if (variantLabel.trim()) body.set('label', variantLabel.trim());
    const ok = await call(`gen-${width}`, () =>
      fetch(`/api/admin/branding/assets/${asset.id}/variants`, { method: 'POST', body }));
    if (ok) setVariantLabel('');
  }

  async function uploadVariant(file: File) {
    const body = new FormData();
    body.set('file', file);
    if (variantLabel.trim()) body.set('label', variantLabel.trim());
    const ok = await call('upload-variant', () =>
      fetch(`/api/admin/branding/assets/${asset.id}/variants`, { method: 'POST', body }));
    if (ok) setVariantLabel('');
  }

  async function removeVariant(id: string) {
    await call(`rm-${id}`, () =>
      fetch(`/api/admin/branding/assets/${asset.id}/variants/${id}`, { method: 'DELETE' }));
  }

  async function removeAsset() {
    // The one irreversible action on this page, and it takes the files with it. `confirm` rather
    // than a custom dialog: this is exactly the moment the browser's own blocking prompt is right,
    // and a prettier one that is easier to dismiss is not an improvement.
    if (!window.confirm(
      `Delete "${asset.name}" and all ${asset.variants.length} of its files? This cannot be undone.`
    )) return;
    const ok = await call('delete', () =>
      fetch(`/api/admin/branding/assets/${asset.id}`, { method: 'DELETE' }));
    if (ok) onDeleted(asset.id);
  }

  return (
    <div className="brand-profile">
      <button type="button" className="brand-profile__close" onClick={onClose} aria-label="Close">
        <X size={16} aria-hidden />
      </button>

      <div className="brand-profile__grid">
        {/* ── the design, and its files ───────────────────────────────────── */}
        <div>
          <div className={`brand-plate brand-plate--${asset.plate} brand-profile__preview`}>
            {/* A route URL, not a Next/Image: the bytes come through an authenticated handler that
                the optimiser cannot call on the server. See the header of the file route. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt={asset.name}
                 style={{ maxHeight: 250, maxWidth: '100%', width: 'auto', height: 'auto' }} />
          </div>

          <p className="brand-profile__label">
            <Ruler size={12} aria-hidden /> Resolutions — {asset.variants.length}
          </p>
          <div className="brand-variants">
            {asset.variants.map((v) => (
              <div className="brand-variants__row" key={v.id}>
                <span className="brand-variants__label">
                  {v.label}
                  {v.isOriginal && <span className="brand-tag brand-tag--quiet">original</span>}
                  {v.source === 'generated' && <span className="brand-tag brand-tag--quiet">generated</span>}
                </span>
                <span className="brand-variants__meta">
                  {v.width ? `${v.width}×${v.height ?? '?'}` : v.fileType.replace('image/', '')} · {humanBytes(v.bytes)}
                </span>
                <span className="brand-variants__acts">
                  <a href={`${uploadedAssetUrl(asset.id, v.id)}&download=1`} title="Download this size">
                    <Download size={13} aria-hidden />
                  </a>
                  {!v.isOriginal && (
                    <button type="button" title="Remove this size" disabled={busy === `rm-${v.id}`}
                            onClick={() => void removeVariant(v.id)}>
                      {busy === `rm-${v.id}` ? <Loader2 size={13} className="brand-spin" aria-hidden />
                                             : <Trash2 size={13} aria-hidden />}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* ── add a resolution ─────────────────────────────────────────── */}
          <p className="brand-profile__label"><Plus size={12} aria-hidden /> Add a resolution</p>

          <div className="brand-field">
            <input type="text" value={variantLabel} placeholder="Label (optional — defaults to the width)"
                   onChange={(e) => setVariantLabel(e.target.value)} />
          </div>

          {ladder === null ? (
            <p className="brand-field__hint">
              This file has no pixel size the server can read{asset.fileType === 'image/svg+xml' ? ' — an SVG is resolution-independent already' : ''}.
              Upload a variation as a file instead.
            </p>
          ) : ladder.length === 0 ? (
            <p className="brand-field__hint">
              The original is {asset.width}px wide, which is smaller than every size on the ladder.
              Generating a larger one would produce a bigger file with no more detail in it — upload
              a higher-resolution original instead.
            </p>
          ) : (
            <div className="brand-pick__opts">
              {ladder.map((s) => {
                const already = have.has(s.width);
                return (
                  <button type="button" key={s.width} title={already ? 'Already made' : s.use}
                          disabled={already || busy === `gen-${s.width}`}
                          className="brand-pick__opt"
                          onClick={() => void generate(s.width)}>
                    {busy === `gen-${s.width}` ? <Loader2 size={12} className="brand-spin" aria-hidden /> : null}
                    {s.label}{already ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          )}

          <label className="brand-btn brand-btn--file">
            <UploadCloud size={13} aria-hidden /> Upload a variation instead
            <input type="file" accept={ACCEPT_ATTRIBUTE} hidden
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVariant(f); e.target.value = ''; }} />
          </label>
          <p className="brand-field__hint">
            For a variation that is not a resize — a small size redrawn with thicker strokes, or a
            one-colour version for a single-ink print run.
          </p>
        </div>

        {/* ── the profile ─────────────────────────────────────────────────── */}
        <div className="brand-profile__text">
          {!editing ? (
            <>
              <h4 className="brand-profile__name">
                {asset.name}
                {asset.status !== 'approved' && (
                  <span className="brand-tag brand-tag--quiet">
                    {STATUS_OPTIONS.find((s) => s.id === asset.status)?.label ?? asset.status}
                  </span>
                )}
              </h4>

              {asset.description
                ? <p className="brand-profile__desc">{asset.description}</p>
                : <p className="brand-profile__desc brand-profile__desc--empty">
                    No description yet. Everything below the image is optional and can be filled in
                    whenever — press Edit.
                  </p>}

              {asset.useCases.length > 0 && (
                <>
                  <p className="brand-profile__label"><Check size={12} aria-hidden /> Use it for</p>
                  <ul className="brand-profile__list">{asset.useCases.map((u) => <li key={u}>{u}</li>)}</ul>
                </>
              )}

              {asset.avoid.length > 0 && (
                <>
                  <p className="brand-profile__label brand-profile__label--warn"><X size={12} aria-hidden /> Do not</p>
                  <ul className="brand-profile__list brand-profile__list--warn">
                    {asset.avoid.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}

              {asset.colours.length > 0 && (
                <>
                  <p className="brand-profile__label"><PaletteIcon size={12} aria-hidden /> Colours in this design</p>
                  <div className="brand-profile__chips">
                    {asset.colours.map((n) => {
                      const c = colourByName(n);
                      // A stored name the palette no longer has. The API validates on write, so this
                      // means somebody removed a colour from palette.ts afterwards — worth showing as
                      // a visible gap rather than skipping, because skipping hides the drift.
                      if (!c) return <span className="brand-profile__chip" key={n}>{n} <code>not in the palette</code></span>;
                      return (
                        <span className="brand-profile__chip" key={n}>
                          <span className="brand-profile__chip-dot" style={{ background: c.hex }} />
                          {c.name} <code>{c.hex}</code>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {asset.fonts.length > 0 && (
                <>
                  <p className="brand-profile__label"><TypeIcon size={12} aria-hidden /> Type</p>
                  <ul className="brand-profile__list">{asset.fonts.map((f) => <li key={f}>{f}</li>)}</ul>
                </>
              )}

              {asset.minSize && (
                <>
                  <p className="brand-profile__label"><Ruler size={12} aria-hidden /> Smallest reliable size</p>
                  <p className="brand-profile__minsize">{asset.minSize}</p>
                </>
              )}

              <p className="brand-profile__file">
                <code>{asset.originalFilename ?? asset.slug}</code>
                {asset.width ? ` · ${asset.width}×${asset.height}` : ''} · {humanBytes(asset.bytes)}
                {asset.createdBy ? ` · added by ${asset.createdBy}` : ''}
              </p>

              {error && <p className="brand-formerror" role="alert">{error}</p>}

              <div className="brand-upload__actions">
                <button type="button" className="brand-btn"
                        onClick={() => { setDraft(toDraft(asset)); setEditing(true); setError(null); }}>
                  <Pencil size={13} aria-hidden /> Edit the profile
                </button>
                <button type="button" className="brand-btn brand-btn--danger" disabled={busy === 'delete'}
                        onClick={() => void removeAsset()}>
                  {busy === 'delete' ? <Loader2 size={13} className="brand-spin" aria-hidden />
                                     : <Trash2 size={13} aria-hidden />} Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="brand-field">
                <label className="brand-field__label">Name</label>
                <input type="text" value={draft.name}
                       onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <ChoiceRow label="Kind" value={draft.kind}
                         onChange={(kind) => setDraft({ ...draft, kind })} options={UPLOAD_KINDS} />
              <ChoiceRow label="Shown on" value={draft.plate}
                         onChange={(plate) => setDraft({ ...draft, plate })} options={UPLOAD_PLATES} />
              <ChoiceRow label="Status" value={draft.status}
                         onChange={(status) => setDraft({ ...draft, status })} options={STATUS_OPTIONS} />

              <div className="brand-field">
                <label className="brand-field__label">Caption</label>
                <input type="text" value={draft.note} maxLength={300}
                       onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </div>

              <div className="brand-field">
                <label className="brand-field__label">Description</label>
                <textarea rows={5} value={draft.description}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>

              <ListEditor label="Use it for" items={draft.useCases} placeholder="Truck doors and yard signs"
                          onChange={(useCases) => setDraft({ ...draft, useCases })} />
              <ListEditor label="Do not" items={draft.avoid} placeholder="Anything under 1.25 inches"
                          onChange={(avoid) => setDraft({ ...draft, avoid })} />
              <ColourPicker selected={draft.colours} onChange={(colours) => setDraft({ ...draft, colours })} />
              <FontPicker selected={draft.fonts} onChange={(fonts) => setDraft({ ...draft, fonts })} />

              <div className="brand-field">
                <label className="brand-field__label">Smallest reliable size</label>
                <input type="text" value={draft.minSize}
                       onChange={(e) => setDraft({ ...draft, minSize: e.target.value })} />
              </div>

              {error && <p className="brand-formerror" role="alert">{error}</p>}

              <div className="brand-upload__actions">
                <button type="button" className="brand-btn brand-btn--primary" disabled={busy === 'save'}
                        onClick={() => void saveProfile()}>
                  {busy === 'save' ? <><Loader2 size={13} className="brand-spin" aria-hidden /> Saving…</>
                                   : 'Save the profile'}
                </button>
                <button type="button" className="brand-btn" onClick={() => { setEditing(false); setError(null); }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditDraft {
  name: string;
  kind: UploadKind;
  plate: UploadPlate;
  status: UploadStatus;
  note: string;
  description: string;
  useCases: string[];
  avoid: string[];
  colours: string[];
  fonts: string[];
  minSize: string;
}

/** The asset as an editable draft. Nulls become empty strings — a `null` in a controlled input is
 *  React's uncontrolled-to-controlled warning and, in practice, a field that will not type. */
function toDraft(a: BrandAsset): EditDraft {
  return {
    name: a.name,
    kind: a.kind,
    plate: a.plate,
    status: a.status,
    note: a.note ?? '',
    description: a.description ?? '',
    useCases: a.useCases,
    avoid: a.avoid,
    colours: a.colours,
    fonts: a.fonts,
    minSize: a.minSize ?? '',
  };
}
