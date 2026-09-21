/**
 * Did the site answer, refuse us, or refuse the question?
 *
 * Owner, 2026-09-21: "Please put checks in for if the clerk website rejects the ip address and
 * let's figure out what we need to do to make sure everything works together and nothing is
 * rejected."
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────────────────────────
 *
 * Because every failure this repository has chased for two days has been the same shape: a refusal
 * that looked like an answer.
 *
 *   · `esearch.wilcotx.gov` did not resolve, and the run reported "Cannot reach the CAD" — which
 *     reads as a site being down rather than a hostname that has never existed.
 *   · The Kofile portal answered 200 with an empty result set, because it holds only Commissioners
 *     Court minutes. The run reported "No documents found" about a property with 23 recorded
 *     instruments.
 *   · The Tyler clerk returned "Your search could not be completed" when a chip-list name was
 *     filled instead of selected. Read as "no results", that is a property with no deeds.
 *   · `bellcountytx.com` returns 403 to datacentre addresses, which is a REJECTION OF US and not a
 *     statement about the county's plats.
 *
 * A pipeline cannot act sensibly on any of these unless it can tell them apart. "Nothing found" is
 * a fact about the property and belongs in a report. "We were refused" is a fact about our
 * plumbing and belongs in an alert. Conflating them is how a run reports a clean title on a parcel
 * nobody actually searched.
 */

export type RejectionKind =
  /** The host does not exist. Not a block — a wrong name. */
  | 'no_such_host'
  /** A proxy or tunnel refused. Often mistaken for the site being down. */
  | 'tunnel_refused'
  /** The site refused THIS CLIENT — IP block, datacentre ban, WAF. */
  | 'ip_blocked'
  /** A bot wall: Cloudflare, PerimeterX, Akamai, a CAPTCHA. */
  | 'bot_wall'
  /** "Update your browser" — a user-agent or feature-detection wall. */
  | 'browser_wall'
  /** Rate limited. Back off and retry; not a permanent refusal. */
  | 'rate_limited'
  /** Needs a session, a login, or an accepted disclaimer. */
  | 'needs_session'
  /** The site is genuinely broken right now. */
  | 'server_error'
  /** The REQUEST was refused, not the client — a malformed or incomplete search. */
  | 'bad_query'
  /** Nothing is wrong. The search ran. */
  | 'ok';

export interface RejectionVerdict {
  kind: RejectionKind;
  /** True when this says something about US rather than about the property. */
  aboutUs: boolean;
  /** Plain words for the run log. */
  message: string;
  /** What to do next, when there is something to do. */
  remedy: string | null;
  /** Worth trying again later? */
  retryable: boolean;
}

const verdict = (
  kind: RejectionKind, aboutUs: boolean, message: string, remedy: string | null, retryable: boolean,
): RejectionVerdict => ({ kind, aboutUs, message, remedy, retryable });

/** Phrases a browser wall uses. `outdatedbrowser.com` is the giveaway the Kofile scrape hit. */
const BROWSER_WALL = /outdatedbrowser\.com|update your browser|browser is (out of date|not supported|unsupported)|upgrade your browser/i;

/** Bot walls. */
const BOT_WALL = /cloudflare|cf-ray|just a moment|checking your browser|perimeterx|px-captcha|incapsula|imperva|akamai|datadome|recaptcha|hcaptcha|are you a robot|unusual traffic/i;

/** Outright refusals of the client. */
const IP_BLOCK = /access denied|forbidden|your ip|ip address has been|blocked|not authorized to view|403 forbidden|request blocked/i;

const RATE_LIMIT = /rate limit|too many requests|slow down|429/i;

const NEEDS_SESSION = /session (has )?expired|please log ?in|sign in to continue|disclaimer|accept the (terms|conditions)/i;

/**
 * Read a transport-level error — a thrown fetch, a Playwright navigation failure.
 *
 * These are the ones most often misread, because Node and Chromium describe the same condition in
 * different words and neither says "the hostname is wrong".
 */
export function readTransportError(err: unknown): RejectionVerdict {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).trim();
  const m = msg.toLowerCase();

  // A hostname that does not resolve. This is the one that cost 33 seconds and two misleading log
  // lines on job 26144 — and it is NOT a block, so no amount of proxy work fixes it.
  if (/enotfound|err_name_not_resolved|getaddrinfo|dns|nxdomain/.test(m)) {
    return verdict('no_such_host', true,
      `The hostname does not resolve — ${msg}. This is a configuration error, not a block: no proxy ` +
      'can reach a host that does not exist.',
      'Check the configured hostname against the county\'s actual site.', false);
  }

  // A proxy refusing CONNECT. Looks identical to a dead site from inside Playwright.
  if (/err_tunnel_connection_failed|tunnel|proxy/.test(m)) {
    return verdict('tunnel_refused', true,
      `A proxy refused to open a tunnel — ${msg}.`,
      'Try the direct path, or a different egress. .gov hosts are commonly blocklisted by ' +
      'residential proxy pools.', true);
  }

  if (/econnrefused|err_connection_refused/.test(m)) {
    return verdict('ip_blocked', true, `The connection was refused — ${msg}.`,
      'Try a different egress; a refusal at connect time is usually the site declining this address.', true);
  }

  if (/certificate|cert_|ssl|err_cert/.test(m)) {
    return verdict('server_error', false,
      `The site's TLS certificate is not valid — ${msg}. gisweb.wcad.org is a live example.`,
      'Nothing to do from here; the site has to fix it.', false);
  }

  if (/timeout|timed out|etimedout|abort/.test(m)) {
    return verdict('server_error', false, `No answer before the timeout — ${msg}.`,
      'Retry once; if it persists the site is down or throttling.', true);
  }

  return verdict('server_error', false, msg || 'The request failed with no message.', null, true);
}

/**
 * Read an HTTP response plus its body.
 *
 * Both halves matter and neither is sufficient. A 200 can carry a bot wall; a 403 can be a WAF or
 * an ordinary permission error.
 */
export function readHttpResponse(status: number, body: string, headers: Record<string, string> = {}): RejectionVerdict {
  const t = String(body ?? '');
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));

  if (status === 429 || RATE_LIMIT.test(t)) {
    return verdict('rate_limited', true, 'The site is rate limiting us.',
      'Back off and retry with a longer interval.', true);
  }

  if (BOT_WALL.test(t) || h['cf-ray'] || h['server']?.toLowerCase().includes('cloudflare')) {
    return verdict('bot_wall', true,
      'A bot wall answered instead of the site — Cloudflare, PerimeterX or similar.',
      'This needs a residential browser session, not a datacentre fetch.', true);
  }

  // Checked AFTER the bot wall, because a 403 from Cloudflare is a bot wall and the remedy differs.
  if (status === 403 || (status === 401 && IP_BLOCK.test(t))) {
    return verdict('ip_blocked', true,
      `The site refused this client (${status}). bellcountytx.com does exactly this to datacentre addresses.`,
      'Route through the app relay or a residential browser session.', true);
  }

  if (BROWSER_WALL.test(t)) {
    return verdict('browser_wall', true,
      'The site served an "update your browser" page instead of content — our user-agent or ' +
      'feature detection was rejected.',
      'Send a complete, well-formed Chrome user-agent. A UA missing "(KHTML, like Gecko)" or the ' +
      'trailing "Safari/537.36" falls through every Chrome branch in the common detection ' +
      'libraries and lands in the "ancient browser" bucket.', true);
  }

  if (status === 404) {
    return verdict('no_such_host', true, 'The path does not exist on this host (404).',
      'Check the URL; the site may have reorganised.', false);
  }

  if (status >= 500) {
    return verdict('server_error', false, `The site returned ${status}.`, 'Retry later.', true);
  }

  if (NEEDS_SESSION.test(t) && status !== 200) {
    return verdict('needs_session', true, 'The site wants a session, a login or an accepted disclaimer.',
      'Accept the disclaimer and reuse the session cookie.', true);
  }

  if (status !== 200) {
    return verdict('server_error', false, `Unexpected status ${status}.`, null, true);
  }

  return verdict('ok', false, 'The site answered.', null, false);
}

/**
 * Read a rendered search-results page.
 *
 * This is where "no results" and "we were refused" are hardest to separate, because both render as
 * a page with no rows on it.
 */
export function readSearchPage(pageText: string, opts: { rowCount?: number } = {}): RejectionVerdict {
  const t = String(pageText ?? '');

  if (BROWSER_WALL.test(t)) {
    return verdict('browser_wall', true,
      'The results page is an "update your browser" wall — the search never ran.',
      'Send a complete Chrome user-agent and retry.', true);
  }

  if (BOT_WALL.test(t)) {
    return verdict('bot_wall', true, 'A bot wall replaced the results page — the search never ran.',
      'Use a residential browser session.', true);
  }

  // Tyler's phrasing when a chip-list field was filled rather than selected. This is a refusal of
  // the QUESTION, not of us — and it is emphatically not "no results".
  if (/could not be completed|unable to (complete|process) (your |the )?search/i.test(t)) {
    return verdict('bad_query', false,
      'The clerk refused the search itself — it was submitted incomplete. On this county that ' +
      'almost always means a name was typed into a chip-list field but never selected from the ' +
      'dropdown, so no search term was sent. This is NOT "no results".',
      'Select the name from the suggestion list, then search.', true);
  }

  if (NEEDS_SESSION.test(t) && !/total results/i.test(t)) {
    return verdict('needs_session', true,
      'The page is asking for a session or a disclaimer rather than showing results.',
      'Accept the disclaimer first and keep the cookie.', true);
  }

  // The count the page states, when it states one. A page reading "for 0 Total Results" HAS run —
  // it is a page of results that happens to have none — and saying "carries results" about it is
  // wrong in a way a caller could act on. Caught by the test suite.
  const stated = /for\s+([\d,]+)\s+Total Results/i.exec(t);
  const count = stated ? Number(stated[1]!.replace(new RegExp(',', 'g'), '')) : null;

  if ((opts.rowCount ?? 0) > 0 || (count !== null && count > 0)) {
    return verdict('ok', false, `The search ran and the page carries ${count ?? opts.rowCount} result(s).`, null, false);
  }

  // Everything above has been ruled out — no wall, no session prompt, no refusal — so an empty
  // page is genuinely an empty result. That is a fact about the property and safe to report as one,
  // which is the whole point of having ruled the others out first.
  return verdict('ok', false,
    'The search ran and matched nothing. This is a finding about the property, not a failure.',
    null, false);
}

/** One line for the run log, phrased so a reader can tell whose problem it is. */
export function rejectionLine(v: RejectionVerdict): string {
  if (v.kind === 'ok') return v.message;
  const whose = v.aboutUs ? 'OUR PROBLEM' : 'the site';
  return `[${v.kind} · ${whose}] ${v.message}${v.remedy ? ` — ${v.remedy}` : ''}`;
}
