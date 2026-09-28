#!/usr/bin/env node
// scripts/convert-heic-in-storage.mjs
//
// One-off, run-by-hand: find iPhone HEIC photos ALREADY in Supabase Storage, write a JPEG copy next to
// each one, and (optionally) point the database rows that reference the HEIC at the JPEG instead.
//
// You do not NEED to run this. Since 2026-09-27 the site shows existing HEICs anyway — the browser
// converts them on view (lib/images/heic-display.ts). Run it when you want the files themselves to
// be JPEGs: for downloads, for other tools, for Windows machines opening the bucket directly.
//
// ── SAFETY ─────────────────────────────────────────────────────────────────────────────────────
//
//   * DRY RUN BY DEFAULT. Without --apply nothing is written anywhere; it lists what it WOULD do.
//   * ORIGINALS ARE NEVER DELETED. The JPEG is written alongside (`IMG_1.HEIC` → `IMG_1.jpg`); if
//     that name is taken, `IMG_1-converted.jpg`. Nothing in this script calls `remove`.
//   * Database references are only rewritten with --apply --update-refs, only in the tables listed in
//     REFS below, and only on rows whose path matches the HEIC exactly. A reference to the original
//     still works either way (the original is still there).
//   * Re-runnable: a JPEG that already exists is not written again.
//
// ── USAGE ──────────────────────────────────────────────────────────────────────────────────────
//
// Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment,
// and Node 22.18+ (it imports the app's TypeScript decode core directly).
//
//   node --env-file=.env.local scripts/convert-heic-in-storage.mjs                     # dry run, all buckets
//   node --env-file=.env.local scripts/convert-heic-in-storage.mjs --bucket starr-field-files
//   node --env-file=.env.local scripts/convert-heic-in-storage.mjs --bucket file-explorer --apply
//   node --env-file=.env.local scripts/convert-heic-in-storage.mjs --apply --update-refs --limit 20
//
//   --bucket <id>    only this bucket (repeatable). Default: every bucket in the project.
//   --prefix <p>     only objects under this folder.
//   --limit <n>      stop after n HEICs (a good first --apply is a small one).
//   --apply          actually write the JPEGs.
//   --update-refs    with --apply: also rewrite the DB rows in REFS to point at the JPEG.
//
// Try it against a staging/branch project first. It has never been run against production by the
// session that wrote it.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ── args ─────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const values = (f) => argv.flatMap((a, i) => (a === f && argv[i + 1] ? [argv[i + 1]] : []));
const APPLY = flag('--apply');
const UPDATE_REFS = APPLY && flag('--update-refs');
const ONLY_BUCKETS = values('--bucket');
const PREFIX = values('--prefix')[0] ?? '';
const LIMIT = Number(values('--limit')[0] ?? Infinity);
if (flag('--update-refs') && !APPLY) {
  console.log('Note: --update-refs does nothing without --apply (dry run shows which rows WOULD change).');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See the header of this file.');
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// The app's own detection + decode (TypeScript, no path aliases — Node strips the types).
const { isHeicBytes, toJpegFileName } = await import('../lib/images/heic-detect.ts');
const { decodeHeicPrimary } = await import('../lib/images/heic-decode-core.ts');
const libheif = require('libheif-js/wasm-bundle');

// ── where the database points at stored files ────────────────────────────────────────────────────
// Only tables whose columns were read from the code that writes them. `bucketCol` rows say which
// bucket per row; the rest are implied by `bucket`.
const REFS = [
  { table: 'file_nodes', bucketCol: 'storage_bucket', pathCol: 'storage_path', mimeCol: 'mime_type', nameCol: 'name' },
  { table: 'job_files', bucketCol: 'storage_bucket', defaultBucket: 'starr-field-files', pathCol: 'storage_path', mimeCol: 'content_type', nameCol: 'file_name' },
  { table: 'user_files', bucket: 'user-files', pathCol: 'storage_path', mimeCol: 'file_type', nameCol: 'file_name' },
  { table: 'research_documents', bucket: 'research-documents', pathCol: 'storage_path', extCol: 'file_type', urlCol: 'storage_url' },
  { table: 'equipment_inventory', bucket: 'starr-field-equipment-photos', pathCol: 'photo_url' },
  { table: 'vehicle_photos', bucket: 'vehicle-photos', pathCol: 'photo_path' },
  { table: 'vehicles', bucket: 'vehicle-photos', pathCol: 'primary_photo_path' },
  { table: 'receipts', bucket: 'starr-field-receipts', pathCol: 'photo_url' },
];

const HEIC_NAME = /\.(heic|heif|hif)$/i;

async function* walk(bucket, prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) return;
    for (const o of data) {
      const path = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) yield* walk(bucket, path); // a folder
      else yield { path, mime: o.metadata?.mimetype ?? null, size: o.metadata?.size ?? null };
    }
    if (data.length < 1000) return;
  }
}

async function exists(bucket, path) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 100 });
  return (data ?? []).some((o) => o.name === name);
}

async function toJpeg(bytes) {
  const d = await decodeHeicPrimary(libheif, bytes);
  return sharp(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength), { raw: { width: d.width, height: d.height, channels: 4 } })
    .removeAlpha().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

async function refRows(ref, bucket, oldPath) {
  if (ref.bucket && ref.bucket !== bucket) return [];
  let q = supabase.from(ref.table).select('*').eq(ref.pathCol, oldPath).limit(50);
  if (ref.bucketCol) {
    q = ref.defaultBucket === bucket
      ? q.or(`${ref.bucketCol}.eq.${bucket},${ref.bucketCol}.is.null`)
      : q.eq(ref.bucketCol, bucket);
  }
  const { data, error } = await q;
  if (error) return { error: error.message };
  return data ?? [];
}

async function updateRefs(bucket, oldPath, newPath) {
  const report = [];
  for (const ref of REFS) {
    const rows = await refRows(ref, bucket, oldPath);
    if (!Array.isArray(rows)) { report.push(`${ref.table}: skipped (${rows.error})`); continue; }
    if (rows.length === 0) continue;
    if (!UPDATE_REFS) { report.push(`${ref.table}: ${rows.length} row(s) would point at the JPEG`); continue; }
    for (const row of rows) {
      const patch = { [ref.pathCol]: newPath };
      if (ref.mimeCol) patch[ref.mimeCol] = 'image/jpeg';
      if (ref.nameCol && typeof row[ref.nameCol] === 'string' && HEIC_NAME.test(row[ref.nameCol])) patch[ref.nameCol] = toJpegFileName(row[ref.nameCol]);
      if (ref.extCol) patch[ref.extCol] = 'jpg';
      if (ref.urlCol && typeof row[ref.urlCol] === 'string') patch[ref.urlCol] = row[ref.urlCol].split(oldPath).join(newPath);
      const { error } = await supabase.from(ref.table).update(patch).eq('id', row.id).eq(ref.pathCol, oldPath);
      report.push(`${ref.table} ${row.id}: ${error ? `FAILED ${error.message}` : 'updated'}`);
    }
  }
  return report;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${UPDATE_REFS ? 'writing JPEGs and updating references' : APPLY ? 'writing JPEGs, references untouched' : 'nothing will be written'}`);

let buckets = ONLY_BUCKETS;
if (buckets.length === 0) {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) { console.error(`listBuckets: ${error.message}`); process.exit(1); }
  buckets = (data ?? []).map((b) => b.id);
}

const totals = { seen: 0, heic: 0, converted: 0, existing: 0, notHeic: 0, failed: 0 };
outer: for (const bucket of buckets) {
  for await (const obj of walk(bucket, PREFIX)) {
    totals.seen += 1;
    const declared = HEIC_NAME.test(obj.path) || /^image\/hei[cf]/i.test(obj.mime ?? '');
    if (!declared) continue;
    if (totals.heic >= LIMIT) break outer;

    const { data: blob, error } = await supabase.storage.from(bucket).download(obj.path);
    if (error || !blob) { totals.failed += 1; console.log(`  ✗ ${bucket}/${obj.path}: download failed (${error?.message})`); continue; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!isHeicBytes(bytes.subarray(0, 64))) { totals.notHeic += 1; console.log(`  - ${bucket}/${obj.path}: named HEIC but is not; left alone`); continue; }
    totals.heic += 1;

    const dir = obj.path.includes('/') ? obj.path.slice(0, obj.path.lastIndexOf('/') + 1) : '';
    let target = dir + toJpegFileName(obj.path);
    if (target === obj.path) target = dir + toJpegFileName(obj.path).replace(/\.jpg$/, '-converted.jpg');
    const already = await exists(bucket, target);

    if (!APPLY) {
      console.log(`  • ${bucket}/${obj.path} → ${target}${already ? ' (JPEG already there)' : ''}`);
    } else if (already) {
      totals.existing += 1;
      console.log(`  = ${bucket}/${obj.path} → ${target} (already converted)`);
    } else {
      try {
        const jpeg = await toJpeg(bytes);
        const { error: upErr } = await supabase.storage.from(bucket).upload(target, jpeg, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw new Error(upErr.message);
        totals.converted += 1;
        console.log(`  ✓ ${bucket}/${obj.path} → ${target} (${Math.round(bytes.length / 1024)} KB → ${Math.round(jpeg.length / 1024)} KB)`);
      } catch (err) {
        totals.failed += 1;
        console.log(`  ✗ ${bucket}/${obj.path}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }
    for (const line of await updateRefs(bucket, obj.path, target)) console.log(`      ${line}`);
  }
}

console.log('\nSummary:', totals);
if (!APPLY) console.log('Dry run — nothing was written. Re-run with --apply (and optionally --update-refs) to convert.');
