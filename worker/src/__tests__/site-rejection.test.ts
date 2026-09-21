/**
 * Telling a refusal from an answer.
 *
 * Every case here is a real failure this repository has chased. The common shape is a refusal that
 * looked like an answer — and the cost is always the same: a run reports a clean title on a parcel
 * nobody actually searched.
 */

import { describe, it, expect } from 'vitest';
import {
  readTransportError, readHttpResponse, readSearchPage, rejectionLine,
} from '../research/site-rejection.js';

describe('transport errors — the ones that get misread', () => {
  it('a hostname that does not resolve is a CONFIG error, not a block', () => {
    // esearch.wilcotx.gov. This cost job 26144 thirty-three seconds and two log lines that both
    // read as "the county site is down".
    const v = readTransportError(new Error('getaddrinfo ENOTFOUND esearch.wilcotx.gov'));
    expect(v.kind).toBe('no_such_host');
    expect(v.aboutUs).toBe(true);
    expect(v.retryable, 'no proxy can reach a host that does not exist').toBe(false);
    expect(v.message).toMatch(/not a block/i);
  });

  it('Chromium\'s wording for the same thing', () => {
    expect(readTransportError(new Error('net::ERR_NAME_NOT_RESOLVED')).kind).toBe('no_such_host');
  });

  it('a refused tunnel is OUR egress, and it looks identical to a dead site', () => {
    const v = readTransportError(new Error('net::ERR_TUNNEL_CONNECTION_FAILED at https://x.gov/'));
    expect(v.kind).toBe('tunnel_refused');
    expect(v.aboutUs).toBe(true);
    expect(v.remedy).toMatch(/\.gov hosts/i);
  });

  it('an expired certificate is the SITE\'s problem and not retryable by us', () => {
    // gisweb.wcad.org, live example.
    const v = readTransportError(new Error('net::ERR_CERT_DATE_INVALID'));
    expect(v.kind).toBe('server_error');
    expect(v.aboutUs).toBe(false);
    expect(v.retryable).toBe(false);
  });

  it('a timeout is retryable and not about us', () => {
    const v = readTransportError(new Error('The operation was aborted due to timeout'));
    expect(v.retryable).toBe(true);
    expect(v.aboutUs).toBe(false);
  });
});

describe('HTTP responses', () => {
  it('403 is the site refusing THIS CLIENT', () => {
    // bellcountytx.com does exactly this to datacentre addresses.
    const v = readHttpResponse(403, 'Forbidden');
    expect(v.kind).toBe('ip_blocked');
    expect(v.aboutUs).toBe(true);
    expect(v.remedy).toMatch(/relay|residential/i);
  });

  it('a Cloudflare 403 is a BOT WALL, because the remedy differs', () => {
    const v = readHttpResponse(403, 'Just a moment... checking your browser', { 'cf-ray': 'abc123' });
    expect(v.kind).toBe('bot_wall');
    expect(v.remedy).toMatch(/residential browser/i);
  });

  it('a 200 carrying a bot wall is still a bot wall', () => {
    expect(readHttpResponse(200, '<html>Checking your browser before accessing</html>').kind).toBe('bot_wall');
  });

  it('the outdatedbrowser wall names the user-agent as the cause', () => {
    // The exact signature the Kofile scrape hit: 0 rows, and a link to outdatedbrowser.com.
    const v = readHttpResponse(200, '<a href="http://outdatedbrowser.com">Update your browser</a>');
    expect(v.kind).toBe('browser_wall');
    expect(v.remedy).toMatch(/KHTML, like Gecko/);
    expect(v.remedy).toMatch(/Safari\/537\.36/);
  });

  it('429 is rate limiting and is retryable', () => {
    const v = readHttpResponse(429, '');
    expect(v.kind).toBe('rate_limited');
    expect(v.retryable).toBe(true);
  });

  it('a clean 200 is ok', () => {
    const v = readHttpResponse(200, '<html><body>Showing page 1 of 2 for 162 Total Results</body></html>');
    expect(v.kind).toBe('ok');
    expect(v.aboutUs).toBe(false);
  });

  it('500 is the site, not us', () => {
    const v = readHttpResponse(503, 'Service Unavailable');
    expect(v.aboutUs).toBe(false);
    expect(v.retryable).toBe(true);
  });
});

describe('search result pages — the hardest distinction', () => {
  it('"could not be completed" is a refused QUESTION, not a refused client, and not no-results', () => {
    // Tyler's phrasing when a chip-list name was filled instead of selected. Read as "no results",
    // this is a property with no deeds.
    const v = readSearchPage("We're sorry. Your search could not be completed.");
    expect(v.kind).toBe('bad_query');
    expect(v.aboutUs, 'the site did not refuse US — it refused the query').toBe(false);
    expect(v.message).toMatch(/NOT "no results"/);
    expect(v.remedy).toMatch(/select the name/i);
  });

  it('an empty results page that ran IS a finding about the property', () => {
    const v = readSearchPage('Showing page 1 of 1 for 0 Total Results');
    expect(v.kind).toBe('ok');
    expect(v.message).toMatch(/finding about the property/i);
  });

  it('a page with rows is fine', () => {
    expect(readSearchPage('anything at all', { rowCount: 18 }).kind).toBe('ok');
  });

  it('a browser wall on the results page means the search never ran', () => {
    const v = readSearchPage('Please visit outdatedbrowser.com to upgrade');
    expect(v.kind).toBe('browser_wall');
    expect(v.message).toMatch(/never ran/i);
  });

  it('a disclaimer instead of results is a session problem', () => {
    const v = readSearchPage('Disclaimer Content — you must accept the terms to continue');
    expect(v.kind).toBe('needs_session');
    expect(v.aboutUs).toBe(true);
  });

  it('an EMPTY page with no other signal is treated as an honest empty result', () => {
    // Deliberate: everything that would indicate a refusal has been ruled out by this point, and
    // refusing to report a genuine empty result would make the pipeline unable to ever say "no
    // documents exist".
    const v = readSearchPage('');
    expect(v.kind).toBe('ok');
    expect(v.aboutUs).toBe(false);
  });
});

describe('the log line says whose problem it is', () => {
  it('marks our problems', () => {
    const line = rejectionLine(readTransportError(new Error('ENOTFOUND x.gov')));
    expect(line).toContain('OUR PROBLEM');
    expect(line).toContain('no_such_host');
  });

  it('does not blame us for the site\'s 500', () => {
    expect(rejectionLine(readHttpResponse(500, ''))).toContain('the site');
  });

  it('an ok verdict is just its message', () => {
    expect(rejectionLine(readSearchPage('', { rowCount: 3 }))).not.toContain('[');
  });
});
