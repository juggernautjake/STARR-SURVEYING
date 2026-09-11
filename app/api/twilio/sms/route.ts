// app/api/twilio/sms/route.ts — a text message sent to the business number.
//
// Customers reply to the texts the site sends them, and some text first. Nothing was answering.
// Now every inbound text is forwarded to the owners (LEAD_SMS_RECIPIENTS) with the sender's number,
// and the sender gets one short acknowledgement. STOP/HELP are handled by Twilio itself before this
// route ever sees them (Advanced Opt-Out), so they are not special-cased here.
//
// PUBLIC BY DESIGN: Twilio-signed, like the receptionist routes.
import { NextResponse } from 'next/server';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { message, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { sendSMSViaTwilio } from '@/lib/saas/notifications/sms';
import { leadSmsRecipients } from '@/lib/leads/intake';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const from = params.From ?? '';
  const body = (params.Body ?? '').trim();
  const owners = leadSmsRecipients();
  if (body && !owners.includes(from)) {
    const forward = `Text from ${from}: ${body.slice(0, 1200)}`;
    await Promise.all(owners.map((to) => sendSMSViaTwilio({ to, body: forward }).catch((err) => console.error('[twilio/sms] forward failed:', err))));
    return twimlResponse(twiml(message('Thanks for texting Starr Surveying. We got your message and will reply during business hours. Reply STOP to opt out.')));
  }
  return twimlResponse(twiml());
}
