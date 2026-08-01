// lib/integrations/google-ads/select.ts — WHICH lifecycle events become an upload, and why the rest don't. A8.
//
// Pulled out of the cron route on purpose. The route is I/O; this is the decision, and the decision is the
// part that can be wrong in a way nobody notices: uploading the same conversion twice inflates the numbers
// Google bids on, and silently dropping one deflates them. Neither shows up as an error.
//
// ── EVERY SKIP IS COUNTED AND NAMED ─────────────────────────────────────────────────────────────────
//
// "12 of 40 uploaded" is not a report — it is the start of an investigation. The four skip reasons mean
// four different things:
//
//   • `noAction`        — we have not been told this milestone's conversion-action resource name (config).
//   • `noClick`         — the lead has no gclid/gbraid/wbraid at all (phone/referral; A7's enhanced path).
//   • `outOfWindow`     — the click is older than 90 days (Google will reject it; a fact, not a bug).
//   • `alreadyUploaded` — an identical payload already landed (correct, and the common case).
//
// Only the first is something to fix. Collapsing them into one number is how a configuration mistake gets
// mistaken for normal attribution loss for a month.
//
// ── "ALREADY UPLOADED" IS PER-PAYLOAD, NOT PER-EVENT ────────────────────────────────────────────────
//
// Keyed on `event_id:payload_hash`, so a value that later changes (the quote became a final amount) is a
// DIFFERENT payload and goes again as an adjustment — while a re-run of the same night is a no-op. A flag
// on the event could not express that distinction, which is exactly what A9 needs.

import { formatConversionTime, withinClickWindow } from './offline';
import { payloadHash, type ClickConversion } from './client';
import type { Milestone } from '@/lib/pipeline/events';

export interface SelectableEvent {
  id: string;
  milestone: Milestone;
  occurred_at: string;
  value_cents: number | null;
  lead_id: string | null;
}

export interface SelectableLead {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  first_seen_at?: string | null;
}

export interface SelectionSkips {
  noAction: number;
  noClick: number;
  outOfWindow: number;
  alreadyUploaded: number;
}

export interface Selection {
  payloads: ClickConversion[];
  /** `eventIds[i]` is the lifecycle event behind `payloads[i]` — the log needs the pairing. */
  eventIds: string[];
  skipped: SelectionSkips;
}

export interface SelectOptions {
  events: SelectableEvent[];
  leads: Map<string, SelectableLead>;
  /** `event_id:payload_hash` for everything already successfully uploaded. */
  uploadedKeys: Set<string>;
  /** Milestone → Ads conversion-action RESOURCE NAME. Null when unconfigured. */
  resourceFor: (m: Milestone) => string | null;
}

export function selectConversions({ events, leads, uploadedKeys, resourceFor }: SelectOptions): Selection {
  const payloads: ClickConversion[] = [];
  const eventIds: string[] = [];
  const skipped: SelectionSkips = { noAction: 0, noClick: 0, outOfWindow: 0, alreadyUploaded: 0 };

  for (const e of events) {
    const conversionAction = resourceFor(e.milestone);
    if (!conversionAction) { skipped.noAction += 1; continue; }

    const lead = e.lead_id ? leads.get(e.lead_id) : undefined;
    const gclid = lead?.gclid ?? undefined;
    const gbraid = lead?.gbraid ?? undefined;
    const wbraid = lead?.wbraid ?? undefined;
    if (!gclid && !gbraid && !wbraid) { skipped.noClick += 1; continue; }

    // Measured from the click, not from today: an event recorded now for a click 100 days ago is out.
    if (!withinClickWindow(lead?.first_seen_at ?? null, e.occurred_at)) { skipped.outOfWindow += 1; continue; }

    const payload: ClickConversion = {
      ...(gclid ? { gclid } : {}),
      ...(gbraid ? { gbraid } : {}),
      ...(wbraid ? { wbraid } : {}),
      conversionAction,
      // The SAME formatter A7's CSV uses. Two formatters would eventually disagree about a timezone and
      // show up in Ads as the same conversion an hour apart.
      conversionDateTime: formatConversionTime(e.occurred_at),
      ...(typeof e.value_cents === 'number' ? { conversionValue: e.value_cents / 100 } : {}),
      currencyCode: 'USD',
      // Google's dedupe key. Ours too — the same string in both directions is the only way the two
      // systems can agree about what "the same conversion" means.
      orderId: `${e.milestone}:${e.id}`,
    };

    if (uploadedKeys.has(`${e.id}:${payloadHash(payload)}`)) { skipped.alreadyUploaded += 1; continue; }

    payloads.push(payload);
    eventIds.push(e.id);
  }

  return { payloads, eventIds, skipped };
}
