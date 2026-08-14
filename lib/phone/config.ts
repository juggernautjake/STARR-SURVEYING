// lib/phone/config.ts — slice P0a of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// One place that answers "can this deployment actually receive and place calls", because the two
// existing Twilio adapters each answered it themselves and both got it wrong in the same way.
//
// ── THE BUG THIS EXISTS TO KILL ─────────────────────────────────────────────────────────────────
//
// `lib/saas/notifications/sms.ts` and `worker/src/services/notification-service.ts` both read
// `TWILIO_FROM_NUMBER`. `.env.local` defines `TWILIO_PHONE_NUMBER`. So the credential check fails on
// a machine that has perfectly good credentials — and the SMS adapter's failure branch **returns
// `true`**, reporting a send that never happened. Two years of "SMS is wired up" rests on a code
// path that has never once contacted Twilio.
//
// Renaming the variable in `.env.local` would fix it for the owner's laptop and break it for
// whoever set the other name in Vercel, and there is no way to know which of the two the console
// actually has without asking. So both names are accepted, `TWILIO_FROM_NUMBER` wins when both are
// set, and `describeTwilioConfig` reports which one was used — a config that works but is not the
// one you think you set is the thing that costs an afternoon.
import { normalizePhone } from '@/lib/integrations/google/hash';

export interface TwilioConfig {
  accountSid: string | null;
  authToken: string | null;
  /** E.164, or null when unset *or* set to something Twilio would reject. */
  fromNumber: string | null;
  /** Which env var supplied the number, for the health screen. */
  fromNumberSource: 'TWILIO_FROM_NUMBER' | 'TWILIO_PHONE_NUMBER' | null;
  /** Where Twilio should send webhooks; also the URL signatures are checked against. */
  publicBaseUrl: string | null;
}

/** Trim and treat an empty or placeholder value as absent. */
function envValue(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Copy-pasted placeholders from the docs are worse than a missing value: they pass a truthiness
  // check and then fail at the API with an opaque 401.
  if (/^(your|xxx|changeme|placeholder|AC\.\.\.|\+1\.\.\.)/i.test(trimmed)) return null;
  return trimmed;
}

export function readTwilioConfig(): TwilioConfig {
  const fromCanonical = envValue('TWILIO_FROM_NUMBER');
  const fromLegacy = envValue('TWILIO_PHONE_NUMBER');
  const rawFrom = fromCanonical ?? fromLegacy;

  return {
    accountSid: envValue('TWILIO_ACCOUNT_SID'),
    authToken: envValue('TWILIO_AUTH_TOKEN'),
    fromNumber: normalizePhone(rawFrom),
    fromNumberSource: fromCanonical ? 'TWILIO_FROM_NUMBER' : fromLegacy ? 'TWILIO_PHONE_NUMBER' : null,
    publicBaseUrl:
      envValue('TWILIO_PUBLIC_BASE_URL') ??
      envValue('NEXT_PUBLIC_SITE_URL') ??
      (envValue('VERCEL_PROJECT_PRODUCTION_URL')
        ? `https://${envValue('VERCEL_PROJECT_PRODUCTION_URL')}`
        : null),
  };
}

export interface TwilioReadiness {
  /** Can we receive an inbound call and answer it? */
  canReceive: boolean;
  /** Can we place an outbound call? */
  canPlace: boolean;
  /** Can we verify that a webhook really came from Twilio? */
  canVerifyWebhooks: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * What this deployment can actually do, in the terms the owner cares about.
 *
 * Deliberately three booleans rather than one `configured` flag: receiving works with only a SID and
 * a token, while placing a call additionally needs a number to place it *from*. Collapsing them
 * would report the whole feature dead when only callbacks are.
 */
export function describeTwilioConfig(cfg: TwilioConfig = readTwilioConfig()): TwilioReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!cfg.accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!cfg.authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!cfg.fromNumber) missing.push('TWILIO_FROM_NUMBER');

  if (cfg.fromNumberSource === 'TWILIO_PHONE_NUMBER') {
    warnings.push(
      'The Twilio number is coming from TWILIO_PHONE_NUMBER. The documented name is ' +
        'TWILIO_FROM_NUMBER — both work, but set the documented one to avoid surprises.',
    );
  }
  if (envValue('TWILIO_PHONE_NUMBER') && envValue('TWILIO_FROM_NUMBER')) {
    warnings.push('Both TWILIO_FROM_NUMBER and TWILIO_PHONE_NUMBER are set; TWILIO_FROM_NUMBER wins.');
  }
  // A number that is set but unparseable is worse than one that is missing, because the missing
  // check passes and the API call fails later with a 21212 nobody will connect to this.
  const rawFrom = envValue('TWILIO_FROM_NUMBER') ?? envValue('TWILIO_PHONE_NUMBER');
  if (rawFrom && !cfg.fromNumber) {
    warnings.push(`The Twilio number "${rawFrom}" is not a phone number Twilio will accept.`);
  }
  if (!cfg.publicBaseUrl) {
    warnings.push(
      'No public base URL is configured, so webhook signatures are checked against the forwarded ' +
        'host. Set TWILIO_PUBLIC_BASE_URL to the domain in the Twilio console.',
    );
  }

  const haveAccount = Boolean(cfg.accountSid && cfg.authToken);
  return {
    canReceive: haveAccount,
    canPlace: haveAccount && Boolean(cfg.fromNumber),
    canVerifyWebhooks: Boolean(cfg.authToken),
    missing,
    warnings,
  };
}

/** The REST base for this account, or null when unconfigured. */
export function twilioApiBase(cfg: TwilioConfig = readTwilioConfig()): string | null {
  return cfg.accountSid ? `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}` : null;
}

/** HTTP Basic header value for the REST API. */
export function twilioAuthHeader(cfg: TwilioConfig = readTwilioConfig()): string | null {
  if (!cfg.accountSid || !cfg.authToken) return null;
  return `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`;
}
