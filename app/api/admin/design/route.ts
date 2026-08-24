// app/api/admin/design/route.ts — the list of mockups, and saving one.
//
//   GET  /api/admin/design            → { designs: DesignSummary[] }
//   POST /api/admin/design  { doc }   → { doc }   (create or save; the server decides the version)
//
// Gated to admin + developer, matching the route registry entry for `/admin/design`. This is a build
// tool that exposes the whole app's structure, and a half-finished mockup on a foreman's screen
// would read as a promise about what the app is going to do.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { listMockups, saveMockup } from '@/lib/design/server';
import type { DesignDocument } from '@/lib/design/document';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const { error, email } = await gate();
  if (error) return error;
  void email;
  return NextResponse.json({ designs: await listMockups() });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as { doc?: DesignDocument; summary?: string } | null;
  const doc = body?.doc;
  // The id and the two views are the whole contract. Rejecting a malformed document here beats
  // writing a row that every later read has to defend itself against.
  if (!doc?.id || !doc.views?.desktop || !doc.views?.mobile) {
    return NextResponse.json({ error: 'A design needs an id and both views.' }, { status: 400 });
  }

  try {
    const saved = await saveMockup(doc, email!, new Date().toISOString(), body?.summary);
    return NextResponse.json({ doc: saved });
  } catch (err) {
    // A refused edit is not a server fault. `saveMockup` throws LOCKED when the target is a
    // default — a trace of the served page, which stays as the page is — and answering that with a
    // 500 would send whoever hit it looking for a broken database instead of reading the sentence.
    const message = err instanceof Error ? err.message : 'Could not save that design.';
    if (message.startsWith('LOCKED:')) {
      return NextResponse.json({ error: message.replace(/^LOCKED:\s*/, ''), locked: true }, { status: 409 });
    }
    throw err;
  }
});
