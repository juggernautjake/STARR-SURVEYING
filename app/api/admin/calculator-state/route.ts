// app/api/admin/calculator-state/route.ts
//
// Per-user-per-calculator save state for the exam-calculator modal.
// C-5 of EXAM_CALCULATORS.md.
//
// GET ?model=<key>            — load the saved state for the signed-in user.
//                                Returns `{ state: null }` if no row exists.
// PUT { model, state }        — upsert the row (composite PK on user+model).
//                                Caller is the modal's debounced save loop.
// DELETE ?model=<key>         — clear saved state for one model. Used by the
//                                "clear state" button in the modal header.
//
// Any authenticated user can read/write their own state. The DB schema
// (seed 288) keys on (user_email, model_key) so users can't reach each
// other's rows via this endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface PutBody {
  model: string;
  state: unknown;
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  if (!model) return NextResponse.json({ error: 'model query param required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('user_calculator_state')
    .select('state, updated_at')
    .eq('user_email', gate.email)
    .eq('model_key', model)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ state: data?.state ?? null, updated_at: data?.updated_at ?? null });
}, { routeName: 'calculator-state/GET' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const body = await req.json() as PutBody;
  if (!body.model || typeof body.model !== 'string') {
    return NextResponse.json({ error: 'model is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_calculator_state')
    .upsert(
      { user_email: gate.email, model_key: body.model, state: body.state ?? {} },
      { onConflict: 'user_email,model_key' },
    )
    .select('updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated_at: data?.updated_at ?? null });
}, { routeName: 'calculator-state/PUT' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  if (!model) return NextResponse.json({ error: 'model query param required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('user_calculator_state')
    .delete()
    .eq('user_email', gate.email)
    .eq('model_key', model);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: model });
}, { routeName: 'calculator-state/DELETE' });
