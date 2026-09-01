'use client';
// Adding a design: pick the file, then either save it or describe it.
//
// ── TWO PATHS, ONE FORM ─────────────────────────────────────────────────────────────────────────
//
// Owner: *"when uploading, we can just upload the image, or we can fill out all of the color and
// font and use case and description information."*
//
// So the profile is COLLAPSED until asked for, and the save button is live from the moment a file
// is chosen. Both paths end at the same POST; the quick one simply sends fewer fields. The name
// pre-fills from the filename so even the quick path produces something findable rather than a row
// called "Untitled".
//
// The temptation was a wizard — file, then profile, then sizes, three screens. It reads well in a
// plan and it makes the one-second path take three clicks. The profile is one disclosure toggle,
// and the resolution ladder is not here at all: sizes are generated FROM the original, so they
// belong on the asset after it exists, not on the form that creates it.

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, ChevronDown, Loader2, X } from 'lucide-react';

import {
  ACCEPT_ATTRIBUTE, ACCEPTED_MIME, BRAND_UPLOAD_MAX_BYTES, UPLOAD_KINDS, UPLOAD_PLATES,
  humanBytes, validateProfile, type BrandAsset, type UploadKind, type UploadPlate,
} from '@/lib/branding/uploads';
import { ChoiceRow, ColourPicker, FontPicker, ListEditor } from './fields';

interface Draft {
  name: string;
  kind: UploadKind;
  plate: UploadPlate;
  note: string;
  description: string;
  useCases: string[];
  avoid: string[];
  colours: string[];
  fonts: string[];
  minSize: string;
}

const EMPTY: Draft = {
  name: '', kind: 'other', plate: 'white', note: '', description: '',
  useCases: [], avoid: [], colours: [], fonts: [], minSize: '',
};

export default function DesignUploadForm({ onAdded }: { onAdded: (asset: BrandAsset) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showProfile, setShowProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((f: File) => {
    setError(null);

    // Refuse here rather than after the transfer. `lib/storage/uploads.ts` was written about the
    // 375 MB video that sent every byte and was refused at 100% — the cheapest fix for that shape
    // of bug is checking before sending, and the browser already knows both facts.
    if (f.size > BRAND_UPLOAD_MAX_BYTES) {
      setError(`That file is ${humanBytes(f.size)}. The limit is ${humanBytes(BRAND_UPLOAD_MAX_BYTES)}.`);
      return;
    }
    if (!ACCEPTED_MIME[(f.type || '').toLowerCase()]) {
      setError(f.type
        ? `${f.type} is not a type this library takes. Send PNG, JPEG, WebP, GIF, SVG or PDF.`
        : 'The browser did not say what type that file is. Try a PNG or JPEG.');
      return;
    }

    setFile(f);
    // Revoked when it is replaced or cleared — an object URL that is never revoked holds the whole
    // file in memory for the life of the tab, and this page can see a lot of them in one sitting.
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    setDraft((d) => ({
      ...d,
      name: d.name || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
    }));
  }, []);

  const clear = useCallback(() => {
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setFile(null);
    setDraft(EMPTY);
    setShowProfile(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  async function save() {
    if (!file) return;

    // The same function the route runs. A different check here would mean a form that accepts what
    // the server rejects, which is how a person ends up staring at an error about a field the form
    // told them was fine.
    const problems = validateProfile({ ...draft, status: 'approved' });
    if (problems.length > 0) { setError(problems[0]!.message); return; }

    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('name', draft.name);
      // The profile fields go only when the profile was opened. Sending `kind: 'other'` from a
      // collapsed form would be the form asserting something nobody said.
      if (showProfile) {
        body.set('kind', draft.kind);
        body.set('plate', draft.plate);
        if (draft.note) body.set('note', draft.note);
        if (draft.description) body.set('description', draft.description);
        if (draft.minSize) body.set('minSize', draft.minSize);
        for (const v of draft.useCases) if (v.trim()) body.append('useCases', v);
        for (const v of draft.avoid) if (v.trim()) body.append('avoid', v);
        for (const v of draft.colours) body.append('colours', v);
        for (const v of draft.fonts) if (v.trim()) body.append('fonts', v);
      }

      const res = await fetch('/api/admin/branding/assets', { method: 'POST', body });
      const json = await res.json() as { asset?: BrandAsset; error?: string };
      if (!res.ok || !json.asset) {
        setError(json.error ?? 'The upload failed.');
        return;
      }
      onAdded(json.asset);
      clear();
    } catch {
      setError('The upload failed — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-upload">
      {!file ? (
        <div
          className={`brand-drop${dragOver ? ' brand-drop--over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept(f);
          }}
        >
          <UploadCloud size={30} aria-hidden />
          <p className="brand-drop__lede">Drop a design here, or</p>
          <button type="button" className="brand-btn brand-btn--primary"
                  onClick={() => inputRef.current?.click()}>
            Choose a file
          </button>
          <p className="brand-drop__note">
            PNG, JPEG, WebP, GIF, SVG or PDF · up to {humanBytes(BRAND_UPLOAD_MAX_BYTES)}. Resolution
            variations are generated from whatever you upload, so send the biggest version you have.
          </p>
          <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} hidden
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }} />
        </div>
      ) : (
        <div className="brand-upload__staged">
          <div className="brand-upload__preview">
            <div className={`brand-plate brand-plate--${showProfile ? draft.plate : 'mist'}`}>
              {/* A plain <img>: the file is a blob URL that exists only in this tab, which the
                  Next.js optimiser cannot fetch or transform. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview && <img src={preview} alt="" style={{ maxHeight: 190, maxWidth: '100%', width: 'auto', height: 'auto' }} />}
            </div>
            <p className="brand-upload__filemeta">
              <strong>{file.name}</strong><br />
              {file.type} · {humanBytes(file.size)}
            </p>
            <button type="button" className="brand-btn" onClick={clear} disabled={busy}>
              <X size={13} aria-hidden /> Choose a different file
            </button>
          </div>

          <div className="brand-upload__form">
            <div className="brand-field">
              <label className="brand-field__label" htmlFor="brand-upload-name">Name</label>
              <p className="brand-field__hint">
                Taken from the filename. It is what the card says and what search finds.
              </p>
              <input id="brand-upload-name" type="text" value={draft.name}
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                     placeholder="Roundel — Navy Field" />
            </div>

            {/*
              The disclosure. Everything above is the quick path; everything below is the full
              profile, and it stays shut until somebody wants it. The button says what is inside
              rather than "More options", because "more options" is what people skip.
            */}
            <button type="button" className="brand-disclose" aria-expanded={showProfile}
                    onClick={() => setShowProfile((v) => !v)}>
              <ChevronDown size={14} aria-hidden
                           className={showProfile ? 'brand-card__chev brand-card__chev--up' : 'brand-card__chev'} />
              {showProfile
                ? 'Hide the profile — colours, type, use cases'
                : 'Add the full profile — colours, type, use cases, description'}
            </button>

            {showProfile && (
              <div className="brand-upload__profile">
                <ChoiceRow label="What kind of design is it?" value={draft.kind}
                           onChange={(kind) => setDraft({ ...draft, kind })}
                           options={UPLOAD_KINDS} />

                <ChoiceRow label="What should it be shown on?"
                           hint="The ground the preview sits on. A mark with white in it disappears on white."
                           value={draft.plate}
                           onChange={(plate) => setDraft({ ...draft, plate })}
                           options={UPLOAD_PLATES} />

                <div className="brand-field">
                  <label className="brand-field__label" htmlFor="brand-upload-note">Caption</label>
                  <p className="brand-field__hint">One line. It is what the card shows before anybody opens the profile.</p>
                  <input id="brand-upload-note" type="text" value={draft.note} maxLength={300}
                         onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                         placeholder="Navy ring, red type, open white centre." />
                </div>

                <div className="brand-field">
                  <label className="brand-field__label" htmlFor="brand-upload-desc">Description</label>
                  <p className="brand-field__hint">
                    What the design IS — its construction, and what makes it different from the marks
                    beside it. This is the part somebody reads when choosing between two variants.
                  </p>
                  <textarea id="brand-upload-desc" rows={5} value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            placeholder="A double ring carrying STARR over the top arc and SURVEYING under the bottom…" />
                </div>

                <ListEditor label="Use it for" items={draft.useCases}
                            placeholder="Truck doors and yard signs"
                            onChange={(useCases) => setDraft({ ...draft, useCases })} />

                <ListEditor label="Do not" hint="The traps worth naming. Leave empty if there are none."
                            items={draft.avoid}
                            placeholder="Anything under 1.25 inches — the curved type fills in"
                            onChange={(avoid) => setDraft({ ...draft, avoid })} />

                <ColourPicker selected={draft.colours}
                              onChange={(colours) => setDraft({ ...draft, colours })} />

                <FontPicker selected={draft.fonts}
                            onChange={(fonts) => setDraft({ ...draft, fonts })} />

                <div className="brand-field">
                  <label className="brand-field__label" htmlFor="brand-upload-min">Smallest reliable size</label>
                  <p className="brand-field__hint">Where it stops reproducing, if it has a floor worth stating.</p>
                  <input id="brand-upload-min" type="text" value={draft.minSize}
                         onChange={(e) => setDraft({ ...draft, minSize: e.target.value })}
                         placeholder="1.25&Prime; print · 2&Prime; embroidery" />
                </div>
              </div>
            )}

            {error && <p className="brand-formerror" role="alert">{error}</p>}

            <div className="brand-upload__actions">
              <button type="button" className="brand-btn brand-btn--primary" disabled={busy}
                      onClick={() => void save()}>
                {busy ? <><Loader2 size={14} className="brand-spin" aria-hidden /> Uploading…</>
                      : showProfile ? 'Save this design' : 'Add it to the kit'}
              </button>
              {!showProfile && (
                <span className="brand-upload__hint">
                  You can fill the profile in later — the design is editable once it is here.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
