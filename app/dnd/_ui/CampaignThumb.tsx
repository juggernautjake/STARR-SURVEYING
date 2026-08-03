// app/dnd/_ui/CampaignThumb.tsx — the campaign's picture, rendered the same way everywhere (P14-10).
//
// Owner: *"This should show up everywhere the campaign shows up to be opened more or less."* The doc's own
// warning about that request is the reason this is a component rather than an `<img>` copied nine times:
// *"a thumbnail added in one place and rendered in one place is the 'authored but not wired' shape again."*
//
// A copied `<img>` is nine chances to forget the fallback, and the FALLBACK is the common case — most
// campaigns have no picture, so a surface that renders nothing for them gets a ragged grid where some
// cards have art and others have a hole. This renders a monogram tile instead, so every card is the same
// shape whether or not the DM has uploaded anything.
//
// NOT A NEXT `<Image>`: these URLs are Supabase public-storage links on a host that would have to be in
// `next.config` `remotePatterns`, and every other D&D image in this app (`CampaignHub`'s banner, creature
// art, character portraits) is a plain `<img>` for the same reason. One odd one out would be the
// surprising thing here, not the consistency.
import type { CSSProperties } from 'react';

/** A stable colour per campaign, so the placeholder is recognisably THIS table rather than generic grey.
 *  Hashed from the id — the same campaign gets the same tile on every surface and across reloads, which
 *  is what makes it usable as an identifier at all. */
function monogramHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** First letters of the first two words — "The Hollow Crown" → "TH". Falls back to one letter, then to a
 *  die, so a campaign named with an emoji or a single character still gets a tile rather than a blank. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? '').join('');
  return letters.toUpperCase() || '🎲';
}

export type CampaignThumbSize = 'row' | 'card' | 'banner';

const SIZES: Record<CampaignThumbSize, { w: number | string; h: number; radius: number; font: number }> = {
  /** Beside a one-line list entry. */
  row: { w: 34, h: 34, radius: 7, font: 13 },
  /** The image at the top of a card in a grid. */
  card: { w: '100%', h: 104, radius: 9, font: 26 },
  /** The wide strip at the top of the campaign hub — the surface the picture originally existed for. */
  banner: { w: '100%', h: 220, radius: 12, font: 44 },
};

export default function CampaignThumb({
  campaignId,
  name,
  url,
  size = 'row',
  style,
}: {
  campaignId: string;
  name: string;
  /** The campaign's picture, or null. Null is the COMMON case — see the note above. */
  url?: string | null;
  size?: CampaignThumbSize;
  style?: CSSProperties;
}) {
  const s = SIZES[size];
  const base: CSSProperties = {
    width: s.w, height: s.h, borderRadius: s.radius, flex: 'none',
    border: '1px solid var(--hx-line)', overflow: 'hidden', ...style,
  };

  if (url) {
    return (
      <img
        src={url}
        // The name, not "campaign thumbnail" — a screen reader reading nine identical alt texts down a
        // grid learns nothing. Where the name is also rendered as text beside it the image is decorative,
        // but these are links whose target IS the campaign, so naming it is the useful reading.
        alt={name}
        loading="lazy"
        style={{ ...base, objectFit: 'cover', display: 'block', background: 'var(--hx-inset-strong)' }}
      />
    );
  }

  const hue = monogramHue(campaignId || name);
  return (
    <div
      aria-hidden
      style={{
        ...base,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--hx-font-display)', fontWeight: 700, fontSize: s.font,
        letterSpacing: '0.04em',
        color: `hsl(${hue} 55% 78%)`,
        background: `linear-gradient(145deg, hsl(${hue} 42% 22%), hsl(${(hue + 40) % 360} 38% 14%))`,
      }}
    >
      {monogram(name)}
    </div>
  );
}
