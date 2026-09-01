'use client';
// Building blocks — the palette assembled into the pieces somebody actually places.
//
// The owner asked for "building blocks", and the useful reading of that is not a component library
// (the product already has one) but the small set of things a person making a flyer, a proposal
// cover or a sign has to build: a button, a status pill, a callout, a badge lockup, a stat block.
// Each one below is rendered from the brand values so it can be copied by eye or by hex.
//
// Every foreground/background pair here clears 4.5:1 — checked against the same numbers the Colours
// tab shows. A block that demonstrated a failing pair would be a template for making the mistake.

import { Check, AlertTriangle, X, Info } from 'lucide-react';
import { colourByName, STATUS_TONES, HIVIS_TONES } from '@/lib/branding/palette';

const RED = colourByName('Starr Red')!.hex;
const NAVY = colourByName('Starr Navy')!.hex;
const MIDNIGHT = colourByName('Midnight Navy')!.hex;
const INK = colourByName('Ink Black')!.hex;
const CREAM = colourByName('Cream')!.hex;
const MIST = colourByName('Mist')!.hex;
const BRICK = colourByName('Brick Red')!.hex;
const SAFETY = colourByName('Safety Orange')!.hex;
const HIVIS = colourByName('Hi-Vis Green')!.hex;
const FOREST = colourByName('Forest Green')!.hex;
const BURNT = colourByName('Burnt Orange')!.hex;
const SLATETEXT = colourByName('Slate Text')!.hex;
const WHITE = colourByName('White')!.hex;

/** Which glyph each state gets, so colour is never the only thing carrying the meaning. */
const TONE_ICON = { success: Check, warning: AlertTriangle, danger: X, info: Info } as const;

export default function BlocksTab() {
  return (
    <div>
      <p className="brand-lede">
        The palette assembled into the pieces somebody actually places on a flyer, a proposal cover,
        a sign or a slide. Every pair below clears 4.5:1 — these are templates, so a block
        demonstrating a failing combination would be a template for making the mistake.
      </p>

      <div className="brand-section">
        <h3 className="brand-section__title">Buttons</h3>
        <div className="brand-blocks__row">
          <span className="brand-blocks__label">Primary — one per screen or page</span>
          <span className="brand-btn" style={{ background: RED, color: WHITE }}>Get a free estimate</span>
          <span className="brand-btn" style={{ background: MIDNIGHT, color: WHITE }}>Request a survey</span>
          <span className="brand-btn" style={{ background: NAVY, color: WHITE }}>Contact us</span>
        </div>
        <div className="brand-blocks__row">
          <span className="brand-blocks__label">Secondary and quiet</span>
          <span className="brand-btn" style={{ background: 'transparent', color: MIDNIGHT, borderColor: MIDNIGHT }}>View our work</span>
          <span className="brand-btn" style={{ background: MIST, color: INK }}>Cancel</span>
          <span className="brand-btn" style={{ background: CREAM, color: BRICK, borderColor: BRICK }}>Heritage store</span>
        </div>
        <p className="brand-lede" style={{ marginTop: '.6rem' }}>
          Red is the action colour and navy is the structural one. A page with three red buttons has
          no primary action — pick the single thing you want somebody to do and make only that red.
        </p>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Status pills</h3>
        {/* From STATUS_TONES rather than eight literals. The ratchet's reasoning applies exactly:
            a hex inside style={{…}} cannot be reached by a token, a media query, the print
            stylesheet or a contrast audit — and "what colour is our warning state?" is a brand
            question that deserves an answer in the palette, not in whichever page was built last. */}
        <div className="brand-blocks__row">
          <span className="brand-blocks__label">On a light ground</span>
          {STATUS_TONES.map((t) => {
            const Icon = TONE_ICON[t.id];
            return (
              <span className="brand-pill" key={t.id} title={`${t.use} — ${t.ratio.toFixed(2)}:1`}
                    style={{ background: t.bg, color: t.fg }}>
                <Icon size={11} /> {t.label}
              </span>
            );
          })}
        </div>
        {/* The one row with a dark ground, so its label needs the inverse. The row rule pins a
            light paper; this overrides both halves together rather than one of them. */}
        <div className="brand-blocks__row" style={{ background: MIDNIGHT, borderColor: MIDNIGHT }}>
          <span className="brand-blocks__label" style={{ color: 'rgba(255,255,255,.78)' }}>On a dark ground</span>
          <span className="brand-pill" style={{ background: 'rgba(255,255,255,.14)', color: WHITE }}><Check size={11} /> Complete</span>
          {HIVIS_TONES.map((t) => {
            const Icon = TONE_ICON[t.id];
            return (
              <span className="brand-pill" key={t.label} title={`${t.use} — ${t.ratio.toFixed(2)}:1`}
                    style={{ background: t.bg, color: t.fg }}>
                <Icon size={11} /> {t.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Callouts</h3>
        <div className="brand-grid brand-grid--3">
          <div style={{ background: CREAM, borderLeft: `4px solid ${BURNT}`, borderRadius: 10, padding: '1rem 1.1rem', color: INK }}>
            <strong style={{ color: BURNT, display: 'block', marginBottom: '.3rem', fontSize: '.85rem' }}>Heritage</strong>
            <span style={{ fontSize: '.85rem', lineHeight: 1.55 }}>Cream ground, one heritage hue on the rule and the heading. Merch and retail only.</span>
          </div>
          <div style={{ background: MIST, borderLeft: `4px solid ${MIDNIGHT}`, borderRadius: 10, padding: '1rem 1.1rem', color: INK }}>
            <strong style={{ color: MIDNIGHT, display: 'block', marginBottom: '.3rem', fontSize: '.85rem' }}>Information</strong>
            <span style={{ fontSize: '.85rem', lineHeight: 1.55 }}>The default. Neutral ground, navy rule — proposals, reports, the website.</span>
          </div>
          <div style={{ background: STATUS_TONES[2]!.bg, borderLeft: `4px solid ${BRICK}`, borderRadius: 10, padding: '1rem 1.1rem', color: INK }}>
            <strong style={{ color: BRICK, display: 'block', marginBottom: '.3rem', fontSize: '.85rem' }}>Attention</strong>
            <span style={{ fontSize: '.85rem', lineHeight: 1.55 }}>Brick red rather than Starr Red — the brighter red vibrates against small text.</span>
          </div>
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Stat blocks</h3>
        <div className="brand-grid brand-grid--4">
          {[
            { n: '20+', l: 'Years in Central Texas', bg: MIDNIGHT, fg: WHITE },
            { n: '5', l: 'Business day turnaround', bg: RED, fg: WHITE },
            { n: '100%', l: 'Licensed and insured', bg: FOREST, fg: WHITE },
            { n: '2,400', l: 'Parcels surveyed', bg: CREAM, fg: INK },
          ].map((s) => (
            <div key={s.l} style={{ background: s.bg, color: s.fg, borderRadius: 12, padding: '1.4rem 1.2rem' }}>
              <div style={{ fontFamily: '"Oswald", "Arial Narrow", sans-serif', fontWeight: 700, fontSize: '2.2rem', lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: '.8rem', marginTop: '.4rem', opacity: .92, lineHeight: 1.4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Headers &amp; banners</h3>
        <div className="brand-grid brand-grid--2">
          <div className="brand-card">
            <div style={{ background: `linear-gradient(135deg, ${RED} 20%, ${NAVY} 80%)`, color: WHITE, padding: '2rem 1.5rem' }}>
              <div style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif', fontSize: '1.05rem', letterSpacing: '.16em', opacity: .9 }}>STARR SURVEYING</div>
              <div style={{ fontFamily: '"Oswald", "Arial Narrow", sans-serif', fontWeight: 700, fontSize: '1.9rem', textTransform: 'uppercase', lineHeight: 1.05, marginTop: '.2rem' }}>
                Trusted Texas Land Surveyor
              </div>
            </div>
            <div className="brand-card__body">
              <p className="brand-card__name">The brand gradient</p>
              <p className="brand-card__note">
                <code>linear-gradient(135deg, {RED} 20%, {NAVY} 80%)</code> — website hero only.
                Never attempt it in embroidery or a one- or two-colour print.
              </p>
            </div>
          </div>

          <div className="brand-card">
            <div style={{ background: WHITE, padding: '2rem 1.5rem', borderBottom: `4px solid ${RED}` }}>
              <div style={{ fontFamily: '"Oswald", "Arial Narrow", sans-serif', fontWeight: 700, fontSize: '1.7rem', textTransform: 'uppercase', color: MIDNIGHT, lineHeight: 1.05 }}>
                Boundary Survey Report
              </div>
              <div style={{ fontFamily: '"Roboto Condensed", sans-serif', fontSize: '.84rem', marginTop: '.5rem', color: SLATETEXT }}>
                LOT 14, BLOCK 3 — HOLLAND TOWNSITE — BELL COUNTY, TEXAS
              </div>
            </div>
            <div className="brand-card__body">
              <p className="brand-card__name">Document header</p>
              <p className="brand-card__note">
                White ground, navy type, a red rule under it. For anything a client keeps —
                proposals, reports, certificates.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Hi-vis &amp; safety</h3>
        <div className="brand-grid brand-grid--3">
          <div style={{ background: SAFETY, color: INK, borderRadius: 12, padding: '1.5rem 1.2rem' }}>
            <div style={{ fontFamily: '"Archivo Black", sans-serif', fontSize: '1.15rem' }}>SURVEY CREW</div>
            <div style={{ fontSize: '.8rem', marginTop: '.35rem' }}>Ink Black on Safety Orange — 5.87:1</div>
          </div>
          <div style={{ background: HIVIS, color: INK, borderRadius: 12, padding: '1.5rem 1.2rem' }}>
            <div style={{ fontFamily: '"Archivo Black", sans-serif', fontSize: '1.15rem' }}>SURVEY CREW</div>
            <div style={{ fontSize: '.8rem', marginTop: '.35rem' }}>Ink Black on Hi-Vis Green — 11.68:1</div>
          </div>
          <div style={{ background: HIVIS, color: MIDNIGHT, borderRadius: 12, padding: '1.5rem 1.2rem' }}>
            <div style={{ fontFamily: '"Archivo Black", sans-serif', fontSize: '1.15rem' }}>SURVEY CREW</div>
            <div style={{ fontSize: '.8rem', marginTop: '.35rem' }}>Midnight Navy on Hi-Vis — 9.87:1</div>
          </div>
        </div>
        <div className="brand-note brand-note--warn" style={{ marginTop: '1rem' }}>
          <strong>Never white on either of these.</strong> On ANSI-rated vests, also check the
          certification: printing over the reflective striping voids the rating, so keep the mark on
          the solid panel.
        </div>
      </div>
    </div>
  );
}
