// lib/receptionist/knowledge.ts — everything the receptionist is allowed to say about the firm.
//
// Scraped from the public site on 2026-09-11 (home, services, pricing, service-area, resources
// FAQ, about, credentials) and the business constants in lib/seo/business.ts. If the website
// changes, change this; a receptionist that contradicts the site is worse than one that says
// "I'm not sure". Facts only here — how to *use* them (soft answers, no commitments) lives in the
// system prompt in ./brain.ts.
import { PHONE_DISPLAY, EMAIL, OFFICE_STREET, OFFICE_CITY, OFFICE_REGION, OPENING_HOURS, RPLS_LICENSE_NUMBER, SERVICE_RADIUS_MILES } from '@/lib/seo/business';

export const OWNER_NAME = process.env.RECEPTIONIST_OWNER_NAME || 'Hank';
export const ASSISTANT_NAME = process.env.RECEPTIONIST_NAME || 'Ellie';

export const SERVICES: Array<{ id: string; name: string; what: string; typical: string }> = [
  { id: 'boundary', name: 'Boundary survey', what: 'Establishes and marks the property lines and corners from the deed, records, and evidence on the ground. For fences, sales, building, permits, and disputes. Our most common job.', typical: '$400 to $2,500 and up' },
  { id: 'alta', name: 'ALTA/NSPS land title survey', what: 'The detailed commercial survey lenders and title companies require. Follows the national ALTA/NSPS standards; a Texas TSPS category survey is the state equivalent.', typical: '$2,000 to $10,000 and up' },
  { id: 'topographic', name: 'Topographic survey', what: 'Maps elevations, contours, and features of a site for design, drainage, and construction planning.', typical: '$600 to $5,000 and up' },
  { id: 'elevation', name: 'Elevation certificate', what: 'The FEMA form documenting a structure’s elevation against the flood zone, for flood insurance or a LOMA application.', typical: '$350 to $600' },
  { id: 'construction', name: 'Construction staking', what: 'Stakes and control points so buildings, roads, and utilities are built where the plans say.', typical: '$300 to $2,000 and up' },
  { id: 'subdivision', name: 'Subdivision platting', what: 'Divides land into lots with roads and easements and prepares the plat for county approval.', typical: '$2,500 to $15,000 and up' },
  { id: 'mortgage', name: 'Mortgage or loan survey', what: 'The survey a lender requires for a purchase; shows boundaries and improvements.', typical: '$350 to $800' },
  { id: 'asbuilt', name: 'As-built survey', what: 'Documents completed construction for compliance.', typical: '$400 to $1,500 and up' },
  { id: 'easement', name: 'Route or easement survey', what: 'Surveys a corridor for utilities, pipelines, or access easements.', typical: '$500 to $5,000 and up' },
  { id: 'legal_description', name: 'Legal description', what: 'Writes or verifies the metes-and-bounds description for a deed.', typical: '$250 to $800' },
];

export const SERVICE_AREA = {
  radiusMiles: SERVICE_RADIUS_MILES,
  counties: ['Bell', 'Williamson', 'Coryell', 'Falls', 'McLennan', 'Travis', 'Madison', 'Walker', 'Montgomery'],
  /** Straight from the service-area page. */
  beyond: 'For larger projects we are happy to discuss areas outside our primary coverage; travel fees may apply for distant locations.',
};

export const TIMING = {
  residential: 'A standard residential boundary survey typically takes two to five business days from field work to delivery.',
  larger: 'Larger properties, commercial ALTA surveys, and complex topographic surveys may take one to three weeks.',
  rush: 'Rush service is often available for time-sensitive transactions, at a 25 percent rush fee.',
  quoteTurnaround: 'A written quote usually follows within a business day or two of the consultation.',
};

export const PRICING_RULES = {
  fieldRatePerHour: 175,
  prepRatePerHour: 130,
  travelPerMile: 1.9,
  rushMultiplier: 1.25,
  drivers: 'Price depends on property size and shape, distance from Belton, vegetation, terrain, water features, how much record research is needed, and how many corner markers must be set.',
  disclaimer: 'Every number the receptionist gives is a rough estimate from the website calculator, not a quote. Final pricing comes in a written proposal after a live representative reviews the request, and it can change.',
};

export const FAQ: Array<{ q: string; a: string }> = [
  { q: 'How long does a survey take?', a: `${TIMING.residential} ${TIMING.larger} ${TIMING.rush}` },
  { q: 'How long is a survey valid?', a: 'Legally a survey has no expiration date. Lenders and title companies often want one less than six to twelve months old, and if improvements were added since, a new one may be needed.' },
  { q: 'Do I need a survey to build a fence?', a: 'Not always legally required, but strongly recommended. A fence in the wrong place can mean disputes, forced removal, or legal action.' },
  { q: 'What is an RPLS?', a: `Registered Professional Land Surveyor, the Texas license. Only an RPLS can prepare and certify surveys in Texas. ${OWNER_NAME} is RPLS number ${RPLS_LICENSE_NUMBER}, verifiable on the TBPELS website.` },
  { q: 'What is the difference between a plat and a survey?', a: 'A plat is a recorded map dividing land into lots, filed with the county. A survey shows the boundaries and features of one property. Surveys can be used to create plats, but not all surveys are recorded.' },
  { q: 'Can I use my neighbor’s survey?', a: 'No. A survey is prepared for and certified to a specific client and property.' },
  { q: 'What are easements?', a: 'Legal rights letting others use part of your property for things like utilities, drainage, or access. They can limit what you can build. A survey shows recorded easements.' },
  { q: 'What is an encroachment?', a: 'A structure, fence, or improvement that crosses a property line or an easement. Surveys identify them; they can affect sales, title insurance, and neighbors.' },
  { q: 'Do I need a survey for a closing?', a: 'It depends on the lender. Most lenders require one for a mortgage. Cash buyers often skip it, but we recommend one so you know exactly what you are buying.' },
  { q: 'How do I know a surveyor is licensed?', a: 'Look them up on the Texas Board of Professional Engineers and Land Surveyors site, pels dot texas dot gov, by name or license number.' },
  { q: 'Where can I find an existing survey of my property?', a: 'Your closing documents from the title company, the county clerk’s records, the General Land Office for older rural tracts, the county appraisal district for rough maps, or the surveyor who did the last one.' },
];

export const ABOUT = {
  founded: 'Starr Surveying is a family land surveying firm in Belton, Texas, owned and operated by a Registered Professional Land Surveyor, with more than fifteen years of professional surveying experience in Central Texas.',
  values: 'Founded on professionalism, accuracy, and integrity, and guided by Christian values. The firm’s verse is Proverbs 22:28, “Remove not the ancient landmark, which thy fathers have set.”',
  equipment: 'GPS and GNSS receivers, robotic total stations, and CAD software. Every survey is reviewed before delivery.',
  team: `${OWNER_NAME} Maddux, RPLS number ${RPLS_LICENSE_NUMBER}, leads the firm. Jacob Maddux is party chief and survey technician.`,
};

export function hoursSentence(): string {
  const h = OPENING_HOURS[0];
  if (!h) return 'weekdays during business hours';
  const t = (x: string) => { const [hh, mm] = x.split(':').map(Number); const ap = (hh ?? 0) >= 12 ? 'p.m.' : 'a.m.'; const h12 = ((hh ?? 0) % 12) || 12; return mm ? `${h12}:${String(mm).padStart(2, '0')} ${ap}` : `${h12} ${ap}`; };
  return `${h.days[0]} through ${h.days[h.days.length - 1]}, ${t(h.opens)} to ${t(h.closes)}`;
}

/** The knowledge block for the system prompt. Written to be read by a model, not a person. */
export function knowledgeText(): string {
  return [
    `FIRM: Starr Surveying (legal name Starr Technical Services, Inc.), ${OFFICE_STREET}, ${OFFICE_CITY}, ${OFFICE_REGION}. Phone ${PHONE_DISPLAY}. Email ${EMAIL}. Website starr-surveying.com (request form and instant estimate calculator). Office hours ${hoursSentence()}; field crews work outside those hours.`,
    ABOUT.founded + ' ' + ABOUT.team + ' ' + ABOUT.equipment,
    `SERVICES (name: what it is; typical price range on the website):\n` + SERVICES.map((s) => `- ${s.name}: ${s.what} Typically ${s.typical}.`).join('\n'),
    `SERVICE AREA: primarily within ${SERVICE_AREA.radiusMiles} miles of Belton, including ${SERVICE_AREA.counties.join(', ')} counties. ${SERVICE_AREA.beyond}`,
    `TIMING: ${TIMING.residential} ${TIMING.larger} ${TIMING.rush} ${TIMING.quoteTurnaround}`,
    `PRICING: ${PRICING_RULES.drivers} Field crew time is billed at $${PRICING_RULES.fieldRatePerHour} an hour and travel at $${PRICING_RULES.travelPerMile.toFixed(2)} a mile one way from Belton in the calculator. Rush is plus 25 percent. ${PRICING_RULES.disclaimer}`,
    `FAQ:\n` + FAQ.map((f) => `- Q: ${f.q} A: ${f.a}`).join('\n'),
  ].join('\n\n');
}
