// app/api/admin/mileage/distance/route.ts — look up the driving distance between two addresses.
//
// C0b1 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Read-only, and deliberately separate from `POST /api/admin/mileage/manual`, which SAVES a trip.
// Folding the lookup into the save would mean a provider outage blocked capture entirely — and the
// slice's own condition is that "capture must not be blocked on a key".
//
// The provider lives behind `lib/mileage/distance-provider.ts`; this route is auth, validation and
// a status code. It exists on the server rather than being called from the browser because the key
// is a billed server credential, and the one key already in this environment is a browser key that
// ships to every visitor — see the adapter's header.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { lookupDrivingDistance } from '@/lib/mileage/distance-provider';

const MAX_ADDRESS_LEN = 300;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = (searchParams.get('from') ?? '').slice(0, MAX_ADDRESS_LEN);
  const to = (searchParams.get('to') ?? '').slice(0, MAX_ADDRESS_LEN);

  const result = await lookupDrivingDistance(from, to);

  if (result.ok) {
    return NextResponse.json({
      miles: result.miles,
      provider: result.provider,
      resolvedOrigin: result.resolvedOrigin,
      resolvedDestination: result.resolvedDestination,
    });
  }

  // The status code carries the same distinction the adapter's four outcomes do, because a caller
  // that only reads `res.ok` would otherwise treat "nobody set a key" and "that address does not
  // exist" as the same event — and only one of them is worth the surveyor re-reading their input.
  //
  //   501 — the server cannot do this at all yet. Not the caller's fault, not retryable.
  //   422 — the request was understood and the answer is that there is no route.
  //   502 — the upstream provider failed. Retrying is reasonable.
  const status = result.reason === 'NOT_CONFIGURED' ? 501
    : result.reason === 'NO_ROUTE' ? 422
      : 502;
  return NextResponse.json({ error: result.detail, reason: result.reason }, { status });
}, { routeName: 'admin/mileage.distance.get' });
