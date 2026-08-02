// app/AndrewAsh/_ui/Photo.tsx — one way to put one of Andrew's photographs on a page.
//
// A `<picture>` with a WebP source and a JPEG fallback, dimensions from the generated manifest, and
// lazy loading everywhere except the hero.
//
// ── WHY THE DIMENSIONS ARE NOT OPTIONAL ─────────────────────────────────────────────────────────
//
// Every photo here is a different shape — 640×640 for the monochrome portrait, 1600×1067 for the
// graduation shots, 1342×2048 for the recital. Without width and height the browser cannot reserve
// space, so the page reflows as each image arrives, which on a photo-heavy portfolio means text
// jumping under the reader's eyes for the first two seconds. The manifest is generated from the
// actual files by `scripts/prepare-andrew-photos.mjs`, so these numbers cannot drift from the bytes.
//
// Next's `<Image>` is not used, deliberately. It would optimise these at request time, but the
// pipeline already emitted WebP at two widths at build time; running them through a second optimiser
// costs a serverless invocation per image for no quality gain, and — the reason that actually
// decides it — makes the images depend on Next's image server, which is the first thing to break
// when this site is lifted onto a static host or Squarespace.

import { photoById, photoUrl, photoUrlWebp } from '@/lib/voice/photos';

interface Props {
  /** Manifest id, e.g. 'portrait-formal'. */
  id: string;
  /** 'card' loads the 800px derivative. Use it for anything rendered below ~500px wide. */
  size?: 'full' | 'card';
  /** Overrides the manifest alt text. Pass '' for a purely decorative image. */
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** True for above-the-fold images: skips lazy loading and hints high priority. */
  priority?: boolean;
  /** Overrides the manifest's focal point. Only pass this when a specific crop needs something the
   *  photograph's own framing does not give — the default is right nearly every time. */
  objectPosition?: string;
  sizes?: string;
}

export default function Photo({
  id,
  size = 'full',
  alt,
  className,
  style,
  priority = false,
  objectPosition,
  sizes,
}: Props): React.ReactElement | null {
  const meta = photoById(id);
  // An unknown id renders nothing rather than a broken-image icon. Photo ids come from the database
  // (a page's cover, the hero setting), so a stale id is a normal consequence of editing, not a bug
  // worth showing a visitor.
  if (!meta) return null;

  const resolvedAlt = alt !== undefined ? alt : meta.alt;

  // THE FOCAL POINT IS APPLIED BY DEFAULT, NOT ON REQUEST.
  //
  // The bug this prevents shipped once: three service cards, each cropping a 16:10 window out of a
  // portrait or square photograph, all using `object-fit: cover`'s default centre gravity. One of
  // them cropped Andrew's head off completely and rendered a photograph of a staircase.
  //
  // Making `object-position` opt-in would fix those three call sites and leave the next one to
  // rediscover the same bug. Reading it from the manifest means the framing is a property of the
  // PHOTOGRAPH — so every crop, on every page, in every widget Andrew builds later, is framed on his
  // face without anyone having to remember.
  const focal = objectPosition ?? meta.focal;

  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`${photoUrlWebp(id, 'card')} 800w, ${photoUrlWebp(id, 'full')} ${meta.width}w`}
        sizes={sizes ?? (size === 'card' ? '(max-width: 700px) 100vw, 400px' : '100vw')}
      />
      <img
        src={photoUrl(id, size)}
        srcSet={`${photoUrl(id, 'card')} 800w, ${photoUrl(id, 'full')} ${meta.width}w`}
        sizes={sizes ?? (size === 'card' ? '(max-width: 700px) 100vw, 400px' : '100vw')}
        alt={resolvedAlt}
        width={meta.width}
        height={meta.height}
        className={className}
        style={{ objectPosition: focal, ...style }}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </picture>
  );
}
