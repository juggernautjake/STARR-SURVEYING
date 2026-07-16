// app/api/dnd/library/search/route.ts — search the rules library.
//
// GET ?q=<query>[&system=<key>]  → { hits: LibraryHit[] }
//
// Backed by the deterministic catalog (lib/dnd/library.ts), NOT the vector store: it must work
// with no embeddings key and no seeded rows, and it must never be able to return one system's
// rules under another system's name. When `system` is given, results are scoped to it; otherwise
// every hit is labelled with the system it came from.
import { NextRequest, NextResponse } from 'next/server';
import { searchLibrary } from '@/lib/dnd/library';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const systemParam = (url.searchParams.get('system') || '').trim();
  if (!q) return NextResponse.json({ hits: [] });

  // An unknown system key would silently widen the search to everything — reject it instead.
  if (systemParam && !GAME_SYSTEMS.some((s) => s.key === systemParam)) {
    return NextResponse.json({ error: `Unknown system: ${systemParam}` }, { status: 400 });
  }

  const hits = searchLibrary(q, systemParam || null);
  return NextResponse.json({ query: q, system: systemParam || null, hits });
}
