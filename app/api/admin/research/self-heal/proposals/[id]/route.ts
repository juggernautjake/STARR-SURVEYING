// app/api/admin/research/self-heal/proposals/[id]/route.ts
//
// Slice 3 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// PATCH body: { action: 'approve' | 'reject', notes?: string }
//   - approve: marks the proposal status='approved' + applied_at=now.
//     Slice 3 doesn't actually mutate adapter config (no AI fix
//     content yet) — approve is "ack the breakage, will fix manually."
//     The adapter's status stays whatever the probe set it to.
//   - reject: marks the proposal status='rejected'. Closes the queue
//     row without any adapter change.
//
// Slice 4 will rewire this so an approved proposal with confidence > 0
// + canary_test_passed AND autoapply_enabled actually swaps the
// adapter config (via apply-policy.applyProposalToAdapter).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

async function authGate(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

function proposalIdFromUrl(req: NextRequest): string | null {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const g = await authGate();
  if (!g.ok) return g.res;

  const id = proposalIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'proposal id required' }, { status: 400 });

  let body: { action?: string; notes?: string };
  try {
    body = (await req.json()) as { action?: string; notes?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    reviewed_by: g.email,
    reviewed_at: nowIso,
    review_notes: typeof body.notes === 'string' && body.notes.trim().length > 0
      ? body.notes.trim()
      : null,
    status: body.action === 'approve' ? 'approved' : 'rejected',
    updated_at: nowIso,
  };
  if (body.action === 'approve') {
    // Slice 3 approve is an acknowledgement, not a config swap. Mark
    // applied_at so the audit trail captures "the human looked at
    // this and confirmed it"; slice 4 will gate real config writes
    // on confidence + canary + autoapply_enabled.
    patch.applied_at = nowIso;
  }

  const { data, error } = await supabaseAdmin
    .from('research_adapter_change_proposals')
    .update(patch)
    .eq('id', id)
    .eq('status', 'proposed') // guard: only transition proposed rows
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Proposal not found or already reviewed.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ proposal: data });
}, { routeName: 'admin/research/self-heal/proposals/[id].patch' });
