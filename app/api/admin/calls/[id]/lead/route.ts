// app/api/admin/calls/[id]/lead/route.ts — turn a call into a lead (and from there, a project).
//
// The receptionist already creates a lead when it gets a customer's name and number. For every
// other call — one Hank answered, a voicemail, a call where the caller hung up early — this makes
// the lead on demand from whatever the call record and analysis hold, links it back to the call,
// and returns it so the page can send the admin straight to the existing "convert to job" flow
// (/admin/jobs/new?fromLead=…), which is how a project gets created everywhere else in the app.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { insertLeadFromForm, notifyIntakeRecipients, type LeadIntakeInput } from '@/lib/leads/intake';
import { getCall, updateCall, formatUsPhone } from '@/lib/receptionist/calls';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const segs = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segs[segs.length - 2];
  if (!id) return NextResponse.json({ error: 'Missing call id' }, { status: 400 });
  const call = await getCall(supabaseAdmin, id);
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (call.lead_id) return NextResponse.json({ leadId: call.lead_id, existing: true });

  const a = call.analysis;
  const sp = a?.suggested_project ?? null;
  const input: LeadIntakeInput = {
    name: call.caller_name || `Caller ${formatUsPhone(call.from_number)}`,
    email: '',
    phone: call.callback_number || call.from_number,
    propertyAddress: call.property_address || sp?.address || undefined,
    serviceType: call.service || sp?.service || undefined,
    projectDetails: [
      a?.summary || call.summary,
      call.details,
      sp?.notes,
      a?.action_items?.length ? `Action items: ${a.action_items.join('; ')}` : '',
      `From a phone call on ${call.started_at.slice(0, 10)} (${call.answered_by ?? 'unknown'}). Call record: /admin/calls/${call.id}`,
    ].filter(Boolean).join('\n'),
    referenceNumber: `PH-${call.started_at.slice(0, 10).replace(/-/g, '')}-${call.from_number.slice(-4)}`,
    source: 'Phone (call record)',
    howHeard: 'Phone call',
    isRush: a?.urgency === 'high',
  };
  const lead = await insertLeadFromForm(supabaseAdmin, input);
  if (!lead) return NextResponse.json({ error: 'Could not create the lead' }, { status: 500 });
  await updateCall(supabaseAdmin, call.call_sid, { lead_id: lead.id });
  await notifyIntakeRecipients(supabaseAdmin, { leadId: lead.id, input });
  return NextResponse.json({ leadId: lead.id, existing: false });
}, { routeName: 'admin/calls/[id]/lead' });
