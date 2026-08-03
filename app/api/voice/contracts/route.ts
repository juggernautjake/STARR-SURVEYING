// app/api/voice/contracts/route.ts — list and draft contracts.
//
// The body is generated from a template at creation and then STORED AS TEXT. It is not re-rendered
// from the template on read, and that distinction is the whole design:
//
// A contract is the words both parties agreed to on a particular day. If the body were regenerated
// from a template, then improving the template — adding a clause, fixing a typo — would silently
// change what a signed agreement says. The signature hash would catch it, but only after the fact.
// Generating once and storing means a template improvement affects the NEXT contract and nothing
// that already exists, which is how contracts are supposed to behave.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { generatePrefixedToken } from '@/lib/voice/tokens';
import { buildContract } from '@/lib/voice/contracts';
import { nextDocumentNumber } from '@/lib/voice/money';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

export async function GET(): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('va_contracts')
    .select('*, client:va_clients(id, name, email, company)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contracts: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  if (!body.clientId) return NextResponse.json({ error: 'Choose a client first.' }, { status: 400 });

  const { data: client } = await supabaseAdmin
    .from('va_clients')
    .select('id, name, company')
    .eq('id', String(body.clientId))
    .maybeSingle();

  if (!client) return NextResponse.json({ error: 'No such client.' }, { status: 404 });

  const { data: settings } = await supabaseAdmin
    .from('va_settings')
    .select('artist_name, business_name, contract_terms')
    .eq('id', 1)
    .maybeSingle();

  const templateId = body.templateId === 'coaching' ? 'coaching' : 'voiceover';
  const projectTitle = String(body.projectTitle ?? '').trim() || 'Voice-over work';
  const feeCents = Math.max(0, Math.round(Number(body.feeCents) || 0));

  const bodyMarkdown = buildContract(templateId, {
    artistName: settings?.artist_name || 'Andrew Ash',
    businessName: settings?.business_name || 'Andrew Ash Voice',
    clientName: client.name,
    clientCompany: client.company,
    projectTitle,
    feeCents,
    usageScopeId: String(body.usageScopeId ?? 'web'),
    usageTermMonths: Number(body.usageTermMonths) || null,
    deliveryDate: body.deliveryDate ? String(body.deliveryDate) : null,
    revisionsIncluded: Math.max(0, Math.round(Number(body.revisionsIncluded ?? 1))),
    depositPct: Math.max(0, Math.min(100, Math.round(Number(body.depositPct ?? 50)))),
    // Settings-level boilerplate is appended at generation time so it, too, is frozen into this
    // contract rather than following later edits.
    extraTerms: [settings?.contract_terms, body.extraTerms].filter(Boolean).join('\n\n') || null,
    sessionCount: Number(body.sessionCount) || 1,
    sessionMinutes: Number(body.sessionMinutes) || 45,
    expiryMonths: Number(body.expiryMonths) || 6,
  });

  const year = new Date().getFullYear();
  const { data: existing } = await supabaseAdmin
    .from('va_contracts')
    .select('contract_number')
    .like('contract_number', `CON-${year}-%`);

  const contractNumber = nextDocumentNumber(
    'CON',
    (existing ?? []).map((r: { contract_number: string }) => r.contract_number),
    year,
  );

  const { data, error } = await supabaseAdmin
    .from('va_contracts')
    .insert({
      client_id: client.id,
      contract_number: contractNumber,
      title: projectTitle.slice(0, 200),
      body_markdown: bodyMarkdown,
      fee_cents: feeCents,
      usage_terms: String(body.usageScopeId ?? 'web'),
      delivery_date: body.deliveryDate ? String(body.deliveryDate) : null,
      revisions_included: Math.max(0, Math.round(Number(body.revisionsIncluded ?? 1))),
      status: 'draft',
      access_token: generatePrefixedToken('con'),
    })
    .select('id, contract_number')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contract: data });
}
