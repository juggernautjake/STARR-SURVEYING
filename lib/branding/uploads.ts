// lib/branding/uploads.ts
//
// ── THE UPLOAD CONTRACT, IN ONE PLACE ───────────────────────────────────────────────────────────
//
// Owner: *"I also want it so that I can upload new designs to the branding kit. There needs to be a
// whole process for uploading a design. when uploading, we can just upload the image, or we can
// fill out all of the color and font and use case and description information. We should be able to
// add multiple resolution variations to it as well."*
//
// The form that collects a profile and the route that stores one have to agree about what a profile
// IS — which kinds exist, which fields are required, which colour names are real, what a variation
// may be called. Two copies of those rules is how a form offers a kind the API rejects.
//
// So: pure data and pure functions, no React and no server imports, importable from a client
// component, a route handler and a test. The same arrangement `palette.ts` uses, for the same
// reason.
//
// ── VALIDATION LIVES HERE AND RUNS ON THE SERVER ────────────────────────────────────────────────
//
// `validateProfile` is called by the route, not only by the form. A client-side check is a courtesy
// to the person typing; it is not a constraint, because the route is reachable without the form.
// The form calls it too, so the message somebody sees while typing is the same sentence the server
// would have sent back.

import { BRAND_COLOURS, BRAND_FONTS } from './palette';

// ── kinds ───────────────────────────────────────────────────────────────────────────────────────
//
// The five from `LogoKind`, plus two an upload can be that a built-in mark never is. `photo` covers
// the product and jobsite photography somebody will inevitably add; `pattern` covers repeats and
// textures. `other` is last and exists so the first path — upload the image, fill nothing in — has
// a valid answer without the person having to choose one.

export const UPLOAD_KINDS = [
  { id: 'badge', label: 'Circular badge', hint: 'A ring-and-centre mark in the badge family.' },
  { id: 'lockup', label: 'Lockup', hint: 'Mark and wordmark set together — wider than it is tall.' },
  { id: 'mark', label: 'Mark or wordmark', hint: 'Works alone, without the company name beside it.' },
  { id: 'heritage', label: 'Heritage colourway', hint: 'One hue plus cream. Merchandise and retail.' },
  { id: 'apparel', label: 'Apparel or embroidery', hint: 'A photograph of the mark on a real garment.' },
  { id: 'photo', label: 'Photograph', hint: 'Jobsite, crew, equipment or product photography.' },
  { id: 'pattern', label: 'Pattern or texture', hint: 'A repeat, a background, a fill.' },
  { id: 'other', label: 'Something else', hint: 'The honest answer when none of the above fits.' },
] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number]['id'];

export const UPLOAD_KIND_IDS: UploadKind[] = UPLOAD_KINDS.map((k) => k.id);

export function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === 'string' && (UPLOAD_KIND_IDS as string[]).includes(v);
}

// ── plates ──────────────────────────────────────────────────────────────────────────────────────
//
// The ground a mark is previewed on. Same five as `Plate` in logos.ts, and for the same reason
// stated in the header of Branding.css: a red-on-white badge shown on a themed dark card is a
// different picture that happens to contain the same pixels.

export const UPLOAD_PLATES = [
  { id: 'white', label: 'White', hint: 'The default. Most marks are drawn for white.' },
  { id: 'mist', label: 'Light grey', hint: 'For a mark with white in it that would vanish on white.' },
  { id: 'dark', label: 'Dark', hint: 'For reversed and knocked-out artwork.' },
  { id: 'cream', label: 'Cream', hint: 'Heritage colourways, which are drawn for cream paper.' },
  { id: 'none', label: 'No plate', hint: 'Photographs. A plate behind a photograph is a border.' },
] as const;

export type UploadPlate = (typeof UPLOAD_PLATES)[number]['id'];

export function isUploadPlate(v: unknown): v is UploadPlate {
  return typeof v === 'string' && UPLOAD_PLATES.some((p) => p.id === v);
}

export const UPLOAD_STATUSES = ['draft', 'approved', 'archived'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export function isUploadStatus(v: unknown): v is UploadStatus {
  return typeof v === 'string' && (UPLOAD_STATUSES as readonly string[]).includes(v);
}

// ── what the browser may send ───────────────────────────────────────────────────────────────────
//
// The bucket's own allowlist is the binding one (seeds/622). This list must be a SUBSET of it, and
// the test holds it against the seed — a client that offers a type the bucket refuses is an upload
// that spends every byte before being told no, which is the exact failure `lib/storage/uploads.ts`
// was written about.

export const ACCEPTED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** The `accept` attribute for the file input, derived so it cannot drift from the list above. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED_MIME).join(',');

/**
 * 25 MB — the bucket's `file_size_limit` in seeds/622.
 *
 * Deliberately NOT `uploadCapBytes()` from lib/storage/uploads.ts. That constant is 500 MB and
 * describes the three video-and-document buckets; this bucket is 25 MB. A cap BELOW the server's
 * only ever refuses early, which is safe. The unsafe direction is a client cap above the bucket's.
 */
export const BRAND_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** A raster type sharp can resize. SVG and PDF are stored and served, never resized. */
export function isResizable(mime: string): boolean {
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/gif';
}

// ── the size ladder ─────────────────────────────────────────────────────────────────────────────
//
// What "add a resolution variation" offers. Wider than the five in `ASSET_SIZES` — that ladder
// serves the built-in marks on demand and never stores anything, so it can be short. These are
// stored files somebody chooses deliberately, and the two ends matter: 4096 for large-format print,
// 64 for a favicon.
//
// Each carries what it is FOR, because "512px" is not a reason and somebody choosing between five
// numbers with no captions picks the biggest every time.

export interface VariantSize {
  width: number;
  label: string;
  use: string;
}

export const VARIANT_SIZES: VariantSize[] = [
  { width: 4096, label: '4096px', use: 'Large-format print — vehicle wraps, yard signs, banners.' },
  { width: 2048, label: '2048px', use: 'Print at page size, presentation covers, retina web hero.' },
  { width: 1024, label: '1024px', use: 'The general-purpose one. Slides, documents, web.' },
  { width: 512, label: '512px', use: 'App icons, social avatars, email signatures.' },
  { width: 256, label: '256px', use: 'Thumbnails, list rows, small web marks.' },
  { width: 128, label: '128px', use: 'Favicons at 2×, tiny UI marks.' },
  { width: 64, label: '64px', use: 'Favicon. Below this the badge fills in — use the star mark.' },
];

/**
 * Which ladder rungs are worth offering for a source of this width.
 *
 * Upscaling is the trap. A 700px original resized to 4096px is a bigger file carrying no more
 * detail, and offering it is offering somebody a worse version of what they already have — they
 * take it to a sign shop and find out there. So the ladder stops at the source width, and the
 * source's own size is always available as the original.
 *
 * `null` for a source whose width is unknown (SVG, PDF): the whole ladder is meaningless there,
 * and the caller shows the upload path instead.
 */
export function offeredSizes(sourceWidth: number | null | undefined): VariantSize[] | null {
  if (!sourceWidth || !Number.isFinite(sourceWidth) || sourceWidth <= 0) return null;
  return VARIANT_SIZES.filter((s) => s.width <= sourceWidth);
}

// ── the profile ─────────────────────────────────────────────────────────────────────────────────

export interface AssetProfileInput {
  name?: string;
  kind?: string;
  note?: string;
  description?: string;
  useCases?: string[];
  avoid?: string[];
  colours?: string[];
  fonts?: string[];
  minSize?: string;
  plate?: string;
  status?: string;
}

export interface ProfileProblem {
  field: string;
  message: string;
}

/**
 * What is wrong with this profile, if anything.
 *
 * Returns a list rather than throwing on the first: a form that reports one problem per submit is a
 * form somebody submits six times. An EMPTY list is the valid answer for `{ name: 'Something' }` —
 * the image-only path has to pass this, or the two paths the owner asked for become one.
 */
export function validateProfile(input: AssetProfileInput): ProfileProblem[] {
  const problems: ProfileProblem[] = [];

  const name = (input.name ?? '').trim();
  if (!name) {
    problems.push({ field: 'name', message: 'A name is needed — an asset with no name cannot be found again.' });
  } else if (name.length > 120) {
    problems.push({ field: 'name', message: 'Keep the name under 120 characters.' });
  }

  if (input.kind !== undefined && !isUploadKind(input.kind)) {
    problems.push({ field: 'kind', message: `"${input.kind}" is not one of the ${UPLOAD_KINDS.length} kinds.` });
  }
  if (input.plate !== undefined && !isUploadPlate(input.plate)) {
    problems.push({ field: 'plate', message: `"${input.plate}" is not one of the ${UPLOAD_PLATES.length} plates.` });
  }
  if (input.status !== undefined && !isUploadStatus(input.status)) {
    problems.push({ field: 'status', message: `"${input.status}" is not a valid status.` });
  }

  // The load-bearing check. A colour name that does not resolve renders as a chip with no swatch
  // and a blank hex — a confident wrong answer to "what red is in this?", which is the exact defect
  // `logos.ts` names in its own header.
  for (const c of input.colours ?? []) {
    if (!BRAND_COLOURS.some((b) => b.name === c)) {
      problems.push({ field: 'colours', message: `"${c}" is not a colour in the palette.` });
    }
  }

  // Fonts are looser on purpose: most marks are custom lettering, and "Custom lettering — not set in
  // a typeface" is the honest and most common answer. So a font is either one of the ten, or free
  // text describing what it actually is. What it may not be is empty.
  for (const f of input.fonts ?? []) {
    if (!f.trim()) problems.push({ field: 'fonts', message: 'A blank line in the type list.' });
  }

  for (const [field, list] of [['useCases', input.useCases], ['avoid', input.avoid]] as const) {
    for (const item of list ?? []) {
      if (!item.trim()) problems.push({ field, message: 'A blank line in the list.' });
    }
  }

  if ((input.description ?? '').length > 4000) {
    problems.push({ field: 'description', message: 'The description is over 4000 characters.' });
  }
  if ((input.note ?? '').length > 300) {
    problems.push({ field: 'note', message: 'The caption is over 300 characters — it renders on one card line.' });
  }

  return problems;
}

/** The ten faces plus the honest non-answer, for the font picker. */
export const CUSTOM_LETTERING = 'Custom lettering — not set in a typeface';

export function fontChoices(): string[] {
  return [CUSTOM_LETTERING, ...BRAND_FONTS.map((f) => f.name)];
}

// ── slugs ───────────────────────────────────────────────────────────────────────────────────────

/**
 * A URL-safe handle for a name.
 *
 * Collisions are resolved by the route with a numeric suffix rather than rejected. Somebody
 * uploading a second "Star Mark" wants a second asset; an error about a slug they never typed is a
 * failure to do the obvious thing.
 */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // A name of nothing but punctuation slugifies to '' and would collide with every other such name.
  return base || 'asset';
}

// ── the shapes the API speaks ───────────────────────────────────────────────────────────────────

export interface BrandAssetVariant {
  id: string;
  label: string;
  fileType: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isOriginal: boolean;
  source: 'upload' | 'generated';
  createdAt: string;
  /** Where the bytes are served from. Built by the API so the client never assembles a path. */
  url: string;
}

export interface BrandAsset {
  id: string;
  slug: string;
  name: string;
  kind: UploadKind;
  note: string | null;
  description: string | null;
  useCases: string[];
  avoid: string[];
  colours: string[];
  fonts: string[];
  minSize: string | null;
  plate: UploadPlate;
  fileType: string;
  originalFilename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  status: UploadStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  variants: BrandAssetVariant[];
  /** The original's URL, for the card thumbnail. */
  url: string;
}

/** Where an uploaded asset's bytes are served from. One builder, so the API and the UI agree. */
export function uploadedAssetUrl(assetId: string, variantId?: string): string {
  const q = variantId ? `?variant=${encodeURIComponent(variantId)}` : '';
  return `/api/admin/branding/assets/${encodeURIComponent(assetId)}/file${q}`;
}

/** Human bytes. Used on the variant rows, where "2.4 MB" is the number somebody is deciding on. */
export function humanBytes(n: number | null | undefined): string {
  if (!n || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
