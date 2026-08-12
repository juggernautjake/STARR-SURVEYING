// lib/leads/identity.ts — who was behind a click, and how sure we are. A7.
//
// Owner: *"If we are capturing unique customer info, we need to be able to track that and be able to
// review the unique customer info for a given click, conversion, and/or form submission, and/or
// call."*
//
// ── WHAT THE INVENTORY FOUND (production, 2026-08-12) ───────────────────────────────────────────
//
// Eleven real leads. Seven carry a Google click id — five `gclid`, two `gbraid` — along with the
// landing page and the referrer. So the capture chain (landing → localStorage → hidden form field →
// `leads` row) genuinely works in production; this is not a viewer over empty columns.
//
// **But not one lead has a single UTM parameter.** That is not a bug in the capture: Google Ads is
// auto-tagging rather than manually tagged, so the landing URLs arrive as
//
//     /contact?gad_source=1&gad_campaignid=23598795033&gclid=CjwKCAjw...
//
// There is no `utm_campaign` to read, and the dashboard's campaign breakdown — which keys on
// `utm_campaign` — therefore shows "(no campaign)" for every lead we have. The campaign IS there; it
// is sitting inside the landing page string, unparsed. `campaignIdFromLanding` below is that parse.
//
// ── NEVER INVENT AN IDENTITY ────────────────────────────────────────────────────────────────────
//
// The slice's own rule, and the reason `confidence` exists rather than a boolean. A conversion with
// no click id is "anonymous — arrived without a click id", never a plausible-looking guess. A
// dashboard that quietly attributes the wrong customer to a sale is worse than one that admits it
// does not know: the wrong answer gets acted on, and the missing one gets investigated.

/** The fields this module needs. Loose on purpose so a route can pass a row straight through. */
export interface LeadIdentityInput {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  how_heard?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
}

/**
 * How confident we are that this person can be tied to an ad click.
 *
 *   click     — a Google click id is stored. This is the only kind that can be traced to the ad,
 *               matched to a conversion upload, and joined to campaign spend.
 *   inferred  — no click id, but the landing page or referrer says they arrived from Google. Enough
 *               to say "search brought them", not enough to name the click.
 *   declared  — the customer told us themselves, via the "how did you hear about us" dropdown. The
 *               weakest evidence and the only one that covers phone calls.
 *   anonymous — nothing at all. Said plainly rather than dressed up.
 */
export type IdentityConfidence = 'click' | 'inferred' | 'declared' | 'anonymous';

export interface LeadIdentity {
  leadId: string | null;
  /** Best available human label. Never a fabricated name. */
  displayName: string;
  email: string | null;
  phone: string | null;
  /** The click id and which parameter carried it, or null. */
  clickId: { field: 'gclid' | 'gbraid' | 'wbraid'; value: string } | null;
  /** Google Ads campaign id, from `utm_campaign` or from the auto-tagged landing URL. */
  campaignId: string | null;
  /** Where the campaign id was found — so a mismatch with spend data can be diagnosed. */
  campaignIdSource: 'utm' | 'landing-page' | null;
  confidence: IdentityConfidence;
  /** One sentence a person can read, e.g. "Google Ads click (gclid), campaign 23598795033". */
  explanation: string;
  landingPage: string | null;
  referrer: string | null;
  howHeard: string | null;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

/**
 * Pull a Google Ads campaign id out of an auto-tagged landing URL.
 *
 * Auto-tagging appends `gad_campaignid` (and `gad_source`) rather than UTM parameters, so a site
 * that never set up manual tagging has the campaign in every landing URL and nowhere else. Reading
 * it here is what lets a lead be attributed to a campaign at all.
 *
 * Parsed as a query string rather than with a regex over the whole URL, so a campaign id appearing
 * inside some other value — a `redirect=` parameter carrying its own query, say — cannot be
 * mistaken for the real one.
 */
export function campaignIdFromLanding(landingPage: string | null | undefined): string | null {
  const raw = clean(landingPage);
  if (!raw) return null;
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return null;
  try {
    const params = new URLSearchParams(raw.slice(qIndex + 1));
    // `gad_campaignid` is the documented auto-tagging parameter. `campaignid` is what the older
    // {campaignid} ValueTrack placeholder writes when someone has set up manual tracking templates.
    for (const key of ['gad_campaignid', 'campaignid', 'utm_campaign_id']) {
      const v = clean(params.get(key));
      // Campaign ids are numeric. Rejecting anything else stops a manually-tagged campaign NAME
      // being returned as an id and then failing to join against spend rows for reasons nobody
      // can see.
      if (v && /^\d{5,}$/.test(v)) return v;
    }
  } catch {
    /* a malformed landing URL is missing data, not an error worth throwing over */
  }
  return null;
}

/** True when the landing page or referrer shows a Google origin without a click id to prove it. */
function looksLikeGoogle(landing: string | null, referrer: string | null): boolean {
  const hay = `${landing ?? ''} ${referrer ?? ''}`.toLowerCase();
  return hay.includes('google.') || hay.includes('gad_source') || hay.includes('gclsrc');
}

/**
 * Describe who this lead is and how we know.
 *
 * Every branch has to be defensible to somebody looking at one row and asking "why does it say
 * that?", which is why `explanation` is built here rather than in the component: the sentence and
 * the confidence are the same decision, and splitting them is how they drift apart.
 */
export function describeLeadIdentity(lead: LeadIdentityInput): LeadIdentity {
  const gclid = clean(lead.gclid);
  const gbraid = clean(lead.gbraid);
  const wbraid = clean(lead.wbraid);

  const clickId = gclid
    ? { field: 'gclid' as const, value: gclid }
    : gbraid
      ? { field: 'gbraid' as const, value: gbraid }
      : wbraid
        ? { field: 'wbraid' as const, value: wbraid }
        : null;

  const landingPage = clean(lead.landing_page);
  const referrer = clean(lead.referrer);
  const howHeard = clean(lead.how_heard);

  const utmCampaign = clean(lead.utm_campaign);
  const fromLanding = campaignIdFromLanding(landingPage);
  // UTM wins when present: somebody set it deliberately, and a deliberate tag beats one Google
  // appended. In this account it is always absent, which is the whole reason for the fallback.
  const campaignId = utmCampaign ?? fromLanding;
  const campaignIdSource = utmCampaign ? 'utm' as const : fromLanding ? 'landing-page' as const : null;

  const name = clean(lead.name);
  const email = clean(lead.email);
  const phone = clean(lead.phone);

  // Never fabricate. An unnamed lead with an email is shown by their email; one with neither is
  // shown as an anonymous enquiry, not as "Unknown Customer" dressed up as a name.
  const displayName = name ?? email ?? phone ?? 'Anonymous enquiry';

  let confidence: IdentityConfidence;
  let explanation: string;

  if (clickId) {
    confidence = 'click';
    explanation = `Google Ads click (${clickId.field})`
      + (campaignId ? `, campaign ${campaignId}` : ', campaign not in the landing URL');
  } else if (looksLikeGoogle(landingPage, referrer)) {
    confidence = 'inferred';
    explanation = 'Arrived from Google, but no click id was captured — the ad cannot be named.';
  } else if (howHeard) {
    confidence = 'declared';
    explanation = `Self-reported: "${howHeard}". Their word, not a measurement.`;
  } else {
    confidence = 'anonymous';
    explanation = 'No click id, no Google referrer and no answer to "how did you hear about us".';
  }

  return {
    leadId: clean(lead.id),
    displayName, email, phone,
    clickId, campaignId, campaignIdSource,
    confidence, explanation,
    landingPage, referrer, howHeard,
  };
}

/** Counts by confidence, for the "what can we actually see?" summary above the list. */
export function summariseIdentities(identities: readonly LeadIdentity[]): {
  total: number;
  click: number;
  inferred: number;
  declared: number;
  anonymous: number;
  /** Share traceable to a named ad click. `null` when there are no leads — not 0%. */
  clickShare: number | null;
} {
  const by = (c: IdentityConfidence) => identities.filter((i) => i.confidence === c).length;
  const total = identities.length;
  return {
    total,
    click: by('click'),
    inferred: by('inferred'),
    declared: by('declared'),
    anonymous: by('anonymous'),
    clickShare: total > 0 ? by('click') / total : null,
  };
}
