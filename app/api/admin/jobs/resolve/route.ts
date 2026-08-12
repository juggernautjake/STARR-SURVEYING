// app/api/admin/jobs/resolve/route.ts
//
// "Does this job exist?" — asked before anything is filed against it.
//
// Two shapes, because the picker asks two different questions:
//   GET ?q=henry      → type-ahead. Always a list, never a verdict.
//   GET ?ref=24-103   → a verdict on one typed reference: resolved, or not_found + near-misses.
//
// Deliberately available to every signed-in member of staff, matching
// `/api/admin/receipts/upload`. Whoever may file a receipt against a job must be able to find out
// whether that job exists — a gate here that is stricter than the gate on the thing it serves is
// the exact defect W6c catches (a page you can open and an answer you cannot get).
//
// It returns only what a picker needs to render a row (number, name, client, address, stage). Not
// `select('*')`: quote amounts and margins have no business travelling to a receipt-capture screen
// on a phone.

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { resolveJobRef, searchJobs } from '@/lib/jobs/job-ref';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const ref = searchParams.get('ref');

  if (q !== null) {
    const jobs = await searchJobs(q, 20);
    return NextResponse.json({ jobs });
  }

  const resolution = await resolveJobRef(ref);
  return NextResponse.json(resolution);
}, { routeName: 'admin/jobs/resolve' });
