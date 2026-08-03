// lib/research/packet-images.ts — fetching the page images a packet PDF embeds (plan R25).
//
// Split from the renderer on purpose: `renderPacketPdf` stays synchronous and pure, so it can be
// tested without a network, and every reason an image is missing arrives as data rather than as an
// exception thrown mid-render.
//
// ── WHY THIS IS BOUNDED ─────────────────────────────────────────────────────────────────────────
//
// A packet can reference dozens of documents, each several pages. Embedding all of them turns a
// 200 KB text packet into something a phone cannot open on a rural connection — which defeats the
// reason the packet is text-first in the first place. So: one page per document, a ceiling on the
// number of documents imaged, and a total byte budget.
//
// Every one of those limits is REPORTED rather than silently applied. A packet quietly showing the
// first eight of twenty plats, with nothing saying so, is the same defect as an empty search result
// presented as an answer: the reader cannot tell a complete answer from a truncated one.

import type { PacketImage, PacketImageStatus } from './packet-pdf';

/** One page per document. The packet's job is to show WHICH document, not to reproduce it. */
export const MAX_DOCUMENTS_IMAGED = 12;
/** ~8 MB of images. Beyond this a packet stops being openable in a truck. */
export const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;

export interface DocumentImageSource {
  refId: string;
  /** Direct URL to the first page image, when the record has one. */
  storageUrl?: string | null;
  pageCount?: number | null;
  /** Set when the pipeline already judged the document unreadable (plan R18). */
  readability?: string | null;
}

export interface FetchImagesResult {
  images: Record<string, PacketImage>;
  /** One line for the packet's warnings, or null when nothing was truncated or failed. */
  warning: string | null;
}

function statusFromReadability(readability: string | null | undefined): PacketImageStatus | null {
  // The pipeline already decided this document could not be read. Embedding its page anyway would
  // put an illegible image in a packet beside a provenance line saying it is illegible.
  if (readability && /unreadable|illegible|failed/i.test(readability)) return 'unreadable';
  return null;
}

/** Fetch one page image per document, within the limits above.
 *
 *  Never throws. Each document ends with a stated `PacketImage`, including the ones that failed —
 *  the render must not lose the plan and the open questions because a storage URL timed out. */
export async function fetchPacketImages(
  sources: DocumentImageSource[],
  opts: { maxDocuments?: number; maxTotalBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchImagesResult> {
  const maxDocs = opts.maxDocuments ?? MAX_DOCUMENTS_IMAGED;
  const maxBytes = opts.maxTotalBytes ?? MAX_TOTAL_IMAGE_BYTES;
  const doFetch = opts.fetchImpl ?? fetch;

  const images: Record<string, PacketImage> = {};
  let bytes = 0;
  let imaged = 0;
  let failed = 0;
  let overCount = 0;
  let overBytes = 0;

  for (const src of sources) {
    const unreadable = statusFromReadability(src.readability);
    if (unreadable) {
      images[src.refId] = { status: unreadable, pageCount: src.pageCount ?? null ? src.pageCount! : undefined };
      continue;
    }

    if (!src.storageUrl) {
      images[src.refId] = {
        status: 'not_attached',
        pageCount: src.pageCount ?? undefined,
      };
      continue;
    }

    if (imaged >= maxDocs) {
      overCount++;
      images[src.refId] = {
        status: 'not_requested',
        detail: `Not imaged in this print — the packet is limited to ${maxDocs} embedded document images so it stays openable in the field. The document is in the research record.`,
        pageCount: src.pageCount ?? undefined,
      };
      continue;
    }

    try {
      const res = await doFetch(src.storageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        failed++;
        images[src.refId] = { status: 'fetch_failed', detail: `The image store answered ${res.status}.`, pageCount: src.pageCount ?? undefined };
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());

      if (bytes + buf.length > maxBytes) {
        overBytes++;
        images[src.refId] = {
          status: 'not_requested',
          detail: 'Not imaged in this print — the packet reached its image size budget. The document is in the research record.',
          pageCount: src.pageCount ?? undefined,
        };
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const mime = /jpe?g/i.test(contentType) ? 'image/jpeg' : 'image/png';
      bytes += buf.length;
      imaged++;
      images[src.refId] = {
        status: 'embedded',
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        pageNumber: 1,
        pageCount: src.pageCount ?? undefined,
      };
    } catch (err) {
      failed++;
      images[src.refId] = {
        status: 'fetch_failed',
        detail: err instanceof Error && err.name === 'TimeoutError'
          ? `The image did not load within ${FETCH_TIMEOUT_MS / 1000}s.`
          : undefined,
        pageCount: src.pageCount ?? undefined,
      };
    }
  }

  const notes: string[] = [];
  if (failed > 0) {
    notes.push(`${failed} document image(s) could not be loaded when this packet was printed — they may exist, but this print does not contain them.`);
  }
  if (overCount > 0) {
    notes.push(`${overCount} document(s) were not imaged: this print embeds at most ${maxDocs}. Each says so on its own entry.`);
  }
  if (overBytes > 0) {
    notes.push(`${overBytes} document(s) were not imaged because the packet reached its image size budget.`);
  }

  return { images, warning: notes.length > 0 ? notes.join(' ') : null };
}
