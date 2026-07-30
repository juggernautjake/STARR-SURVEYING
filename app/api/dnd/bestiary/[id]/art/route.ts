// app/api/dnd/bestiary/[id]/art/route.ts — put a picture on a catalogue creature (B6-6).
//
// Owner: *"Any artwork or images you can save or find for the different creatures and monsters, please save
// it and make it available to view for that creature/monster… we should be able to create variants and
// upload artwork for them."*
//
// ── WHY THIS EXISTS AT ALL, GIVEN B2-3 BUILT A FETCHER ───────────────────────────────────────────────
//
// Because the fetcher cannot finish the job, and B6-5 established the boundary precisely. Querying
// Wikimedia Commons by SPECIES is reliable — 372 real animals accepted, six sampled and all six correct.
// Querying it for a fantasy creature is not, and no amount of tuning fixes it: "Lich" returns a pulsar,
// "Category:Centaurs" returns an AMC Pacer, "Category:Griffins" returns a pride flag. The metadata is
// correct in every case; RELEVANCE is the failure, and nothing in the API exposes it.
//
// So the remaining ~4,500 creatures need a human to choose, and this is the door for that. It is not a
// fallback for the automated path — it is the only path that was ever going to work for the fantasy half.
//
// ── THE LICENCE RULE IS NOT RELAXED FOR UPLOADS ──────────────────────────────────────────────────────
//
// Seed 467 puts a CHECK constraint on `dnd_creatures` so `image_url` cannot be stored without a licence
// and a credit. That constraint does not know or care that a human is on the other end, and it should not:
// `/dnd` is publicly reachable by direct link, so an uploaded image is PUBLISHED, and an uploaded image
// with no stated licence is exactly the thing the constraint exists to prevent.
//
// So the uploader states them, and **"I drew this myself" is a valid answer that gets recorded** rather
// than assumed. What is refused is silence. The route does not run `isAcceptableLicence` over the answer —
// that allowlist exists to judge a SEARCH RESULT nobody vouched for, and a person uploading their own work
// or a file they have checked is a different situation with a different failure mode. Recording who said
// what is the protection here, not second-guessing them.
//
// ── WHY THE CATALOGUE ROW, WHEN G1 SAYS THE CATALOGUE IS IMMUTABLE ───────────────────────────────────
//
// G1 is about RULES — a creature's numbers and text, which fork so that two DMs can disagree. A portrait is
// not a rule, and forking one would mean 5,000 creatures stay blank while one person's copy has a picture.
//
// Two facts make writing here safe. First, no importer touches `image_url`: `import-open5e`,
// `import-bestiary`, `import-bestiary-pf2` and the transposition generator all omit it from their upsert
// column lists, so an uploaded portrait survives every re-import. Second, this is OWNER-GATED. A picture on
// a catalogue row is what every reader sees, so it is not a per-user preference and must not be writable by
// any signed-in visitor. Forked creatures are a different story and get their own art through the Studio.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, isDndOwner } from '@/lib/dnd/auth';
import { checkStorageQuota, recordStorage, releaseStorage } from '@/lib/dnd/storage-ledger';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { UPLOAD_LIMITS, tooLargeMessage } from '@/lib/dnd/upload-limits';
import { storageKeyFromUrl } from '@/lib/dnd/media-storage';

export const dynamic = 'force-dynamic';

const BUCKET = 'dnd-media';
const MAX_BYTES = UPLOAD_LIMITS.MEDIA;
const ALLOWED: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

/** POST — multipart: `file`, `licence`, `attribution`, `sourceUrl?`. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!isDndOwner(session)) {
    return NextResponse.json(
      { error: 'Only the catalogue owner can set a creature\'s picture. Make your own version of it to give it your own art.' },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  try {
    const form = await req.formData();
    const file = form.get('file');
    const licence = String(form.get('licence') ?? '').trim();
    const attribution = String(form.get('attribution') ?? '').trim();
    const sourceUrl = String(form.get('sourceUrl') ?? '').trim() || null;

    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: tooLargeMessage(MAX_BYTES, 'Image') }, { status: 400 });

    // Checked HERE as well as by the CHECK constraint, so the caller gets a sentence they can act on
    // instead of a Postgres violation — and so the bytes are never uploaded for a row that cannot store
    // them, which would leave an orphan in the bucket every time someone forgot the credit.
    if (!licence) {
      return NextResponse.json(
        { error: 'A licence is required. If you made the image yourself, say so — "Own work" is a licence statement.' },
        { status: 400 },
      );
    }
    if (!attribution) {
      return NextResponse.json({ error: 'A credit line is required — who made it, and where it came from.' }, { status: 400 });
    }

    const { data: creature, error: readErr } = await supabaseAdmin
      .from('dnd_creatures').select('id, slug, image_url, image_storage_path').eq('id', params.id).maybeSingle();
    if (readErr) return NextResponse.json({ error: `Could not read that creature: ${readErr.message}` }, { status: 500 });
    if (!creature) return NextResponse.json({ error: 'No such creature.' }, { status: 404 });
    const c = creature as { id: string; slug: string; image_url: string | null; image_storage_path: string | null };

    const overQuota = await checkStorageQuota(session.userId, file.size);
    if (overQuota) return NextResponse.json({ error: overQuota }, { status: 413 });

    await ensureStorageBucket(BUCKET, { public: true });
    // A fresh UUID per upload rather than a slug-derived key, so replacing a picture cannot serve the old
    // bytes from a CDN cache under the same URL — the symptom of which is "I uploaded it and nothing
    // changed", diagnosed as a broken upload when the upload worked perfectly.
    const key = `bestiary/upload/${c.slug.replace(/[^a-z0-9]+/gi, '-')}-${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    await recordStorage({ userId: session.userId, bucket: BUCKET, objectPath: key, bytes: file.size });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { error: updErr } = await supabaseAdmin
      .from('dnd_creatures')
      .update({
        image_url: url,
        image_licence: licence,
        // Who uploaded it is part of the credit, not metadata beside it: when a picture turns out to be
        // wrong or wrongly licensed, the useful question is who vouched for it.
        image_attribution: `${attribution} — uploaded by ${session.displayName}`,
        image_source_url: sourceUrl,
        image_storage_path: key,
      })
      .eq('id', c.id);

    if (updErr) {
      // The row rejected it, so the bytes must not stay: an object nobody references is an orphan that
      // still counts against the quota and is still reachable by URL.
      await supabaseAdmin.storage.from(BUCKET).remove([key]).catch(() => {});
      await releaseStorage([key]);
      return NextResponse.json({ error: `Could not attach the image: ${updErr.message}` }, { status: 500 });
    }

    // The PREVIOUS file is dropped only after the new one is safely referenced, so a failure above leaves
    // the creature with the picture it already had rather than none.
    const oldKey = c.image_storage_path || storageKeyFromUrl(c.image_url);
    if (oldKey && oldKey !== key) {
      await supabaseAdmin.storage.from(BUCKET).remove([oldKey]).catch(() => {});
      await releaseStorage([oldKey]);
    }

    return NextResponse.json({ imageUrl: url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}

/** DELETE — take the picture off, falling back to the generated sigil. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!isDndOwner(session)) return NextResponse.json({ error: 'Only the catalogue owner can do that.' }, { status: 403 });

  const { data: creature } = await supabaseAdmin
    .from('dnd_creatures').select('id, image_url, image_storage_path').eq('id', params.id).maybeSingle();
  const c = creature as { id: string; image_url: string | null; image_storage_path: string | null } | null;
  if (!c) return NextResponse.json({ error: 'No such creature.' }, { status: 404 });

  // All four columns clear together. Leaving a licence behind on a row with no image would be harmless
  // today and confusing the moment someone reads it as a claim about the sigil.
  const { error } = await supabaseAdmin
    .from('dnd_creatures')
    .update({ image_url: null, image_licence: null, image_attribution: null, image_source_url: null, image_storage_path: null })
    .eq('id', c.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const key = c.image_storage_path || storageKeyFromUrl(c.image_url);
  if (key) {
    await supabaseAdmin.storage.from(BUCKET).remove([key]).catch(() => {});
    await releaseStorage([key]);
  }
  // Not an error state: `sigilFor` draws a deterministic emblem and `auraFor` gives it an atmosphere, so a
  // creature with no photograph looks deliberate rather than broken.
  return NextResponse.json({ ok: true });
}
