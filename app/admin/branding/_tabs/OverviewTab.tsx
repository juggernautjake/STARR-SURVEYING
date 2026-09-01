'use client';
// The front door. Three rules, then pointers into the rest.
//
// Written as a short page rather than a long one on purpose: somebody arriving here usually has one
// question ("what red is it?", "can I put the logo on this shirt?"), and a wall of prose is how a
// brand guide gets skimmed and then guessed at.

import Image from 'next/image';
import {
  BRAND_COLOURS, BRAND_FONTS, CORE_COLOURS, colourByName, fontByName,
} from '@/lib/branding/palette';
import {
  BRAND_LOGOS, logoSrc,
} from '@/lib/branding/logos';

export default function OverviewTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const counts = {
    colours: BRAND_COLOURS.length,
    fonts: BRAND_FONTS.length,
    logos: BRAND_LOGOS.length,
  };

  return (
    <div>
      <div className="brand-note brand-note--info">
        <strong>This page is the source, not a copy.</strong> The colours, fonts and logo captions
        here are read from one module in the codebase, and the standalone guide that goes to printers
        is generated from the same one. If a value changes, it changes in both places at once —
        which is the reason this is a page in the product rather than a PDF on somebody&rsquo;s
        laptop.
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">The identity, in one line each</h3>
        <div className="brand-grid brand-grid--3">
          <div className="brand-card">
            <div className="brand-plate brand-plate--white">
              <Image src={logoSrc('badge-primary.png')} alt="Primary Starr Surveying badge"
                     width={340} height={340} style={{ width: 'auto', height: 130 }} unoptimized />
            </div>
            <div className="brand-card__body">
              <p className="brand-card__name">{counts.logos} approved marks</p>
              <p className="brand-card__note">
                Badges, lockups, standalone marks, seven heritage colourways and the apparel
                references. Pick by the shape of the space first, then the colourway.{' '}
                <button type="button" className="brand-swatch__hex" onClick={() => onNavigate('logos')}>See them →</button>
              </p>
            </div>
          </div>

          <div className="brand-card">
            <div style={{ display: 'flex', height: 162 }}>
              {/* From CORE_COLOURS rather than four literals: an inline hex cannot be reached
                  by a token, a media query, the print stylesheet or a contrast audit — and this
                  strip would silently stop being the core the day the core changed. */}
              {CORE_COLOURS.map((c) => (
                <div key={c.hex} style={{ flex: 1, background: c.hex }} title={`${c.name} ${c.hex}`} />
              ))}
            </div>
            <div className="brand-card__body">
              <p className="brand-card__name">{counts.colours} approved colours</p>
              <p className="brand-card__note">
                Red, navy, white and black are the identity. Twenty-three more cover apparel,
                heritage merch and hi-vis.{' '}
                <button type="button" className="brand-swatch__hex" onClick={() => onNavigate('colours')}>See them →</button>
              </p>
            </div>
          </div>

          <div className="brand-card">
            <div className="brand-plate brand-plate--white" style={{ flexDirection: 'column', gap: '.4rem', alignItems: 'flex-start', padding: '1.1rem' }}>
              <span style={{ fontFamily: fontByName('Oswald')?.stack, fontWeight: 700, fontSize: '1.5rem', color: colourByName('Ink Black')?.hex, textTransform: 'uppercase' }}>Starr Surveying</span>
              <span style={{ fontFamily: fontByName('Bebas Neue')?.stack, fontSize: '1rem', letterSpacing: '.14em', color: colourByName('Slate Text')?.hex }}>LAND &amp; BOUNDARY</span>
              <span style={{ fontFamily: fontByName('JetBrains Mono')?.stack, fontSize: '.78rem', color: colourByName('Starr Navy')?.hex, fontWeight: 700 }}>N 30°14′22″ E</span>
            </div>
            <div className="brand-card__body">
              <p className="brand-card__name">{counts.fonts} typefaces</p>
              <p className="brand-card__note">
                Each with a job — display, body, and the monospace that keeps a column of bearings in
                line. All free for commercial use.{' '}
                <button type="button" className="brand-swatch__hex" onClick={() => onNavigate('type')}>See them →</button>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Three rules worth memorising</h3>

        <div className="brand-note brand-note--stop">
          <strong>1. Every colour takes white ink or dark ink — never whichever looks nicer.</strong>{' '}
          White fails on all seven of the light and bright colours, including the two people reach
          for it on most: white on Safety Orange measures 3.15:1 and white on Hi-Vis Green measures
          1.58:1. A hi-vis vest with a white logo is a blank vest from ten feet. Every swatch on the
          Colours tab is tagged with the ink it takes.
        </div>

        <div className="brand-note brand-note--warn">
          <strong>2. Red and navy cannot touch.</strong> The two primary brand colours measure
          1.71:1 against each other — effectively invisible. They always need white, cream or gold
          between them, which is exactly what every badge in the library already does.
        </div>

        <div className="brand-note brand-note--info">
          <strong>3. Below 1.25 inches, stop using the badge.</strong> The curved
          &ldquo;SURVEYING&rdquo; fills in and reads as a smudge — 2 inches in embroidery. Switch to
          the roundel or the star mark, both of which were drawn for exactly that.
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Where the values came from</h3>
        <p className="brand-lede">
          Nothing here was invented. The dominant colours of 41 pieces of existing Starr artwork were
          extracted and quantised, and every swatch whose card says <em>sampled</em> was read off a
          real logo file. The core red came back as a cluster between{' '}
          <code>#B40C18</code> and <code>#CC1824</code> with <code>#BD1218</code> sitting in the
          middle of it — which is why the core did not move. The heritage hues, the olive and the
          khaki were all lifted the same way.
        </p>
      </div>
    </div>
  );
}
