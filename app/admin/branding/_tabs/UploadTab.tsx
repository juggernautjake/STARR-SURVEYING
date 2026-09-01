'use client';
// The uploaded half of the brand kit: add a design, and everything added so far.
//
// ── TWO LIBRARIES, AND THE PAGE SAYS WHICH IS WHICH ─────────────────────────────────────────────
//
// The Logos tab renders `lib/branding/logos.ts` — 178 files that ship with the code, versioned and
// reviewable, and not editable from a browser. This tab renders `brand_assets` — everything added
// since, editable in place.
//
// Merging them into one grid was the first idea and it is wrong. "Can I change this?" has a
// different answer for each, and a grid where half the cards have an Edit button and half do not is
// a grid that looks broken. Keeping them apart lets each tab state its own rules once.
//
// What they share is the profile SHAPE, so moving between the two does not feel like moving between
// two products.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';

import { BRAND_LOGOS } from '@/lib/branding/logos';
import { humanBytes, UPLOAD_KINDS, type BrandAsset } from '@/lib/branding/uploads';
import DesignUploadForm from './upload/DesignUploadForm';
import UploadedAssetPanel from './upload/UploadedAssetPanel';

const KIND_LABEL = new Map(UPLOAD_KINDS.map((k) => [k.id, k.label]));

export default function UploadTab() {
  const [assets, setAssets] = useState<BrandAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/branding/assets${showArchived ? '?archived=1' : ''}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        // The most likely failure here by a wide margin, and the one worth naming: seeds/622 has not
        // been applied to this environment. A bare "500" would send somebody looking at the route.
        setError(j.error ?? 'The uploaded library could not be loaded.');
        setAssets([]);
        return;
      }
      const { assets: list } = await res.json() as { assets: BrandAsset[] };
      setAssets(list);
    } catch {
      setError('The uploaded library could not be loaded — check your connection.');
      setAssets([]);
    }
  }, [showArchived]);

  useEffect(() => { void load(); }, [load]);

  const open = useMemo(() => assets?.find((a) => a.id === openId) ?? null, [assets, openId]);

  const upsert = useCallback((next: BrandAsset) => {
    setAssets((cur) => {
      const list = cur ?? [];
      return list.some((a) => a.id === next.id)
        ? list.map((a) => (a.id === next.id ? next : a))
        : [next, ...list];
    });
  }, []);

  const drop = useCallback((id: string) => {
    setAssets((cur) => (cur ?? []).filter((a) => a.id !== id));
    setOpenId(null);
  }, []);

  const totalFiles = (assets ?? []).reduce((n, a) => n + a.variants.length, 0);
  const totalBytes = (assets ?? []).reduce(
    (n, a) => n + a.variants.reduce((m, v) => m + (v.bytes ?? 0), 0), 0);

  return (
    <div>
      <p className="brand-lede">
        Add a design to the kit. Upload the image on its own, or fill in the whole profile — the
        colours, the type, what it is for and what it is not for — and add as many resolution
        variations as the file supports. Everything here is editable afterwards, which is the point
        of it living in the database rather than in the repository beside the{' '}
        {BRAND_LOGOS.length} built-in marks.
      </p>

      <div className="brand-section">
        <h3 className="brand-section__title">Add a design</h3>
        <DesignUploadForm onAdded={(a) => { upsert(a); setOpenId(a.id); }} />
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">
          Uploaded designs{assets ? ` — ${assets.length}` : ''}
        </h3>

        {assets && assets.length > 0 && (
          <p className="brand-lede">
            {assets.length} design{assets.length === 1 ? '' : 's'} · {totalFiles} file
            {totalFiles === 1 ? '' : 's'} · {humanBytes(totalBytes)} stored. Click any one for its
            profile, its resolutions and its downloads.
          </p>
        )}

        <label className="brand-check">
          <input type="checkbox" checked={showArchived}
                 onChange={(e) => setShowArchived(e.target.checked)} />
          Include retired designs
        </label>

        {error && (
          <div className="brand-note brand-note--stop">
            <strong>{error}</strong>
            {' '}If this environment has never had <code>seeds/622_brand_assets.sql</code> applied,
            the tables this reads do not exist yet — that is the first thing to check.
          </div>
        )}

        {assets === null && (
          <p className="brand-lede"><Loader2 size={14} className="brand-spin" aria-hidden /> Loading…</p>
        )}

        {assets !== null && assets.length === 0 && !error && (
          <div className="brand-empty">
            <ImageIcon size={26} aria-hidden />
            <p>Nothing uploaded yet.</p>
            <p className="brand-field__hint">
              The {BRAND_LOGOS.length} marks on the Logos tab ship with the code and are not editable
              here. Anything added above appears in this list.
            </p>
          </div>
        )}

        {assets && assets.length > 0 && (
          <div className="brand-grid brand-grid--4">
            {assets.map((a) => (
              <div className={`brand-card brand-card--clickable${openId === a.id ? ' brand-card--open' : ''}`} key={a.id}>
                <button type="button" className="brand-card__trigger"
                        aria-expanded={openId === a.id}
                        onClick={() => setOpenId((cur) => (cur === a.id ? null : a.id))}>
                  <span className={`brand-plate brand-plate--${a.plate}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt=""
                         style={a.plate === 'none'
                           ? { width: '100%', height: 'auto' }
                           : { width: 'auto', height: 'auto', maxHeight: 118, maxWidth: '100%' }} />
                  </span>
                  <span className="brand-card__body">
                    {a.status !== 'approved' && (
                      <span className="brand-tag brand-tag--quiet">
                        {a.status === 'draft' ? 'Work in progress' : 'Retired'}
                      </span>
                    )}
                    <span className="brand-card__name">{a.name}</span>
                    <span className="brand-card__note">
                      {a.note || `${KIND_LABEL.get(a.kind) ?? a.kind}${a.width ? ` · ${a.width}×${a.height}` : ''}`}
                    </span>
                    <span className="brand-card__more">
                      {a.variants.length} resolution{a.variants.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              </div>
            ))}
            {open && (
              <div className="brand-profile__slot">
                <UploadedAssetPanel asset={open} onChanged={upsert} onDeleted={drop}
                                    onClose={() => setOpenId(null)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
