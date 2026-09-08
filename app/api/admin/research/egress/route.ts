// app/api/admin/research/egress/route.ts — the app fetches ONE allow-listed URL for the worker.
//
// See lib/research/egress-allowlist.ts for why: Bell County's free plat portal refuses the worker's
// datacentre address and answers a US address. The worker calls this with its key (`x-worker-key`),
// the app fetches the URL as a browser would, and hands back the status, the final URL (the site
// redirects PDFs to its CMS host) and the bytes, base64. No cookies, no state, one request.
//
// Not an open proxy: the allowlist is checked before any request, the body is capped, and the
// caller must be the worker.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { egressAllowed, EGRESS_MAX_BYTES } from '@/lib/research/egress-allowlist';

// A plat PDF from a slow county CMS can take a while; the worker waits up to 60 s.
export const maxDuration = 60;

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const key = req.headers.get('x-worker-key');
  if (!key || !process.env.WORKER_API_KEY || key !== process.env.WORKER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get('url') ?? '';
  if (!egressAllowed(target)) {
    return NextResponse.json({ error: 'That host is not on the relay allowlist.' }, { status: 400 });
  }

  const userAgent = req.headers.get('x-forward-user-agent') || DEFAULT_UA;
  const upstream = await fetch(target, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/pdf,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });

  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.length > EGRESS_MAX_BYTES) {
    return NextResponse.json(
      { error: `The response is ${bytes.length} bytes; the relay passes back at most ${EGRESS_MAX_BYTES}.`, status: upstream.status, finalUrl: upstream.url },
      { status: 413 },
    );
  }

  return NextResponse.json(
    {
      status: upstream.status,
      contentType: upstream.headers.get('content-type'),
      finalUrl: upstream.url,
      bytes: bytes.length,
      bodyBase64: bytes.toString('base64'),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/egress' });
