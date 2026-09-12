// lib/receptionist/knowledge.ts — everything the receptionist is allowed to say about the firm.
//
// Scraped from the public site on 2026-09-11 (home, services, pricing, service-area, resources
// FAQ, about, credentials) and the business constants in lib/seo/business.ts. If the website
// changes, change this; a receptionist that contradicts the site is worse than one that says
// "I'm not sure". Facts only here — how to *use* them (soft answers, no commitments) lives in the
// system prompt in ./brain.ts.
import { BUSINESS_NAME, SITE_URL, PHONE_DISPLAY, EMAIL, OFFICE_STREET, OFFICE_CITY, OFFICE_REGION, OPENING_HOURS, RPLS_LICENSE_NUMBER, SERVICE_RADIUS_MILES } from '@/lib/seo/business';

const SITE_HOST = SITE_URL.replace(/^https?:\/\/(www\.)?/, '');

export const OWNER_NAME = process.env.RECEPTIONIST_OWNER_NAME || 'Hank';
export const ASSISTANT_NAME = process.env.RECEPTIONIST_NAME || 'Ellie';

/** Every survey the firm sells: what it is, when someone needs it, what they get, and how long the
 *  field work tends to run. Mirrors the website's service, pricing, and resources pages. */
export const SERVICES: Array<{ id: string; name: string; what: string; when: string; deliverable: string; field: string; typical: string }> = [
  {
    id: 'boundary', name: 'Boundary survey',
    what: 'The surveyor researches the deed and the neighboring deeds, finds the existing corner markers on the ground, measures them, resolves where the lines legally are, and sets or replaces corner pins so the lines can be found again.',
    when: 'Before a fence, a sale or purchase, a building addition, a subdivision, or whenever there is a question about where a line is. Our most common job.',
    deliverable: 'A signed and sealed survey drawing (plat) showing the lines, corners, bearings and distances, plus the pins on the ground and, if needed, a written legal description.',
    field: 'A typical city lot is a few hours in the field; a rural tract with heavy brush, old markers, or many corners can take a day or more.',
    typical: '$400 to $2,500 and up',
  },
  {
    id: 'boundary_improvements', name: 'Boundary and improvements survey',
    what: 'Everything a boundary survey does, and in addition the crew locates the house, outbuildings, driveways, fences, pools, and visible utilities and the drawing shows exactly how each sits in relation to the property lines, easements, and setbacks. It identifies encroachments in either direction.',
    when: 'Real estate closings, lender requirements, refinancing, building permits and additions, or any time the question is "is what’s built where it’s supposed to be?" Most closings and lenders want this one rather than a bare boundary.',
    deliverable: 'A signed and sealed plat showing the boundary and every improvement, with distances from the lines; pins on the ground; a note on any encroachment.',
    field: 'Adds time over a plain boundary survey; more structures and fences mean more to locate. Usually still one field day for a house lot.',
    typical: '$600 to $3,500 and up',
  },
  {
    id: 'alta', name: 'ALTA/NSPS land title survey',
    what: 'The most detailed survey there is: boundary, improvements, easements from the title commitment, encroachments, access, flood zone, utilities, and whatever items from the ALTA Table A the lender or title company asks for, all to the national ALTA/NSPS standard. Texas TSPS category surveys are the state equivalent.',
    when: 'Commercial purchases, commercial loans, and anything a title company requires it for.',
    deliverable: 'The ALTA plat, certified to the buyer, lender, and title company, with the Table A items they selected.',
    field: 'One to several field days depending on the size and what is on the property; the office and title review is the larger part of the job.',
    typical: '$2,000 to $10,000 and up',
  },
  {
    id: 'topographic', name: 'Topographic survey',
    what: 'Maps the shape of the ground: elevations, contours, drainage, trees, and existing features, so an engineer or architect can design on it.',
    when: 'Before designing a building, a drainage plan, a pond, a road, or a site development.',
    deliverable: 'A contour map and a digital file (CAD) the designer can work from.',
    field: 'Depends on acreage and how much detail is needed; a house lot is part of a day, a development site can be several days.',
    typical: '$600 to $5,000 and up',
  },
  {
    id: 'elevation', name: 'Elevation certificate',
    what: 'The FEMA form documenting the elevation of a structure and the ground around it against the mapped flood zone.',
    when: 'Flood insurance rating, a LOMA to remove a property from the flood zone, or building in a flood-prone area.',
    deliverable: 'The completed and sealed FEMA Elevation Certificate.',
    field: 'Usually an hour or two on site.',
    typical: '$350 to $600',
  },
  {
    id: 'construction', name: 'Construction staking',
    what: 'The crew sets stakes and control points from the engineer’s or architect’s plans so foundations, roads, and utilities are built exactly where designed.',
    when: 'Right before and during construction, often in more than one visit as the work progresses.',
    deliverable: 'The stakes and offsets in the ground and a cut sheet for the contractor.',
    field: 'From part of a day for a house pad to repeat visits on a larger site.',
    typical: '$300 to $2,000 and up',
  },
  {
    id: 'subdivision', name: 'Subdivision platting',
    what: 'Divides a tract into lots with roads, easements, and dedications, and prepares the plat that the city or county reviews and records.',
    when: 'Splitting land to sell lots, creating a family partition, or developing.',
    deliverable: 'The recorded plat and the lot descriptions; often done alongside a boundary and topographic survey.',
    field: 'Days of field work plus weeks of drafting and review with the city or county; the approval process sets the timeline.',
    typical: '$2,500 to $15,000 and up',
  },
  {
    id: 'mortgage', name: 'Mortgage or loan survey',
    what: 'A lighter survey a lender accepts for a residential purchase or refinance, showing the boundary and the improvements.',
    when: 'When the title company or lender asks for one for a residential loan.',
    deliverable: 'The sealed plat the lender and title company need for closing.',
    field: 'A few hours for a house lot.',
    typical: '$350 to $800',
  },
  {
    id: 'asbuilt', name: 'As-built survey',
    what: 'Measures what was actually built and compares it to the plans.',
    when: 'After construction, for permits, compliance, or record drawings.',
    deliverable: 'The as-built drawing.',
    field: 'Part of a day to a full day depending on the site.',
    typical: '$400 to $1,500 and up',
  },
  {
    id: 'easement', name: 'Route or easement survey',
    what: 'Surveys a corridor, such as a pipeline, power line, access road, or utility easement, and describes it.',
    when: 'Granting or buying an easement, utility work, or an access dispute.',
    deliverable: 'The easement plat and the written description for the recorded document.',
    field: 'Depends on the length of the corridor.',
    typical: '$500 to $5,000 and up',
  },
  {
    id: 'legal_description', name: 'Legal description',
    what: 'Writes or verifies the metes-and-bounds description of a tract for a deed or other recorded document.',
    when: 'Deeds, easements, and corrections to old descriptions.',
    deliverable: 'The description, sealed, usually with a sketch.',
    field: 'Often little or no field work if a good survey exists; otherwise done with a boundary survey.',
    typical: '$250 to $800',
  },
];

/** How a job goes, start to finish. Straight from the owner (2026-09-11). */
export const PROCESS: string[] = [
  `Consultation: ${OWNER_NAME} talks the job through with the customer, looks at the property records, and asks what the survey is for and when it is needed.`,
  `Quote: ${OWNER_NAME} sends a written quote. Any number given on the phone before that is a rough estimate from the online calculator, not the quote.`,
  'Acceptance: when the customer accepts the quote, the job is scheduled.',
  'Research and planning: the RPLS researches the deed, adjoining deeds, prior surveys, and county records, and plans the field work.',
  'Field work: a field crew comes to the property. Depending on the size and conditions of the property, the number and condition of boundary corners, how many improvements there are, and the type of survey, the field work takes one or more days.',
  'Processing: the field data comes back to the office and is processed and checked by the RPLS.',
  'Deliverables: the plat, drawings, letters, descriptions, or certificates the customer needs are prepared and delivered on or before the due date.',
];

export const PRICE_CHANGES = [
  'The quoted price can change if conditions on the property turn out to be more adverse than understood when the quote was written (heavier brush, corners that cannot be found, access problems), or if the requirements for the survey change.',
  'Rush jobs usually carry an extra fee (about 25 percent), and long-distance jobs usually carry a travel fee.',
  'The cost factors are the same ones the website calculator uses: property size and shape, distance from Belton, vegetation, terrain, water features, record research, corner markers, improvements, and timeline.',
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
  founded: `${BUSINESS_NAME} is a family land surveying firm in Belton, Texas, owned and operated by a Registered Professional Land Surveyor, with more than fifteen years of professional surveying experience in Central Texas.`,
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

/** What's on the website, so the receptionist can send people to the right page. */
export const WEBSITE = {
  home: 'starr surveying dot com',
  requestForm: 'the request form on the contact page: name, property, what you need, attachments; it goes straight to Hank and Jacob',
  calculator: 'the instant estimate calculator on the pricing page, free and no signup',
  resources: 'the resources page: what each survey type is, how to find an old survey, and common questions',
  payInvoice: 'pay an invoice online from the services page or the link in the invoice email',
};

/** The knowledge block for the system prompt. Written to be read by a model, not a person. */
export function knowledgeText(): string {
  return [
    `FIRM: ${BUSINESS_NAME} (legal name Starr Technical Services, Inc.), ${OFFICE_STREET}, ${OFFICE_CITY}, ${OFFICE_REGION}. Phone ${PHONE_DISPLAY}. Email ${EMAIL}. Website ${SITE_HOST} (request form and instant estimate calculator). Office hours ${hoursSentence()}; field crews work outside those hours.`,
    ABOUT.founded + ' ' + ABOUT.team + ' ' + ABOUT.equipment,
    `SERVICES (for each: what the work is; when someone needs it; what they receive; how long the field work runs; the typical price range on the website):\n` +
      SERVICES.map((s) => `- ${s.name}: ${s.what} When: ${s.when} You receive: ${s.deliverable} Field time: ${s.field} Typically ${s.typical}.`).join('\n'),
    `HOW A JOB GOES, IN ORDER:\n` + PROCESS.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    `PRICE CHANGES AND FEES: ${PRICE_CHANGES.join(' ')}`,
    `WEBSITE (${WEBSITE.home}): ${WEBSITE.requestForm}; ${WEBSITE.calculator}; ${WEBSITE.resources}; ${WEBSITE.payInvoice}.`,
    `HOURS (the same hours shown on Google): ${hoursSentence()}. Field crews work outside those hours; ${OWNER_NAME} returns calls as soon as he can, usually the same or next business day.`,
    `SERVICE AREA: primarily within ${SERVICE_AREA.radiusMiles} miles of Belton, including ${SERVICE_AREA.counties.join(', ')} counties. ${SERVICE_AREA.beyond}`,
    `TIMING: ${TIMING.residential} ${TIMING.larger} ${TIMING.rush} ${TIMING.quoteTurnaround}`,
    `PRICING: ${PRICING_RULES.drivers} Field crew time is billed at $${PRICING_RULES.fieldRatePerHour} an hour and travel at $${PRICING_RULES.travelPerMile.toFixed(2)} a mile one way from Belton in the calculator. Rush is plus 25 percent. ${PRICING_RULES.disclaimer}`,
    `FAQ:\n` + FAQ.map((f) => `- Q: ${f.q} A: ${f.a}`).join('\n'),
  ].join('\n\n');
}
