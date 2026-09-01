'use client';
// The colour system, the ink rule, and the pairings that must never ship.
//
// Hex codes are click-to-copy. That is the single most-used thing on a page like this — somebody
// arrives, wants one value, and would otherwise select-and-drag six characters out of a table.

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  BRAND_COLOURS, GROUP_LABELS, GROUP_ORDER, coloursInGroup, colourByName,
  NEVER_PAIR, type BrandColour,
} from '@/lib/branding/palette';

/** Contrast rendered the way the rest of the repo renders it. */
function ratioClass(r: number): string {
  if (r >= 4.5) return 'brand-ratio brand-ratio--ok';
  if (r >= 3) return 'brand-ratio brand-ratio--mid';
  return 'brand-ratio brand-ratio--fail';
}

function Swatch({ c }: { c: BrandColour }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // A brand page whose copy button silently does nothing on an insecure origin or an older
    // browser is worse than one with no button — the person walks away believing they have the
    // value. The catch leaves the hex on screen where it can still be selected by hand.
    navigator.clipboard?.writeText(c.hex).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1400); },
      () => { /* clipboard refused — the hex is still rendered beside the button */ },
    );
  }, [c.hex]);

  const inkOnChip = c.ink === 'white' ? '#FFFFFF' : '#0F1419';

  return (
    <div className="brand-card">
      <div className="brand-swatch__chip" style={{ background: c.hex, color: inkOnChip }}>
        <span>{c.group === 'core' ? 'CORE' : ''}</span>
        <span
          className="brand-swatch__ink"
          style={{ background: inkOnChip, color: c.hex }}
        >
          {c.ink === 'white' ? 'WHITE INK' : 'DARK INK'}
        </span>
      </div>
      <div className="brand-card__body">
        <p className="brand-card__name">{c.name}</p>
        <button type="button" className="brand-swatch__hex" onClick={copy}
                aria-label={`Copy ${c.hex} for ${c.name}`}>
          {c.hex}
          {copied
            ? <><Check size={12} aria-hidden /><span className="brand-swatch__copied">copied</span></>
            : <Copy size={12} aria-hidden />}
        </button>
        <div className="brand-swatch__vals">
          RGB {c.rgb.join(' ')}<br />
          CMYK {c.cmyk.join(' ')}
        </div>
        <p className="brand-swatch__use">{c.use}</p>
        {c.sampledFrom && (
          <p className="brand-swatch__sampled">Sampled from {c.sampledFrom}</p>
        )}
      </div>
    </div>
  );
}

export default function ColoursTab() {
  const whiteInk = BRAND_COLOURS.filter((c) => c.ink === 'white');
  const darkInk = BRAND_COLOURS.filter((c) => c.ink === 'dark');

  return (
    <div>
      <p className="brand-lede">
        {BRAND_COLOURS.length} approved colours. Click any hex to copy it. Every contrast figure on
        this tab is a WCAG relative-luminance calculation against the real values — a number below
        4.5:1 means the type genuinely will not read, not that somebody thought it looked weak.
      </p>

      <div className="brand-note brand-note--stop">
        <strong>The ink rule.</strong> Every colour takes <em>either</em> white ink <em>or</em> dark
        ink. <strong>White fails on all {darkInk.length} light and bright colours</strong> — worst on
        Hi-Vis Green at 1.58:1 and Safety Orange at 3.15:1, which are exactly the two people reach
        for white on. Each swatch below is tagged with the ink it takes.
      </div>

      {GROUP_ORDER.map((group) => {
        const items = coloursInGroup(group);
        if (items.length === 0) return null;
        return (
          <div className="brand-section" key={group}>
            <h3 className="brand-section__title">{GROUP_LABELS[group]}</h3>
            <div className="brand-grid brand-grid--4">
              {items.map((c) => <Swatch key={c.hex} c={c} />)}
            </div>
          </div>
        );
      })}

      <div className="brand-section">
        <h3 className="brand-section__title">
          The ink rule, as a table
        </h3>
        <p className="brand-lede">
          Sorted by ink. This is the table to check before choosing a garment — it answers the
          question in one line.
        </p>
        <div className="brand-scroll">
          <table className="brand-table">
            <thead>
              <tr>
                <th>Garment / background</th><th>Correct ink</th><th>Contrast</th>
                <th>The other ink measures</th>
              </tr>
            </thead>
            <tbody>
              {[...whiteInk, ...darkInk].map((c) => {
                const good = c.ink === 'white' ? c.contrastVsWhite : c.contrastVsInk;
                const bad = c.ink === 'white' ? c.contrastVsInk : c.contrastVsWhite;
                return (
                  <tr key={c.hex}>
                    <td>
                      <span className="brand-dot" style={{ background: c.hex }} />
                      {c.name} <code>{c.hex}</code>
                    </td>
                    <td><strong>{c.ink === 'white' ? 'White' : 'Ink Black'}</strong></td>
                    <td><span className={ratioClass(good)}>{good.toFixed(2)}:1</span></td>
                    <td><span className={ratioClass(bad)}>{bad.toFixed(2)}:1</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">Never pair these</h3>
        <p className="brand-lede">
          Six combinations that look plausible in a mock-up and fail in the real world. Rendered in
          the real colours so the failure is visible rather than asserted.
        </p>
        <div className="brand-grid brand-grid--4">
          {NEVER_PAIR.map((p) => {
            const fg = colourByName(p.fg);
            const bg = colourByName(p.bg);
            if (!fg || !bg) return null;
            return (
              <div className="brand-combo" key={`${p.fg}-${p.bg}`}>
                {/* `data-demo="fail"` marks this as a tile that is SUPPOSED to be unreadable, so
                    the contrast probes skip it instead of reporting the page as broken. A tile
                    demonstrating 1.7:1 genuinely is 1.7:1. */}
                <div className="brand-combo__demo" data-demo="fail"
                     style={{ background: bg.hex, color: fg.hex }}>
                  <span className="brand-combo__big">Starr Surveying</span>
                  <span className="brand-combo__small">Unreadable</span>
                </div>
                <div className="brand-combo__cap">
                  <span>{p.fg} on {p.bg}</span>
                  <span className="brand-ratio brand-ratio--fail">{p.ratio.toFixed(2)}:1</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="brand-note brand-note--warn" style={{ marginTop: '1rem' }}>
          {NEVER_PAIR[0] && (
            <><strong>{NEVER_PAIR[0].fg} on {NEVER_PAIR[0].bg} is the one that matters.</strong>{' '}
            {NEVER_PAIR[0].why}</>
          )}
        </div>
      </div>

      <div className="brand-section">
        <h3 className="brand-section__title">About Pantone</h3>
        <p className="brand-lede">
          No Pantone numbers are listed, on purpose. Pantone is a licensed matching system and a
          number converted from a screen value is a guess that costs money when a run comes back
          wrong. Give a printer the CMYK values above and ask them to pull the nearest Pantone from a
          current Color Bridge book against a physical proof. When they confirm the chips, record
          those numbers here — then they are real.
        </p>
      </div>
    </div>
  );
}
