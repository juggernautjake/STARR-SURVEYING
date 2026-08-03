// app/api/admin/research/[projectId]/rotation/route.ts — rotate a record survey onto field work.
//
// The one Phase I operation a PERSON has to start, because it needs measurements only they can
// supply. `bearing-rotation.ts` has done the arithmetic since S4 and had no route, no page and no
// service — the feature the owner asked for by name could not be reached.
//
// Stateless on purpose: the record calls come in the request rather than being read from the
// project. The client already holds them (the boundary viewer walks them to draw), and taking them
// from the body means the response is unambiguous about WHICH description was rotated — a route that
// silently picks "the project's boundary" would rotate a different one after a re-run.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { rotateRecord, type RecordCall, type RotationBasis } from '@/lib/research/rotation.service';

export const runtime = 'nodejs';

interface RotationBody {
  calls: RecordCall[];
  basis: RotationBasis;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Partial<RotationBody>;

  if (!Array.isArray(body.calls)) {
    return NextResponse.json(
      { error: 'calls[] is required — the record description to rotate.' },
      { status: 400 },
    );
  }
  if (!body.basis || (body.basis.kind !== 'ties' && body.basis.kind !== 'backsight')) {
    return NextResponse.json(
      { error: 'basis is required and must be { kind: "ties", ties: [...] } or { kind: "backsight", recordBearing, measuredBearing }.' },
      { status: 400 },
    );
  }
  if (body.basis.kind === 'ties' && !Array.isArray(body.basis.ties)) {
    return NextResponse.json({ error: 'basis.ties[] is required for a ties fit.' }, { status: 400 });
  }

  const result = rotateRecord(body.calls, body.basis);

  // A rotation the arithmetic declined to compute is a 200 with `ok:false`, not an error: the caller
  // asked a well-formed question and the answer is "not from this input, and here is why". Returning
  // 4xx would put the reason in an error toast, which is where reasons go to be dismissed.
  return NextResponse.json(result);
});
