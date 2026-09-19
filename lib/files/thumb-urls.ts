// lib/files/thumb-urls.ts — turning stored previews into URLs a browser can show, in bulk.
//
// Owner, 2026-09-19: "we have a way to choose different tiles sizes for each file preview so that
// we can see a thumbnail of each document/pdf/photo/video easily."
//
// A folder listing can turn up two hundred previews. Signing them one at a time is two hundred
// round trips to storage before the page can paint, which is exactly the shape of problem that made
// the map's file panel freeze the site earlier the same day. So every preview in a whole tree is
// collected first, signed in ONE call per bucket, and the raw object reference is then deleted from
// what goes out.
//
// The signing itself is `createSignedUrls` — the plural. That matters: the singular in a loop is
// the same number of HTTP requests as doing it by hand.

import { supabaseAdmin } from '@/lib/supabase';
import type { MountNode, MountTree } from './mount-node';

/** Two hours.
 *
 *  Long enough that a person can leave a folder of plans open over a lunch break and still see the
 *  pictures when they come back, and short enough that a URL copied out of the network panel is not
 *  a permanent key to the file. It matches the inline viewing TTL next door in the download route,
 *  deliberately: two different expiries on the same page produce a page that half works after an
 *  hour, which is harder to understand than one that fails all at once. */
export const THUMB_URL_SECONDS = 2 * 60 * 60;

/** Sign every preview in these nodes, in one call per bucket, and put the URLs on them.
 *
 *  Mutates in place and returns nothing, because the nodes are already the response being built and
 *  copying a tree to add one field per node is a second tree for no reason.
 *
 *  Failure is not an error. A preview that cannot be signed — a deleted object, a bucket renamed, a
 *  storage hiccup — leaves the node with no `thumb_url`, and the Explorer falls back to the file's
 *  icon exactly as it does for a file that never had one. A folder of documents is still a usable
 *  folder of documents without its pictures; refusing to list it would not be.
 */
export async function signThumbs(nodes: MountNode[]): Promise<void> {
  const byBucket = new Map<string, Set<string>>();
  for (const n of nodes) {
    const ref = n.thumb_ref;
    if (!ref?.bucket || !ref.path) continue;
    const paths = byBucket.get(ref.bucket) ?? new Set<string>();
    paths.add(ref.path);
    byBucket.set(ref.bucket, paths);
  }
  if (byBucket.size === 0) return;

  const signed = new Map<string, string>();
  await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
    const list = [...paths];
    try {
      const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(list, THUMB_URL_SECONDS);
      for (const row of data ?? []) {
        // `createSignedUrls` answers positionally AND echoes the path, but it reports a per-item
        // error rather than throwing when one object is missing — so each row is checked on its own
        // instead of trusting that a successful call means every URL came back.
        if (row?.signedUrl && row.path) signed.set(`${bucket}:${row.path}`, row.signedUrl);
      }
    } catch {
      // One bad bucket must not cost the other buckets their previews.
    }
  }));

  for (const n of nodes) {
    const ref = n.thumb_ref;
    if (ref?.bucket && ref.path) n.thumb_url = signed.get(`${ref.bucket}:${ref.path}`) ?? null;
    // The client is told the state either way; the raw object is nobody's business.
    delete n.thumb_ref;
  }
}

/** The same, for a whole tree — every file in every folder, still one call per bucket. */
export async function signTreeThumbs(tree: MountTree): Promise<void> {
  await signThumbs(tree.folders.flatMap((f) => f.files));
}
