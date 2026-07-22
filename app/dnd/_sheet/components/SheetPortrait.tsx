// SheetPortrait — the uploaded character art as a portrait card, for the BESPOKE PF2/IG sheets (CX-R4).
//
// The 5e formats already render the portrait (IdentityColumn / play-portrait / hero); the PF2 and IG
// sheets were never even PASSED the art, so it showed in none of their formats — the owner's "I can't
// see my character art" at its source. This is the shared block those sheets now render in their
// identity node (codex/dashboard/play) and their classic header, mirroring `codex-portrait` so the
// art reads the same across every format and system. Renders nothing when there is no art.
//
// It is a plain, prop-driven server-safe component (no store, no hooks): the bespoke sheets are fed the
// art URL from the server (`character.art_url`), exactly as the 5e store seeds `media.artUrl`.

export default function SheetPortrait({
  artUrl,
  name,
  className,
}: {
  artUrl?: string | null;
  name?: string | null;
  /** Extra class on the wrapper — `codex-portrait` inside a shell identity column, omitted in a header. */
  className?: string;
}) {
  if (!artUrl) return null;
  return (
    <div className={`card codex-portrait${className ? ` ${className}` : ''}`} style={{ padding: 6, overflow: 'hidden', borderRadius: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artUrl}
        alt={`${name ?? 'Character'} — character art`}
        style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', objectPosition: '50% 12%', borderRadius: 8 }}
      />
    </div>
  );
}
