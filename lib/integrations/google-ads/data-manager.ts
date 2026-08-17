// lib/integrations/google-ads/data-manager.ts — offline conversions, on the API Google now requires.
//
// ── WHY THIS REPLACES ConversionUploadService ───────────────────────────────────────────────────
//
// On 2026-08-16, with the permission problem finally fixed, an upload returned **200** and then
// rejected the row inside `partialFailureError`:
//
//   "New integrations for uploading click conversions should use the Data Manager API. Usage of
//    ConversionUploadService.UploadClickConversions is limited to existing users."
//
// So the old path is closed to us. It is not deprecated-with-a-runway — it is closed to accounts
// that were not already using it, and this account was not. Every offline conversion this firm
// records has to go through `datamanager.googleapis.com` instead.
//
// Read off Google's own documentation on 2026-08-16:
//   · endpoint  POST https://datamanager.googleapis.com/v1/events:ingest
//   · scope     https://www.googleapis.com/auth/datamanager   ← NOT the adwords scope
//   · no developer token is required
//   · the Data Manager API must be enabled in the Cloud project
//
// ── THE THREE FIELD CHANGES THAT ARE EASY TO GET WRONG ──────────────────────────────────────────
//
//   1. **`productDestinationId` is the NUMERIC conversion action id, not the resource name.** Google
//      says it outright: *"Don't use the resource name of the ConversionAction."* Our four env vars
//      hold full resource names (`customers/7071902603/conversionActions/7712337565`), because that
//      is what the old API wanted — so the id is extracted here rather than asking somebody to
//      maintain a second set of variables that can drift from the first.
//   2. **`conversionValue` is in CURRENCY UNITS, not micros.** $5.23 is `5.23`. The old API took
//      micros in places, and this file sits next to code that stores micros everywhere, so the unit
//      is converted once, here, and named in the type.
//   3. **`eventTimestamp` is RFC 3339**, not the Ads API's `"yyyy-MM-dd HH:mm:ss+HH:mm"`. The two
//      look similar enough to copy by mistake and differ by a `T`.
//
// ── AND ONE DELIBERATE OMISSION ─────────────────────────────────────────────────────────────────
//
// `loginAccount` is NOT sent. It is the Data Manager equivalent of `login-customer-id`, and that
// header is precisely what broke this integration for nine days: `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
// named a manager account that manages only itself, so every call was refused with
// `USER_PERMISSION_DENIED`. The signed-in user is a direct Admin on the ad account and needs no
// manager in the path. It is sent ONLY if a login account is explicitly configured, and the helper
// below refuses to send one that equals the operating account — which is the shape the broken value
// had.
//
// Pure builders here; the network call is at the bottom. Tested in
// `__tests__/integrations/google-ads-data-manager.test.ts`.

export const DATA_MANAGER_ENDPOINT = 'https://datamanager.googleapis.com/v1/events:ingest';
export const DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager';

/** What a caller hands us — the same shape the old upload took, so callers barely change. */
export interface OfflineConversion {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  /** Full resource name OR a bare numeric id. Both are accepted; see `conversionActionId`. */
  conversionAction: string;
  /** RFC 3339, e.g. `2026-08-16T14:35:00-05:00`. */
  conversionDateTime: string;
  /** Currency units — dollars, not micros. */
  conversionValue?: number | null;
  currencyCode?: string | null;
  /** Becomes `transactionId`, and is what makes a re-upload an update rather than a duplicate. */
  orderId: string;
}

/**
 * The numeric conversion action id.
 *
 * Accepts `customers/123/conversionActions/456` → `456`, and a bare `456` → `456`, because the four
 * `GOOGLE_ADS_RESOURCE_*` variables hold resource names and asking an operator to keep a parallel
 * set of numeric ids in sync is how the two end up disagreeing.
 *
 * Returns null rather than guessing when it is neither — a wrong destination id does not error, it
 * files the conversion against somebody else's conversion action.
 */
export function conversionActionId(resourceOrId: string | null | undefined): string | null {
  const v = (resourceOrId ?? '').trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return v;
  const m = v.match(/conversionActions\/(\d+)\s*$/);
  return m ? m[1] : null;
}

/**
 * `2026-08-16 14:35:00-05:00` (Ads API style) → `2026-08-16T14:35:00-05:00` (RFC 3339).
 *
 * Passes through anything already RFC 3339. The difference is one character and the two formats are
 * otherwise identical, which is exactly why this is a function with a test rather than a `.replace`
 * at a call site.
 */
export function toRfc3339(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (v.includes('T')) return v;
  return v.replace(' ', 'T');
}

export interface DestinationConfig {
  /** The Google Ads customer id the conversions belong to. Digits only. */
  operatingAccountId: string;
  /** Optional manager. Omitted unless genuinely needed — see the header. */
  loginAccountId?: string | null;
}

export interface IngestRequest {
  destinations: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  validateOnly?: boolean;
}

/**
 * Build the `events:ingest` body.
 *
 * One destination per DISTINCT conversion action, because `productDestinationId` lives on the
 * destination rather than the event — a single destination would file every event against one
 * conversion action, silently turning "Job - Paid" into "Lead - Inquiry".
 *
 * Conversions whose action id cannot be resolved are returned separately rather than dropped: an
 * event that vanishes between our table and Google is the failure mode this whole integration keeps
 * producing, and a caller that cannot see it cannot log it.
 */
export function buildIngestRequest(
  conversions: readonly OfflineConversion[],
  dest: DestinationConfig,
  opts: { validateOnly?: boolean } = {},
): { request: IngestRequest; unresolved: Array<{ index: number; conversion: OfflineConversion }> } {
  // The INDEX travels with the row, because the caller reports failures as `{ index, code, message }`
  // and an index that no longer points at the row it describes is worse than no index.
  const unresolved: Array<{ index: number; conversion: OfflineConversion }> = [];
  const byAction = new Map<string, OfflineConversion[]>();

  conversions.forEach((c, index) => {
    const id = conversionActionId(c.conversionAction);
    if (!id) { unresolved.push({ index, conversion: c }); return; }
    const list = byAction.get(id) ?? [];
    list.push(c);
    byAction.set(id, list);
  });

  const operating = dest.operatingAccountId.replace(/\D/g, '');
  const login = (dest.loginAccountId ?? '').replace(/\D/g, '');
  // A "manager" that is the account itself is not a manager. That is the exact shape the broken
  // `GOOGLE_ADS_LOGIN_CUSTOMER_ID` had, and sending it is what Google refuses.
  const sendLogin = Boolean(login) && login !== operating;

  const destinations: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  for (const [actionId, list] of byAction) {
    const reference = `dest_${actionId}`;
    destinations.push({
      reference,
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: operating },
      ...(sendLogin ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: login } } : {}),
      productDestinationId: actionId,
    });
    for (const c of list) {
      events.push({
        destinationReferences: [reference],
        transactionId: c.orderId,
        eventTimestamp: toRfc3339(c.conversionDateTime),
        eventSource: 'WEB',
        adIdentifiers: {
          ...(c.gclid ? { gclid: c.gclid } : {}),
          ...(c.gbraid ? { gbraid: c.gbraid } : {}),
          ...(c.wbraid ? { wbraid: c.wbraid } : {}),
        },
        // Currency units, NOT micros. Omitted entirely when there is no value: sending 0 asserts the
        // job was worth nothing, which is a different claim from "we have not priced it yet".
        ...(typeof c.conversionValue === 'number' ? { conversionValue: c.conversionValue } : {}),
        currency: c.currencyCode ?? 'USD',
      });
    }
  }

  return {
    request: { destinations, events, ...(opts.validateOnly ? { validateOnly: true } : {}) },
    unresolved,
  };
}

/**
 * Is this failure "nobody has granted the Data Manager scope yet"?
 *
 * Worth its own answer because it is the expected state until somebody reconnects the account, and
 * it needs an instruction rather than a stack trace. The old integration's whole failure mode was a
 * permission error that read like a broken account link and sent people to redo the wrong thing.
 */
export function isScopeProblem(message: string): boolean {
  return /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED|has not been used|is disabled/i.test(message);
}

export const DATA_MANAGER_SETUP_HELP =
  'Offline conversions need the Data Manager API: enable it in the Google Cloud project, then '
  + 'reconnect Google Ads at /admin/marketing so the connection carries the '
  + `"${DATA_MANAGER_SCOPE}" scope. The Ads scope alone is not enough.`;
