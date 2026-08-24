// app/api/admin/design/checklist/route.ts — ticking a box, and adding one of your own.
//
//   GET    /api/admin/design/checklist?design=d-…   → { route, dossier, rows, progress }
//   POST   /api/admin/design/checklist { designId, itemId, checked?, note? } → { ok }
//   PUT    /api/admin/design/checklist { route, label, detail?, tier? }      → { item }
//   DELETE /api/admin/design/checklist?item=ck-…                            → { ok }
//
// Phase C of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// State is written against the DESIGN, never the route. Three versions of `/admin/jobs` are at
// three different points, and a tick that leaked between them would make the checklist a worse
// answer than no checklist — it would say a design is finished when nobody has looked at it.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getMockup } from '@/lib/design/server';
import { addCustomItem, checklistFor, removeCustomItem, setChecked } from '@/lib/design/dossier-server';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const designId = req.nextUrl.searchParams.get('design');
  if (!designId) return NextResponse.json({ error: 'Which design?' }, { status: 400 });

  const doc = await getMockup(designId);
  if (!doc) return NextResponse.json({ error: 'That design does not exist.' }, { status: 404 });
  if (!doc.route) {
    // A scratch design answers to no page, so there is nothing to measure it against. Said plainly
    // rather than returning an empty list, which would read as "this page has no requirements".
    return NextResponse.json({
      route: null, dossier: null, rows: [], progress: null,
      note: 'This design is not attached to a page, so there is nothing to check it against. Set '
        + 'its route in the toolbar and the page’s checklist appears here.',
    });
  }

  const result = await checklistFor(doc.route, designId, doc);
  return NextResponse.json({ route: doc.route, ...result });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    designId?: string; itemId?: string; checked?: boolean; note?: string | null;
  } | null;
  if (!body?.designId || !body.itemId) {
    return NextResponse.json({ error: 'Which design, and which item?' }, { status: 400 });
  }

  await setChecked(
    body.designId,
    body.itemId,
    { checked: body.checked, note: body.note },
    email!,
    new Date().toISOString(),
  );
  return NextResponse.json({ ok: true });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    route?: string; label?: string; detail?: string; tier?: 'required' | 'recommended' | 'custom';
  } | null;
  if (!body?.route || !body.label?.trim()) {
    return NextResponse.json({ error: 'A custom item needs a page and some words.' }, { status: 400 });
  }

  try {
    const item = await addCustomItem(body.route, { label: body.label, detail: body.detail, tier: body.tier }, email!);
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not add that.' }, { status: 400 });
  }
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { error } = await gate();
  if (error) return error;

  const id = req.nextUrl.searchParams.get('item');
  if (!id) return NextResponse.json({ error: 'Which item?' }, { status: 400 });
  try {
    await removeCustomItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not remove that.' }, { status: 400 });
  }
});
