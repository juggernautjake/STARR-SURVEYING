// app/api/admin/install/qr/route.ts
//
// GET /api/admin/install/qr?data=<text>&size=<px>
//
// Renders a short string (typically the TestFlight invite link or the
// hosted-APK URL) into a PNG QR code so a desktop visitor to
// /admin/install can scan it with their phone and open the install
// link directly — the phone is where the app actually installs.
//
// The string is encoded verbatim; the route NEVER fetches it, so there
// is no SSRF surface. It is still gated behind a signed-in session
// because the whole install surface is employee-only.

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MAX_DATA_LEN = 1024;
const DEFAULT_SIZE = 320;
const MIN_SIZE = 96;
const MAX_SIZE = 1024;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data');
  if (!data) {
    return NextResponse.json({ error: 'Missing ?data' }, { status: 400 });
  }
  if (data.length > MAX_DATA_LEN) {
    return NextResponse.json({ error: 'data too long' }, { status: 413 });
  }

  const sizeParam = Number(searchParams.get('size'));
  const size = Number.isFinite(sizeParam) && sizeParam > 0
    ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(sizeParam)))
    : DEFAULT_SIZE;

  const png = await QRCode.toBuffer(data, {
    type: 'png',
    margin: 1,
    errorCorrectionLevel: 'M',
    width: size,
  });

  const bytes = new Uint8Array(png);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Per-user, short-lived: the link rarely changes but we don't
      // want a shared CDN cache holding it.
      'Cache-Control': 'private, max-age=300',
    },
  });
});
