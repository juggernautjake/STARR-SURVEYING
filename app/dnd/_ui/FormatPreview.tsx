'use client';
// FormatPreview — a tiny visual diagram of a template's LAYOUT, the format axis's answer to the skin
// picker's colour swatch. The skin picker shows a mini card in the style's palette so a COLOUR reads
// at a glance; this shows a mini skeleton of where the sections sit so a FORMAT reads at a glance the
// same way. That visual parity is exactly what the owner asked for — "select the template the same way
// we choose the colour themes." Theme-token (`--hx-*`) styled, so it re-skins with the picker.
import type { CSSProperties } from 'react';

const box: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 6,
  border: '1px solid var(--hx-line)',
  background: 'var(--hx-navy-0, #010a13)',
  padding: 5,
  display: 'flex',
  gap: 4,
  overflow: 'hidden',
};
const bar = (extra?: CSSProperties): CSSProperties => ({ background: 'var(--hx-panel-2, #142436)', borderRadius: 2, ...extra });
const accent = (extra?: CSSProperties): CSSProperties => ({ background: 'var(--hx-teal-1, #0ac8b9)', borderRadius: 2, opacity: 0.85, ...extra });
const gold = (extra?: CSSProperties): CSSProperties => ({ background: 'var(--hx-gold-2, #c8aa6e)', borderRadius: 2, opacity: 0.7, ...extra });

/** A narrow identity column shared by the Codex + Dashboard diagrams. */
function IdentityCol() {
  return (
    <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={accent({ height: 8 })} />
      <div style={bar({ flex: 1 })} />
      <div style={gold({ height: 6 })} />
    </div>
  );
}

export default function FormatPreview({ id }: { id: string }) {
  if (id === 'codex') {
    // Identity column + a rail of stacked resizable panes.
    return (
      <div style={box} aria-hidden>
        <IdentityCol />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={accent({ height: 9 })} />
          <div style={bar({ flex: 1 })} />
          <div style={bar({ height: 8 })} />
        </div>
      </div>
    );
  }
  if (id === 'dashboard') {
    // Identity column + a reflowing grid of cards.
    return (
      <div style={box} aria-hidden>
        <IdentityCol />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: 3 }}>
          <div style={bar()} /><div style={bar()} />
          <div style={bar()} /><div style={accent()} />
        </div>
      </div>
    );
  }
  if (id === 'play') {
    // A big vitals band + two action blocks + a thin reference drawer.
    return (
      <div style={{ ...box, flexDirection: 'column' }} aria-hidden>
        <div style={accent({ height: 12 })} />
        <div style={{ flex: 1, display: 'flex', gap: 3 }}>
          <div style={bar({ flex: 1 })} /><div style={bar({ flex: 1 })} />
        </div>
        <div style={gold({ height: 5 })} />
      </div>
    );
  }
  // classic — tabs across the top, one section below, stats in a header.
  return (
    <div style={{ ...box, flexDirection: 'column' }} aria-hidden>
      <div style={gold({ height: 7 })} />
      <div style={{ display: 'flex', gap: 3 }}>
        <div style={accent({ height: 6, flex: 1 })} />
        <div style={bar({ height: 6, flex: 1 })} />
        <div style={bar({ height: 6, flex: 1 })} />
      </div>
      <div style={bar({ flex: 1, marginTop: 3 })} />
    </div>
  );
}
