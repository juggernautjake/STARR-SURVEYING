'use client';
// Where the files are.
//
// Everything here is a real path served by the app, held against the filesystem in both
// directions by `brand-system.test.ts` — a downloads page listing a file that 404s is the one
// defect this tab can have, and it is the kind nobody notices until somebody needs the file.

import Image from 'next/image';
import { FileImage, FileText, Package } from 'lucide-react';
import {
  BRAND_COLOURS, BRAND_FONTS,
} from '@/lib/branding/palette';
import {
  BRAND_LOGOS, LOGO_KIND_LABELS, LOGO_KIND_ORDER, logosOfKind, logoSrc, BRANDING_ASSET_BASE,
  RECOLOUR_MARKS, RECOLOUR_WAYS, recolourFile, allRecolourFiles,
} from '@/lib/branding/logos';

export default function DownloadsTab() {
  const hexList = BRAND_COLOURS.map((c) => `${c.name.padEnd(16)}${c.hex}  ${c.ink === 'white' ? 'white ink' : 'dark ink'}`).join('\n');

  return (
    <div>
      <p className="brand-lede">
        Every mark is served from <code>{BRANDING_ASSET_BASE}/</code>. Right-click and save, or open
        in a new tab for the full-size file. {BRAND_LOGOS.length} original marks and{' '}
        {allRecolourFiles().length} generated colourways —{' '}
        <strong>{BRAND_LOGOS.length + allRecolourFiles().length} files</strong> in total.
      </p>

      <div className="brand-note brand-note--info">
        <strong>Sending this to a printer or a designer?</strong> The standalone guide is a single
        folder with an <code>index.html</code> and its own copy of the artwork — it opens in any
        browser with no login and nothing to install. Ask an admin for the shareable link, or take
        the folder from <code>Starr-Surveying-Brand-Guide/</code>.
      </div>

      {LOGO_KIND_ORDER.map((kind) => {
        const items = logosOfKind(kind);
        if (items.length === 0) return null;
        return (
          <div className="brand-section" key={kind}>
            <h3 className="brand-section__title">{LOGO_KIND_LABELS[kind]} — {items.length} files</h3>
            <div className="brand-grid brand-grid--3">
              {items.map((l) => (
                <a key={l.file} className="brand-dl" href={logoSrc(l.file)} target="_blank" rel="noreferrer">
                  <span className="brand-dl__icon" style={{ padding: 3, overflow: 'hidden' }}>
                    <Image src={logoSrc(l.file)} alt="" width={60} height={60} unoptimized
                           style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </span>
                  <span>
                    <span className="brand-dl__name">{l.name}</span>
                    <span className="brand-dl__note">{l.file}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        );
      })}

      {/*
        Every generated colourway, as a link.

        The kind sections above are cards with thumbnails, which is right for 34 marks and wrong
        for 144: at that count a thumbnail grid is a scroll, not an index. Somebody on this tab
        already knows which mark and which colourway they want — they came from the Logos tab to
        fetch the file — so a family per row and a link per colourway is the shape that answers
        the question in one screen instead of twelve.
      */}
      <div className="brand-section">
        <h3 className="brand-section__title">
          Colourways — {allRecolourFiles().length} files
        </h3>
        <p className="brand-lede">
          {RECOLOUR_MARKS.length} marks &times; {RECOLOUR_WAYS.length} colourways, generated from
          the originals by <code>scripts/recolour-brand-marks.mjs</code>. Regenerate them with
          {' '}<code>node scripts/recolour-brand-marks.mjs</code> after changing a mark — they are built
          artwork, not hand edits, so a change to an original reaches all {RECOLOUR_WAYS.length}.
        </p>
        <div className="brand-dlways">
          {RECOLOUR_MARKS.map((m) => (
            <div className="brand-dlways__row" key={m.slug}>
              <span className="brand-dlways__mark">{m.label}</span>
              <span className="brand-dlways__links">
                {RECOLOUR_WAYS.map((w) => (
                  <a key={w.id} href={logoSrc(recolourFile(m.slug, w.id))}
                     target="_blank" rel="noreferrer" title={w.note}>
                    {w.label}
                  </a>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="brand-section">
        <h3 className="brand-section__title">Reference</h3>
        <div className="brand-grid brand-grid--2">
          <div className="brand-card">
            <div className="brand-card__body">
              <p className="brand-card__name" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <FileText size={15} aria-hidden /> Every hex, as plain text
              </p>
              <p className="brand-card__note" style={{ marginBottom: '.6rem' }}>
                Paste-ready for a printer, a design tool or a purchase order.
              </p>
              <pre style={{
                margin: 0, padding: '.7rem .85rem', borderRadius: 8, overflowX: 'auto',
                background: 'var(--theme-bg-elevated, #F3F4F6)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '.7rem', lineHeight: 1.7,
                color: 'var(--theme-fg-primary, #111827)',
              }}>{hexList}</pre>
            </div>
          </div>

          <div className="brand-card">
            <div className="brand-card__body">
              <p className="brand-card__name" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <Package size={15} aria-hidden /> The {BRAND_FONTS.length} typefaces
              </p>
              <p className="brand-card__note" style={{ marginBottom: '.6rem' }}>
                All SIL Open Font License — free for commercial use including goods the firm sells.
                Search each family name at <code>fonts.google.com</code> and use the Download button
                for desktop files.
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.82rem', lineHeight: 1.8,
                           color: 'var(--theme-fg-secondary, #4B5563)' }}>
                {BRAND_FONTS.map((f) => (
                  <li key={f.name}>
                    <strong style={{ color: 'var(--theme-fg-primary, #111827)' }}>{f.name}</strong>
                    {' — '}{f.purpose}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">What is missing, and worth ordering</h3>
        <p className="brand-lede">
          Everything above is a raster file (PNG or JPG). That is fine for the web, for slides and
          for anything printed at the size it was made — but a vehicle wrap, a yard sign or an
          embroidery digitisation wants <strong>vector</strong> artwork. There is no{' '}
          <code>.svg</code> or <code>.ai</code> in the library today.
        </p>
        <p className="brand-lede" style={{ marginTop: '-.9rem' }}>
          If a sign shop asks for &ldquo;vector&rdquo; or &ldquo;the AI file&rdquo;, the honest
          answer is that we do not have one yet, and the fix is a one-off trace of the primary badge
          and the roundel. Worth doing once, before the first large-format job rather than during it.
        </p>
        <div className="brand-grid brand-grid--3" style={{ marginTop: '1rem' }}>
          {['badge-primary.png', 'roundel-navy.png', 'banner-wide.png'].map((f) => {
            const l = BRAND_LOGOS.find((x) => x.file === f);
            return (
              <div className="brand-card" key={f}>
                <div className="brand-plate brand-plate--white">
                  <Image src={logoSrc(f)} alt={l?.name ?? f} width={400} height={400} unoptimized
                         style={{ width: 'auto', height: 'auto', maxHeight: 104, maxWidth: '100%' }} />
                </div>
                <div className="brand-card__body">
                  <p className="brand-card__name" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    <FileImage size={14} aria-hidden /> {l?.name ?? f}
                  </p>
                  <p className="brand-card__note">First in the queue for a vector trace.</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
