'use client';
// Ten specimens, each set in the real face.
//
// The size of each sample is chosen per font rather than shared: Bebas at 2.6rem and Source Serif
// at 2.6rem are not comparable, because one is a tall condensed cap face and the other has a large
// x-height and long descenders. A single shared size makes the display faces look weak and the body
// faces look shouty, which is the opposite of what a specimen is for.

import { BRAND_FONTS, type BrandFont } from '@/lib/branding/palette';

const SAMPLE_SIZE: Record<string, string> = {
  'Oswald': '2.4rem',
  'Archivo Black': '2rem',
  'Bebas Neue': '2.6rem',
  'Alfa Slab One': '1.9rem',
  'Rye': '1.75rem',
  'Inter': '1.35rem',
  'Source Sans 3': '1.25rem',
  'Roboto Condensed': '1.4rem',
  'Source Serif 4': '1.4rem',
  'JetBrains Mono': '1.15rem',
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 & ° ′ ″';
const ALPHABET_CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 & ° ′ ″';

const ROLE_LABEL: Record<BrandFont['role'], string> = {
  display: 'Display',
  body: 'Body',
  technical: 'Technical',
};

function Specimen({ f }: { f: BrandFont }) {
  const weight = f.name === 'Oswald' || f.name === 'Roboto Condensed' ? 700
    : f.name === 'Inter' ? 600
    : f.name === 'JetBrains Mono' ? 700
    : f.name === 'Source Serif 4' ? 700
    : 400;

  return (
    <div className="brand-card brand-font">
      <div className="brand-font__head">
        <span className="brand-font__name">{f.name}</span>
        <span className="brand-font__purpose">{ROLE_LABEL[f.role]} · {f.purpose}</span>
      </div>
      <div className="brand-font__spec">
        <p className="brand-font__sample"
           style={{ fontFamily: f.stack, fontSize: SAMPLE_SIZE[f.name] ?? '1.6rem', fontWeight: weight,
                    letterSpacing: f.capsOnly ? '.05em' : undefined }}>
          {f.sample}
        </p>
        <p className="brand-font__alpha" style={{ fontFamily: f.stack }}>
          {f.capsOnly ? ALPHABET_CAPS : ALPHABET}
        </p>
      </div>
      <div className="brand-font__use">
        <strong>Use for:</strong> {f.use}
        {f.capsOnly && (
          <> <strong>Caps only</strong> — it has no true lowercase.</>
        )}
        <code className="brand-font__stack">font-family: {f.stack};</code>
      </div>
    </div>
  );
}

export default function TypeTab() {
  return (
    <div>
      <p className="brand-lede">
        {BRAND_FONTS.length} typefaces, each with a job. Every specimen below is set in the real
        font, loaded from Google&rsquo;s server — if this page is opened with no internet connection
        each one falls back to the second name in its stack and will look wrong.
      </p>

      <div className="brand-note brand-note--info">
        <strong>All ten are free for commercial use.</strong> Every one is SIL Open Font License:
        no licence to buy, no per-seat fee, embeddable in a PDF sent to a printer, and usable on
        goods the firm sells. The one thing the licence forbids is selling the font files
        themselves. Download the desktop files by searching the family name at{' '}
        <code>fonts.google.com</code>.
      </div>

      {(['display', 'body', 'technical'] as const).map((role) => {
        const items = BRAND_FONTS.filter((f) => f.role === role);
        if (items.length === 0) return null;
        return (
          <div className="brand-section" key={role}>
            <h3 className="brand-section__title">{ROLE_LABEL[role]} faces</h3>
            {items.map((f) => <Specimen key={f.name} f={f} />)}
          </div>
        );
      })}

      <div className="brand-note brand-note--info">
        <strong>Which faces go together</strong> is on the Combinations tab, beside the colour
        pairings — the two questions get asked at the same moment and answering them in two places
        was how the guide would have drifted.
      </div>

    </div>
  );
}
