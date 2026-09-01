'use client';
// The recoloured colourways, browsed the way somebody actually arrives at them.
//
// ── THE 112 FILES NOBODY COULD REACH ────────────────────────────────────────────────────────────
//
// `scripts/recolour-brand-marks.mjs` generates eighteen families of eight colourways — 144 files,
// all committed. The data module listed four of them. The other fourteen were rendered, paid for in
// repository weight, and unreachable: no profile offered them and no download resolved to them.
// Nothing failed, which is why it survived a green test run.
//
// `RECOLOUR_MARKS` is derived now, so the profile strips reach all eighteen. This section is the
// other half of the question. A profile answers *"what does this mark look like in green?"*; the
// question a shirt order starts from is the transpose — *"show me everything in green"* — and
// eighteen separate profile visits is not an answer to it.
//
// ── WHY IT IS NOT 144 CARDS ─────────────────────────────────────────────────────────────────────
//
// A wall of 144 thumbnails is a file listing, not a brand page: at that density every mark looks
// the same and the colourway, which is the thing being chosen, is the only variable you cannot see.
// So the grid is the eight COLOURWAYS, each shown on the mark that carries the most colour, and
// opening one lays out its eighteen marks together at a size you can judge.

import { useState } from 'react';
import Image from 'next/image';
import { ChevronDown, X, Download } from 'lucide-react';

import { colourByName } from '@/lib/branding/palette';
import {
  RECOLOUR_WAYS, RECOLOUR_MARKS, recolourFile, logoSrc, assetUrl, ASSET_SIZES,
  type RecolourWay,
} from '@/lib/branding/logos';

/** The mark each colourway is previewed on. The full badge carries all three inks at once, so it
 *  is the one thumbnail that shows what a colourway actually does. */
const PREVIEW_SLUG = 'badge';

function WayPanel({ way, onClose }: { way: RecolourWay; onClose: () => void }) {
  return (
    <div className="brand-profile">
      <button type="button" className="brand-profile__close" onClick={onClose} aria-label="Close colourway">
        <X size={16} aria-hidden />
      </button>

      <h4 className="brand-profile__name">{way.label} — every mark</h4>
      <p className="brand-profile__desc">{way.note}</p>

      <div className="brand-profile__chips">
        {way.colours.map((n) => {
          const c = colourByName(n);
          if (!c) return null;
          return (
            <span className="brand-profile__chip" key={n}>
              <span className="brand-profile__chip-dot" style={{ background: c.hex }} />
              {c.name} <code>{c.hex}</code>
            </span>
          );
        })}
      </div>

      <div className="brand-ways__marks">
        {RECOLOUR_MARKS.map((m) => {
          const file = recolourFile(m.slug, way.id);
          return (
            <figure className="brand-ways__mark" key={m.slug}>
              {/* `unoptimized` for the same reason the logo cards use it: the optimiser re-encodes
                  flat colour art and leaves artefacts around the star points. */}
              <span className="brand-plate brand-plate--mist brand-ways__mark-plate">
                <Image src={logoSrc(file)} alt={`${m.label} in ${way.label}`}
                       width={600} height={600} unoptimized
                       style={{ width: 'auto', height: 'auto', maxHeight: 110, maxWidth: '100%' }} />
              </span>
              <figcaption>
                <span className="brand-ways__mark-name">{m.label}</span>
                <span className="brand-ways__mark-sizes">
                  {ASSET_SIZES.map((s) => (
                    <a key={s} href={assetUrl(file, s)} target="_blank" rel="noreferrer"
                       download={`${file.replace(/\.png$/i, '')}-${s}.png`}>{s}</a>
                  ))}
                  <a href={logoSrc(file)} target="_blank" rel="noreferrer" title="The generated file, unresized">
                    <Download size={11} aria-hidden />
                  </a>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

export default function ColourwaysSection() {
  const [openWay, setOpenWay] = useState<string | null>(null);
  const open = RECOLOUR_WAYS.find((w) => w.id === openWay) ?? null;
  const total = RECOLOUR_MARKS.length * RECOLOUR_WAYS.length;

  return (
    <div className="brand-section">
      <h3 className="brand-section__title">Colourways — {RECOLOUR_WAYS.length}</h3>
      <p className="brand-lede">
        Every core mark rebuilt in a brand-kit colourway — {RECOLOUR_MARKS.length} marks ×{' '}
        {RECOLOUR_WAYS.length} colourways = <strong>{total} files</strong>. Generated from the
        originals rather than redrawn, so a change to a mark reaches every colourway of it. Open one
        to see the whole family and download any of it. Each colourway&rsquo;s own ink and paper
        clear 4.5:1 against each other, so the mark holds together whatever it is printed on.
      </p>

      <div className="brand-grid brand-grid--4">
        {RECOLOUR_WAYS.map((w) => {
          const isOpen = openWay === w.id;
          return (
            <div className={`brand-card brand-card--clickable${isOpen ? ' brand-card--open' : ''}`} key={w.id}>
              <button type="button" className="brand-card__trigger" aria-expanded={isOpen}
                      onClick={() => setOpenWay((cur) => (cur === w.id ? null : w.id))}>
                <span className="brand-plate brand-plate--mist">
                  <Image src={logoSrc(recolourFile(PREVIEW_SLUG, w.id))} alt=""
                         width={600} height={600} unoptimized
                         style={{ width: 'auto', height: 'auto', maxHeight: 118, maxWidth: '100%' }} />
                </span>
                <span className="brand-card__body">
                  <span className="brand-card__name">{w.label}</span>
                  <span className="brand-card__note">{w.note}</span>
                  <span className="brand-card__more">
                    {isOpen ? 'Hide the family' : `All ${RECOLOUR_MARKS.length} marks`}
                    <ChevronDown size={13} aria-hidden
                                 className={isOpen ? 'brand-card__chev brand-card__chev--up' : 'brand-card__chev'} />
                  </span>
                </span>
              </button>
            </div>
          );
        })}
        {open && (
          <div className="brand-profile__slot">
            <WayPanel way={open} onClose={() => setOpenWay(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
