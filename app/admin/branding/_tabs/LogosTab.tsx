'use client';
// Every approved mark, with a profile behind each one.
//
// ── WHY THE PROFILE IS INLINE AND NOT A MODAL ───────────────────────────────────────────────────
//
// Owner: *"we should be able to click on a logo/image profile and it should expand and show all of
// the information about that image/logo."*
//
// The expanded panel takes over the full grid row rather than opening a dialog. Two reasons, and
// both are about the job somebody is here to do — comparing marks. A modal hides everything else,
// so choosing between two variants becomes open / read / close / open / read. Inline, the rest of
// the family stays on screen, and the browser's find-in-page still works across all of it.
//
// ── THE PLATES ARE FIXED COLOURS ────────────────────────────────────────────────────────────────
//
// A red-on-white badge shown on a themed dark card is not the artwork — it is a different picture
// that happens to contain the same pixels. Somebody choosing a variant has to see it on the ground
// it will print on. See the header of Branding.css.

import { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { ChevronDown, Download, Check, X, Ruler, Type as TypeIcon, Palette as PaletteIcon } from 'lucide-react';

import { colourByName } from '@/lib/branding/palette';
import {
  BRAND_LOGOS, LOGO_KIND_LABELS, LOGO_KIND_ORDER, LOGO_KIND_INTRO,
  logosOfKind, logoSrc, recolourFile, RECOLOUR_WAYS, RECOLOUR_MARKS, ASSET_SIZES, assetUrl,
  type BrandLogo,
} from '@/lib/branding/logos';
import ColourwaysSection from './ColourwaysSection';

/** The three inks every original mark is drawn in, named so the strip reads from the palette. */
const ORIGINAL_INKS = ['Starr Red', 'Starr Navy', 'White'] as const;

/** Swatch chips for the colours a mark is drawn in. */
function ColourChips({ names }: { names: readonly string[] }) {
  return (
    <div className="brand-profile__chips">
      {names.map((n) => {
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
  );
}

function Profile({ logo, onClose }: { logo: BrandLogo; onClose: () => void }) {
  // The colourway being previewed. `null` is the original — which is a real choice, not an absence,
  // because for most marks the red/navy/white original is the one that should be used.
  const [way, setWay] = useState<string | null>(null);
  const [size, setSize] = useState<number>(1024);

  const shown = way && logo.recolourSlug ? recolourFile(logo.recolourSlug, way) : logo.file;
  const plate = way ? 'mist' : (logo.plate ?? 'white');
  const wayMeta = RECOLOUR_WAYS.find((w) => w.id === way);

  return (
    <div className="brand-profile">
      <button type="button" className="brand-profile__close" onClick={onClose} aria-label="Close profile">
        <X size={16} aria-hidden />
      </button>

      <div className="brand-profile__grid">
        {/* ── the mark itself ─────────────────────────────────────────────── */}
        <div>
          <div className={`brand-plate brand-plate--${plate} brand-profile__preview`}>
            <Image src={logoSrc(shown)} alt={`${logo.name}${wayMeta ? ` in ${wayMeta.label}` : ''}`}
                   width={700} height={700} unoptimized
                   style={plate === 'none'
                     ? { width: '100%', height: 'auto' }
                     : { width: 'auto', height: 'auto', maxHeight: 250, maxWidth: '100%' }} />
          </div>

          {logo.recolourSlug && (
            <>
              <p className="brand-profile__label">
                <PaletteIcon size={12} aria-hidden /> Colourway — {RECOLOUR_WAYS.length + 1} available
              </p>
              <div className="brand-profile__ways">
                <button type="button" onClick={() => setWay(null)}
                        aria-pressed={way === null}
                        className={`brand-profile__way${way === null ? ' brand-profile__way--on' : ''}`}>
                  <span className="brand-profile__way-swatches">
                    {ORIGINAL_INKS.map((n) => (
                      <i key={n} style={{ background: colourByName(n)?.hex }} />
                    ))}
                  </span>
                  Original
                </button>
                {RECOLOUR_WAYS.map((w) => (
                  <button type="button" key={w.id} onClick={() => setWay(w.id)}
                          aria-pressed={way === w.id}
                          title={w.note}
                          className={`brand-profile__way${way === w.id ? ' brand-profile__way--on' : ''}`}>
                    <span className="brand-profile__way-swatches">
                      {w.colours.slice(0, 3).map((cn) => (
                        <i key={cn} style={{ background: colourByName(cn)?.hex }} />
                      ))}
                    </span>
                    {w.label}
                  </button>
                ))}
              </div>
              {wayMeta && <p className="brand-profile__waynote">{wayMeta.note}</p>}
            </>
          )}

          {/* ── sizes ─────────────────────────────────────────────────────── */}
          <p className="brand-profile__label">
            <Download size={12} aria-hidden /> Download — {ASSET_SIZES.length} sizes
          </p>
          <div className="brand-profile__sizes">
            {ASSET_SIZES.map((s) => (
              <a key={s} className={`brand-profile__size${s === size ? ' brand-profile__size--on' : ''}`}
                 href={assetUrl(shown, s)} target="_blank" rel="noreferrer"
                 onMouseEnter={() => setSize(s)} onFocus={() => setSize(s)}
                 download={`${shown.replace(/\.(png|jpe?g)$/i, '')}-${s}.png`}>
                {s}px
              </a>
            ))}
            <a className="brand-profile__size brand-profile__size--raw"
               href={logoSrc(shown)} target="_blank" rel="noreferrer">
              Original file
            </a>
          </div>
        </div>

        {/* ── the profile ─────────────────────────────────────────────────── */}
        <div className="brand-profile__text">
          <h4 className="brand-profile__name">{logo.name}</h4>
          <p className="brand-profile__desc">{logo.description}</p>

          <p className="brand-profile__label"><Check size={12} aria-hidden /> Use it for</p>
          <ul className="brand-profile__list">
            {logo.useCases.map((u) => <li key={u}>{u}</li>)}
          </ul>

          {logo.avoid && logo.avoid.length > 0 && (
            <>
              <p className="brand-profile__label brand-profile__label--warn">
                <X size={12} aria-hidden /> Do not
              </p>
              <ul className="brand-profile__list brand-profile__list--warn">
                {logo.avoid.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </>
          )}

          <p className="brand-profile__label"><PaletteIcon size={12} aria-hidden /> Colours in this mark</p>
          <ColourChips names={wayMeta ? wayMeta.colours : logo.colours} />

          <p className="brand-profile__label"><TypeIcon size={12} aria-hidden /> Type</p>
          <ul className="brand-profile__list">
            {logo.fonts.map((f) => <li key={f}>{f}</li>)}
          </ul>

          {logo.minSize && (
            <>
              <p className="brand-profile__label"><Ruler size={12} aria-hidden /> Smallest reliable size</p>
              <p className="brand-profile__minsize">{logo.minSize}</p>
            </>
          )}

          <p className="brand-profile__file"><code>{shown}</code></p>
        </div>
      </div>
    </div>
  );
}

function LogoCard({ logo, open, onToggle }: { logo: BrandLogo; open: boolean; onToggle: () => void }) {
  const plate = logo.plate ?? 'white';
  return (
    <div className={`brand-card brand-card--clickable${open ? ' brand-card--open' : ''}`}>
      <button type="button" className="brand-card__trigger" onClick={onToggle} aria-expanded={open}>
        <span className={`brand-plate brand-plate--${plate}`}>
          {/* `unoptimized`: flat-colour logo art, already sized. The optimiser re-encodes it into
              something with visible artefacts around the star points. */}
          <Image src={logoSrc(logo.file)} alt="" width={700} height={700} unoptimized
                 style={plate === 'none'
                   ? { width: '100%', height: 'auto' }
                   : { width: 'auto', height: 'auto', maxHeight: 118, maxWidth: '100%' }} />
        </span>
        <span className="brand-card__body">
          {logo.primary && <span className="brand-tag">Primary</span>}
          <span className="brand-card__name">{logo.name}</span>
          <span className="brand-card__note">{logo.note}</span>
          <span className="brand-card__more">
            {open ? 'Hide details' : 'Details'}
            <ChevronDown size={13} aria-hidden className={open ? 'brand-card__chev brand-card__chev--up' : 'brand-card__chev'} />
          </span>
        </span>
      </button>
    </div>
  );
}

export default function LogosTab() {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const toggle = useCallback((file: string) => {
    setOpenFile((cur) => (cur === file ? null : file));
  }, []);

  const openLogo = useMemo(() => BRAND_LOGOS.find((l) => l.file === openFile) ?? null, [openFile]);
  const recolourable = BRAND_LOGOS.filter((l) => l.recolourSlug).length;

  return (
    <div>
      <p className="brand-lede">
        {BRAND_LOGOS.length} approved marks. Click any one for its profile — what it is, where it
        goes, the colours and type in it, every colourway, and five sizes to download. Pick by the{' '}
        <strong>shape of the space</strong> first — square, wide, or tiny — and only then by
        colourway.
      </p>

      <div className="brand-note brand-note--info">
        <strong>{recolourable} of these have recoloured colourways.</strong> The core marks were
        rebuilt in {RECOLOUR_WAYS.length} brand-kit colourways — {RECOLOUR_MARKS.length} families,{' '}
        {RECOLOUR_MARKS.length * RECOLOUR_WAYS.length} files — generated from the originals rather
        than redrawn, so they stay in step when a mark changes. Open any mark with a colourway strip
        to see them.
      </div>

      <div className="brand-note brand-note--warn">
        <strong>Minimum sizes and clear space.</strong> The full circular badge needs 1.25&Prime; in
        print and 2&Prime; in embroidery — below that the curved &ldquo;SURVEYING&rdquo; fills in.
        Under those sizes use the roundel or the star mark. Clear space on every mark is one
        star-height on all four sides.
      </div>

      {LOGO_KIND_ORDER.map((kind) => {
        const items = logosOfKind(kind);
        if (items.length === 0) return null;
        const openHere = openLogo && items.some((i) => i.file === openLogo.file);
        return (
          <div className="brand-section" key={kind}>
            <h3 className="brand-section__title">{LOGO_KIND_LABELS[kind]} — {items.length}</h3>
            <p className="brand-lede">{LOGO_KIND_INTRO[kind]}</p>
            <div className={`brand-grid ${kind === 'apparel' || kind === 'lockup' ? 'brand-grid--3' : 'brand-grid--4'}`}>
              {items.map((l) => (
                <LogoCard key={l.file} logo={l} open={openFile === l.file} onToggle={() => toggle(l.file)} />
              ))}
              {/* The panel spans the whole row so the rest of the family stays visible beside it. */}
              {openHere && openLogo && (
                <div className="brand-profile__slot">
                  <Profile logo={openLogo} onClose={() => setOpenFile(null)} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      <ColourwaysSection />

      <div className="brand-note brand-note--stop">
        <strong>Camouflage needs a patch, not embroidery.</strong> Camo is designed to break up
        shapes, which is exactly what it does to a logo, and contrast maths does not apply because
        the background is four tones at once. Order the roundel as a patch with a white merrowed
        border — the border becomes the background and the camo never touches the mark. Never place
        a mark straight onto camo with no separation.
      </div>
    </div>
  );
}
