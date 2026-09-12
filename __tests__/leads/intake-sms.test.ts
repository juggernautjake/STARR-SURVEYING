// New customer requests text the owners.
//
// The owner's ask (2026-09-11): "I want to be able to receive text messages whenever customers fill
// out the form and submit a request. I need my dad to also get those business messages."
//
// Recipients come from `LEAD_SMS_RECIPIENTS` so the list can change in Doppler without a deploy.
// The send goes through the existing Twilio adapter; this file only checks the wiring: who gets
// texted, what the text says, and that nothing here can ever break the intake.
import { describe, it, expect, vi } from 'vitest';
import { leadSmsRecipients, leadSmsBody, notifyLeadBySms, type LeadIntakeInput } from '@/lib/leads/intake';

type Send = (input: { to: string; body: string }) => Promise<boolean>;
const okSender = () => vi.fn<Send>(async () => true);

const input = {
  name: 'Jane Customer',
  email: 'jane@example.com',
  phone: '+12545550199',
  serviceType: 'Boundary survey',
  propertyAddress: '123 Main St, Belton, TX',
  referenceNumber: 'SS-2026-0042',
  isRush: true,
} as unknown as LeadIntakeInput;

describe('leadSmsRecipients', () => {
  it('parses a comma-separated E.164 list and drops junk', () => {
    expect(leadSmsRecipients({ LEAD_SMS_RECIPIENTS: '+12545550001, +12545550002 ,254-555-0003,, ' }))
      .toEqual(['+12545550001', '+12545550002']);
  });
  it('is empty when unset', () => {
    expect(leadSmsRecipients({})).toEqual([]);
  });
});

describe('leadSmsBody', () => {
  it('names the customer, the service, the address, the ref, RUSH, and links the admin lead page', () => {
    const body = leadSmsBody(input, 'lead-123');
    expect(body).toContain('Jane Customer');
    expect(body).toContain('Boundary survey');
    expect(body).toContain('123 Main St, Belton, TX');
    expect(body).toContain('Ref SS-2026-0042');
    expect(body).toContain('RUSH');
    expect(body).toContain('https://www.starr-surveying.com/admin/leads/lead-123');
    expect(body.length).toBeLessThan(320);
  });
});

describe('notifyLeadBySms', () => {
  it('texts every configured number once with the same body', async () => {
    const send = okSender();
    const r = await notifyLeadBySms(input, 'lead-1', { send, env: { LEAD_SMS_RECIPIENTS: '+12545550001,+12545550002' } });
    expect(r).toEqual({ attempted: 2, delivered: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    const calls = send.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to)).toEqual(['+12545550001', '+12545550002']);
    expect(calls[0]?.body).toBe(calls[1]?.body);
  });
  it('sends nothing and does not call Twilio when no recipients are configured', async () => {
    const send = okSender();
    const r = await notifyLeadBySms(input, 'lead-1', { send, env: {} });
    expect(r).toEqual({ attempted: 0, delivered: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it('never throws: a rejected send is counted as undelivered and the rest still go', async () => {
    const send = vi.fn<Send>()
      .mockRejectedValueOnce(new Error('twilio down'))
      .mockResolvedValueOnce(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await notifyLeadBySms(input, 'lead-1', { send, env: { LEAD_SMS_RECIPIENTS: '+12545550001,+12545550002' } });
    expect(r).toEqual({ attempted: 2, delivered: 1 });
    spy.mockRestore();
  });
});
