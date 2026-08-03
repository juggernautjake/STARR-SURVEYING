// app/api/admin/research/[projectId]/packets/[packetId]/pdf/route.ts — the packet as one file (R25).
//
// An APPROVED packet renders from its snapshot (`rendered_json`), not from the live tables: what was
// approved must stay what was approved even after somebody corrects a fact. A draft renders live,
// and says DRAFT on every page so the two can never be confused in a truck.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { assemblePacket, type AssembledPacket, type PacketItemRef } from '@/lib/research/packet';
import { renderPacketPdf } from '@/lib/research/packet-pdf';
import { fetchPacketImages, type DocumentImageSource } from '@/lib/research/packet-images';
import type { Discrepancy, ExtractedDataPoint, ResearchDocument } from '@/types/research';

function extractIds(req: NextRequest): { projectId: string | null; packetId: string | null } {
  const after = req.nextUrl.pathname.split('/research/')[1];
  if (!after) return { projectId: null, packetId: null };
  const parts = after.split('/');
  // [projectId, "packets", packetId, "pdf"]
  return { projectId: parts[0] || null, packetId: parts[2] || null };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, packetId } = extractIds(req);
  if (!projectId || !packetId) return NextResponse.json({ error: 'Project and packet required' }, { status: 400 });

  const [{ data: row }, { data: project }] = await Promise.all([
    supabaseAdmin.from('research_packets').select('*')
      .eq('id', packetId).eq('research_project_id', projectId).single(),
    supabaseAdmin.from('research_projects').select('property_address, county')
      .eq('id', projectId).single(),
  ]);

  if (!row) return NextResponse.json({ error: 'Packet not found' }, { status: 404 });

  let assembled: AssembledPacket;
  if (row.status === 'approved' && row.rendered_json) {
    assembled = row.rendered_json as AssembledPacket;
  } else {
    const [factRes, docRes, conflictRes] = await Promise.all([
      supabaseAdmin.from('extracted_data_points').select('*').eq('research_project_id', projectId),
      supabaseAdmin.from('research_documents').select('*').eq('research_project_id', projectId),
      supabaseAdmin.from('discrepancies').select('*').eq('research_project_id', projectId),
    ]);
    const documents = (docRes.data ?? []) as ResearchDocument[];
    const documentLabels: Record<string, string> = {};
    for (const d of documents) {
      documentLabels[d.id] = d.document_label || d.original_filename || 'an unnamed document';
    }
    assembled = assemblePacket(row.title, row.cover_notes, (row.contents ?? []) as PacketItemRef[], {
      facts: (factRes.data ?? []) as ExtractedDataPoint[],
      documents,
      conflicts: (conflictRes.data ?? []) as Discrepancy[],
      documentLabels,
      // Same list the packets route builds. This path assembles a packet LIVE (the approved path
      // renders from the snapshot instead), so omitting it here would print "not recorded" on a
      // draft PDF while the same packet showed the real list elsewhere.
      retrievalFailures: documents
        .filter((d) => d.processing_status === 'unreadable' || d.processing_status === 'error')
        .map((d) => `${documentLabels[d.id]} (${d.processing_status === 'unreadable' ? 'could not be read' : 'processing failed'})`),
    });
  }

  // ── Page images (plan R25) ────────────────────────────────────────────────
  //
  // Fetched from the document records regardless of whether the packet was assembled live or from an
  // approved snapshot. The snapshot fixes what the packet SAYS — which is what approval is a
  // signature on — while the page images are the documents' own stored artifacts, immutable in
  // storage and addressed by id. Freezing base64 into `rendered_json` would have made every approved
  // packet row megabytes wide for no gain in fidelity.
  //
  // `?images=0` prints text-only, which is the phone-in-a-truck case and is stated on each entry as
  // a choice rather than as a missing image.
  const wantImages = req.nextUrl.searchParams.get('images') !== '0';

  let images: Record<string, import('@/lib/research/packet-pdf').PacketImage> | undefined;
  let imageWarning: string | null = null;

  if (wantImages) {
    const referenced = new Set(
      assembled.sections
        .filter((s) => s.kind === 'document' || s.kind === 'drawing' || s.kind === 'imagery')
        .flatMap((s) => s.entries.map((e) => e.refId)),
    );

    if (referenced.size > 0) {
      const { data: docRows } = await supabaseAdmin
        .from('research_documents')
        .select('id, storage_url, page_count, readability')
        .eq('research_project_id', projectId)
        .in('id', [...referenced]);

      type DocImageRow = { id: string; storage_url: string | null; page_count: number | null; readability: string | null };
      const rows = (docRows ?? []) as DocImageRow[];

      const sources: DocumentImageSource[] = [...referenced].map((refId) => {
        const d = rows.find((r) => r.id === refId);
        return {
          refId,
          storageUrl: d?.storage_url ?? null,
          pageCount: d?.page_count ?? null,
          readability: d?.readability ?? null,
        };
      });

      const fetched = await fetchPacketImages(sources);
      images = fetched.images;
      imageWarning = fetched.warning;
    }
  }

  // A truncated or partly-failed image set is a COVER warning, not a footnote. The cover is where
  // this packet already puts the things that change what a crew does, and "you are not looking at
  // all the documents" is one of them.
  const withImageWarning: AssembledPacket = imageWarning
    ? { ...assembled, warnings: [...assembled.warnings, imageWarning] }
    : assembled;

  const pdf = renderPacketPdf(withImageWarning, {
    version: row.version,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    propertyAddress: project?.property_address ?? null,
    county: project?.county ?? null,
  }, images);

  const safeTitle = String(row.title).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60) || 'packet';
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeTitle} v${row.version}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}, { routeName: 'research/packet-pdf' });
