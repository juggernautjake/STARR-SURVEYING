// lib/branding/asset-store.ts
//
// Server side of the uploaded brand library: the bucket name, the role gate, and the one place a
// database row is turned into the shape the portal renders.
//
// ── WHY THE MAPPING IS NOT IN THE ROUTES ────────────────────────────────────────────────────────
//
// Five routes read these two tables. A row→object mapping copied five times is five chances for one
// of them to forget `variants`, return `snake_case` for one field, or build a file URL by hand — and
// the symptom of the last one is a broken image, which looks like a storage problem and is not.
//
// It also keeps the SELECT column lists together. `select('*')` on a table with a `storage_path` is
// how an internal bucket key ends up in a JSON response; every select below is explicit, and
// `storage_path` is deliberately absent from what reaches the client.
//
// Imports `supabaseAdmin`, so this module is server-only. The pure half — kinds, plates, validation,
// the size ladder — is `lib/branding/uploads.ts`, which a client component may import.

import { supabaseAdmin } from '@/lib/supabase';
import {
  uploadedAssetUrl,
  type BrandAsset,
  type BrandAssetVariant,
  type UploadKind,
  type UploadPlate,
  type UploadStatus,
} from './uploads';

export const BRAND_BUCKET = 'starr-brand-assets';

/**
 * Who may see and change the uploaded library.
 *
 * The same five as the page, `middleware.ts` and the resize endpoint. Stated here as well because a
 * route that trusts middleware alone is a route that is unguarded the day somebody adds a matcher
 * exception — and this one accepts files.
 */
export const BRAND_ROLES = ['admin', 'developer', 'tech_support', 'teacher', 'employee'] as const;

export function mayManageBrandAssets(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => (BRAND_ROLES as readonly string[]).includes(r));
}

// The columns that leave the server. `storage_path` is not among them.
const ASSET_COLUMNS =
  'id, slug, name, kind, note, description, use_cases, avoid, colours, fonts, min_size, plate, '
  + 'file_type, original_filename, width, height, bytes, status, created_by, created_at, updated_at';

const VARIANT_COLUMNS =
  'id, asset_id, label, file_type, width, height, bytes, is_original, source, created_at';

interface AssetRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  note: string | null;
  description: string | null;
  use_cases: string[] | null;
  avoid: string[] | null;
  colours: string[] | null;
  fonts: string[] | null;
  min_size: string | null;
  plate: string;
  file_type: string;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface VariantRow {
  id: string;
  asset_id: string;
  label: string;
  file_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  is_original: boolean;
  source: string;
  created_at: string;
}

function toVariant(assetId: string, r: VariantRow): BrandAssetVariant {
  return {
    id: r.id,
    label: r.label,
    fileType: r.file_type,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    isOriginal: r.is_original,
    source: r.source === 'generated' ? 'generated' : 'upload',
    createdAt: r.created_at,
    url: uploadedAssetUrl(assetId, r.id),
  };
}

export function toAsset(r: AssetRow, variants: VariantRow[]): BrandAsset {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind as UploadKind,
    note: r.note,
    description: r.description,
    useCases: r.use_cases ?? [],
    avoid: r.avoid ?? [],
    colours: r.colours ?? [],
    fonts: r.fonts ?? [],
    minSize: r.min_size,
    plate: r.plate as UploadPlate,
    fileType: r.file_type,
    originalFilename: r.original_filename,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    status: r.status as UploadStatus,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Biggest first, and the original last only if it is not also the biggest — sorted by width
    // descending with the original pinned first, because it is the one people mean by "the file".
    variants: [...variants]
      .sort((a, b) => (Number(b.is_original) - Number(a.is_original)) || ((b.width ?? 0) - (a.width ?? 0)))
      .map((v) => toVariant(r.id, v)),
    url: uploadedAssetUrl(r.id),
  };
}

/**
 * Every uploaded asset with its variants.
 *
 * Two queries and a join in memory rather than PostgREST's embedded select. The embed works, but it
 * returns the child rows under a key named after the FOREIGN KEY CONSTRAINT, which changes if the
 * constraint is ever renamed — a rename that would break this silently, returning assets with no
 * variants and no error. Two explicit queries cannot do that.
 */
export async function listAssets(opts: { includeArchived?: boolean } = {}): Promise<BrandAsset[]> {
  let q = supabaseAdmin.from('brand_assets').select(ASSET_COLUMNS).order('created_at', { ascending: false });
  if (!opts.includeArchived) q = q.neq('status', 'archived');

  const { data: assets, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (assets ?? []) as unknown as AssetRow[];
  if (rows.length === 0) return [];

  const { data: variants, error: vErr } = await supabaseAdmin
    .from('brand_asset_variants')
    .select(VARIANT_COLUMNS)
    .in('asset_id', rows.map((a) => a.id));
  if (vErr) throw new Error(vErr.message);

  const byAsset = new Map<string, VariantRow[]>();
  for (const v of (variants ?? []) as unknown as VariantRow[]) {
    byAsset.set(v.asset_id, [...(byAsset.get(v.asset_id) ?? []), v]);
  }

  return rows.map((a) => toAsset(a, byAsset.get(a.id) ?? []));
}

export async function getAsset(id: string): Promise<BrandAsset | null> {
  const { data, error } = await supabaseAdmin
    .from('brand_assets').select(ASSET_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: variants, error: vErr } = await supabaseAdmin
    .from('brand_asset_variants').select(VARIANT_COLUMNS).eq('asset_id', id);
  if (vErr) throw new Error(vErr.message);

  return toAsset(data as unknown as AssetRow, (variants ?? []) as unknown as VariantRow[]);
}

/**
 * The bucket key for one variant, looked up rather than constructed.
 *
 * The file route needs the storage path, which `toAsset` deliberately does not carry. Fetching it
 * by id here keeps the path server-side and means no route ever builds a key from a request
 * parameter — the same discipline the resize endpoint states in its own header.
 */
export async function variantStoragePath(
  assetId: string,
  variantId: string | null,
): Promise<{ path: string; fileType: string; label: string } | null> {
  if (variantId) {
    const { data, error } = await supabaseAdmin
      .from('brand_asset_variants')
      .select('storage_path, file_type, label, asset_id')
      .eq('id', variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // The asset_id check is what stops a variant of one asset being served under another's id.
    if (!data || (data as { asset_id: string }).asset_id !== assetId) return null;
    const d = data as { storage_path: string; file_type: string; label: string };
    return { path: d.storage_path, fileType: d.file_type, label: d.label };
  }

  const { data, error } = await supabaseAdmin
    .from('brand_assets').select('storage_path, file_type, name').eq('id', assetId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as { storage_path: string; file_type: string; name: string };
  return { path: d.storage_path, fileType: d.file_type, label: d.name };
}

/**
 * A slug nothing else is using.
 *
 * Reads the taken ones and counts up. Not a loop of INSERT-and-catch: the unique constraint is the
 * backstop, but relying on it for the normal case means the normal case is an error path, and the
 * error a caller would see is a Postgres constraint message rather than a sentence.
 */
export async function uniqueSlug(base: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('brand_assets').select('slug').like('slug', `${base}%`);
  if (error) throw new Error(error.message);
  const taken = new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // A thousand assets sharing one name is not a case worth designing for, but returning a duplicate
  // would hit the unique constraint and 500. A timestamp always terminates.
  return `${base}-${Date.now()}`;
}
