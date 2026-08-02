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
    });
  }

  const pdf = renderPacketPdf(assembled, {
    version: row.version,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    propertyAddress: project?.property_address ?? null,
    county: project?.county ?? null,
  });

  const safeTitle = String(row.title).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 60) || 'packet';
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeTitle} v${row.version}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}, { routeName: 'research/packet-pdf' });
