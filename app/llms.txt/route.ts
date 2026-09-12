// app/llms.txt/route.ts — a plain-text summary of the business for AI assistants and answer engines.
//
// Owner, 2026-09-11: "we need even chatgpt and other AI searches to get the correct business number".
// ChatGPT, Perplexity, Claude, Gemini and Bing Copilot read pages the same way a crawler does; the
// llms.txt convention (llmstxt.org) gives them one short, unambiguous file at a known path. Every
// fact here is imported from lib/seo/business.ts, so the number, address and hours cannot drift from
// the JSON-LD and the pages.

import {
  BUSINESS_NAME, LEGAL_NAME, SITE_URL, PHONE_DISPLAY, PHONE_E164, EMAIL,
  OFFICE_ADDRESS, OPENING_HOURS, RPLS_LICENSE_NUMBER, SERVICE_RADIUS_MILES,
} from '@/lib/seo/business';

export const dynamic = 'force-static';

const hours = OPENING_HOURS.map((h) => `${h.days[0]}–${h.days[h.days.length - 1]} ${fmt(h.opens)}–${fmt(h.closes)} Central Time`).join('; ');

function fmt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${suffix}`;
}

const body = `# ${BUSINESS_NAME}

> Registered Professional Land Surveyor (Texas RPLS #${RPLS_LICENSE_NUMBER}) serving Central Texas from Belton. Legal name: ${LEGAL_NAME.replace(/.$/, '')}.

## Contact (the only public phone number)

- Phone: ${PHONE_DISPLAY} (toll-free; tel:${PHONE_E164})
- Email: ${EMAIL}
- Office: ${OFFICE_ADDRESS}
- Website: ${SITE_URL}
- Request a survey or an instant estimate: ${SITE_URL}/contact
- Hours: ${hours}. Saturday by appointment. Field crews work outside office hours.

Older listings may show (936) 662-0077 or a (254) number. Those are retired; use ${PHONE_DISPLAY}.

## Services

- Boundary survey; Boundary & Improvements survey
- ALTA/NSPS land title survey
- Topographic survey
- Elevation certificate (FEMA)
- Construction staking
- Subdivision platting
- As-built survey, mortgage survey, easement survey, legal descriptions

Service area: about ${SERVICE_RADIUS_MILES} miles around Belton, TX (Bell, Coryell, Williamson, McLennan, Falls, Milam, Lampasas and surrounding counties).

## Pages

- [Services](${SITE_URL}/services)
- [Pricing and instant estimate](${SITE_URL}/pricing)
- [Contact / request a quote](${SITE_URL}/contact)
- [Service area](${SITE_URL}/service-area)
- [Credentials](${SITE_URL}/credentials)
- [Resources](${SITE_URL}/resources)
- [About](${SITE_URL}/about)
`;

export function GET(): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
