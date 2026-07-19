// app/api/dnd/characters/[id]/export/route.ts — download a character sheet as JSON or a self-contained HTML
// document (owner 2026-07-18: "export character sheets with literally everything on them — PDF, JSON, HTML").
// The "PDF" is this HTML routed through the browser's Print → Save as PDF (print CSS is in the document), so no
// server render + no new deps. Read-gated via getCharacterAccess (same as opening the sheet). For the HTML the
// art/token images are inlined as data URIs so the file is truly self-contained (offline-openable).
import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { characterToJson, characterToHtml, exportFileBase, type CharacterExport } from '@/lib/dnd/export/character-export';

export const runtime = 'nodejs';

/** Fetch an image URL and return a `data:` URI, or null on any failure (the export then just omits/urls it). */
async function inlineImage(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return url ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) return url; // fall back to the remote url — the browser will fetch it when printing
    const type = res.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4_000_000) return url; // too big to inline sanely — keep the url
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return url;
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error ?? 'No access.' }, { status: res.status });
  const ch = res.access.character as unknown as Record<string, unknown>;

  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'html';
  const name = String(ch.name ?? 'Character');
  const base = exportFileBase(name);

  const exportData: CharacterExport = {
    name,
    system: (ch.system as string | null) ?? null,
    sheet_type: (ch.sheet_type as string | null) ?? null,
    bio: (ch.bio as Record<string, unknown> | null) ?? null,
    data: ch.data,
    updatedAt: (ch.updated_at as string | null) ?? null,
  };

  if (format === 'json') {
    return new NextResponse(characterToJson(exportData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // HTML: inline the art + token so the document is self-contained.
  exportData.artSrc = await inlineImage(ch.art_url as string | null);
  exportData.tokenSrc = await inlineImage(ch.token_url as string | null);
  return new NextResponse(characterToHtml(exportData), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}.html"`,
      'Cache-Control': 'no-store',
    },
  });
}
