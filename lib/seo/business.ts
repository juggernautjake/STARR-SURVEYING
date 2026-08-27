// lib/seo/business.ts — the business's identity, in one place, and the JSON-LD Google reads.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────────
//
// On 2026-08-25 this site was found to be spelling its own domain three different ways at once: the
// live host, a bare-domain sitemap that 301'd to it, and an `og:url` pointing at a domain that does
// not resolve. Each was correct where it was written and wrong against the others, because there was
// nowhere for them to be written ONCE.
//
// The same failure is waiting for the name, address and phone number. NAP consistency is a real local
// search ranking input — Google reconciles the site against the Google Business Profile against the
// directories — and this site currently states its address in `ServiceAreaMap.tsx`, its phone in
// `Footer.tsx`, `contact/page.tsx` and eleven `tel:` links, and its hours in prose on the contact
// page. Nothing checks them against each other.
//
// So every fact Google is told about this business is declared here, and the pages import it.
//
// ── EVERY VALUE BELOW IS A PUBLIC CLAIM ─────────────────────────────────────────────────────────
//
// Structured data is not decoration; it is a machine-readable assertion that can appear in a
// knowledge panel and be used to judge whether this business is what it says it is. Do not put a
// plausible value here. If a fact is not known, omit the property — a missing property costs nothing,
// and a wrong one is published.

export const SITE_URL = 'https://www.starr-surveying.com';

/** Trading name — what customers search for and what every page says. */
export const BUSINESS_NAME = 'Starr Surveying';

/** The legal entity behind the trade name. Stated on /privacy: "Starr Surveying is the trade name of
 *  Starr Technical Services Inc." `legalName` beside `name` is how schema.org expresses exactly that,
 *  and it is what lets Google match this site to filings and licences in the corporate name. */
export const LEGAL_NAME = 'Starr Technical Services Inc.';

export const PHONE_DISPLAY = '(936) 662-0077';
/** E.164, which is the only format `telephone` should carry: it is unambiguous about country. */
export const PHONE_E164 = '+1-936-662-0077';
export const EMAIL = 'info@starr-surveying.com';

// ── OFFICE ──────────────────────────────────────────────────────────────────────────────────────
export const OFFICE_STREET = '3779 W FM 436';
export const OFFICE_CITY = 'Belton';
export const OFFICE_REGION = 'TX';
export const OFFICE_POSTAL_CODE = '76513';
export const OFFICE_COUNTRY = 'US';

/** Display forms, kept here so the map, the footer and the schema cannot drift apart. */
export const OFFICE_ADDRESS_LINE1 = OFFICE_STREET;
export const OFFICE_ADDRESS_LINE2 = `${OFFICE_CITY}, ${OFFICE_REGION} ${OFFICE_POSTAL_CODE}`;
export const OFFICE_ADDRESS = `${OFFICE_ADDRESS_LINE1}, ${OFFICE_ADDRESS_LINE2}`;

/** Surveyed coordinates of the office, as used by the service-area map. */
export const OFFICE_LAT = 30.99752823122663;
export const OFFICE_LNG = -97.40083553223793;

export const SERVICE_RADIUS_MILES = 150;
export const SERVICE_RADIUS_METERS = Math.round(SERVICE_RADIUS_MILES * 1609.34);

/** RPLS licence, stated on /credentials. A licence number in the structured data is the single
 *  strongest trust signal a regulated trade can emit, because it is checkable against TBPELS. */
export const RPLS_LICENSE_NUMBER = '6706';
export const RPLS_LICENSE_ISSUED = '2017-12-15';

// ── HOURS ───────────────────────────────────────────────────────────────────────────────────────
//
// SATURDAY IS DELIBERATELY ABSENT. The contact page says "By Appointment", which schema.org has no way
// to express: any `openingHoursSpecification` for Saturday would be a claim to be open at stated times,
// and Google may print those times in a knowledge panel. Someone driving to a closed office on the
// strength of a wrong opening hour is a worse outcome than an unlisted Saturday.
//
// These hours must match the Google Business Profile. When they disagree, the profile is what shows in
// the map pack — but the disagreement itself is a quality signal against the site.
export const OPENING_HOURS = [
  { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' },
] as const;

// OPENS AT 9, NOT 8 — corrected 2026-08-26 by the owner.
//
// The contact page had said 8:00 AM for as long as it has existed, and the Google Business Profile
// said 9:00. Confirmed with the owner: NINE is right, and the website was the wrong one. So this is a
// correction to the site, not to Google.
//
// It is worth noting what the wrong version cost. Google cross-checks a business against its own
// listing, and the two disagreeing is a quality signal against the site — but the real damage is
// simpler: for years the site invited people to ring an office an hour before anyone was there.
//
// `/contact` now renders this constant instead of its own hard-coded string, so the page a customer
// reads and the hours a crawler reads cannot disagree again.

/** How the weekday range is written for people, derived from the same values the crawler is given. */
export function openingHoursDisplay(): { days: string; time: string } {
  const h = OPENING_HOURS[0];
  const human = (t: string): string => {
    const [rawH, m] = t.split(':').map(Number);
    const suffix = rawH >= 12 ? 'PM' : 'AM';
    const hour12 = rawH % 12 === 0 ? 12 : rawH % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  return {
    days: `${h.days[0]} - ${h.days[h.days.length - 1]}`,
    time: `${human(h.opens)} - ${human(h.closes)}`,
  };
}

// ── WHAT THEY SELL ──────────────────────────────────────────────────────────────────────────────
//
// Mirrors the cards on /services and /pricing. This is the property that lets Google answer "who does
// elevation certificates near Belton" with this business rather than only "who is a surveyor".
export interface ServiceOffering {
  name: string;
  description: string;
}

export const SERVICES: ServiceOffering[] = [
  { name: 'Boundary Survey', description: 'Establishes and verifies property lines and corners for residential, commercial and rural tracts.' },
  { name: 'ALTA/NSPS Land Title Survey', description: 'Comprehensive commercial survey meeting national ALTA/NSPS standards, as required by most lenders.' },
  { name: 'Topographic Survey', description: 'Maps terrain contours, elevations and site features for planning, design and construction.' },
  { name: 'Elevation Certificate (FEMA)', description: 'Official FEMA elevation documentation for flood insurance rating and LOMA applications.' },
  { name: 'Construction Staking', description: 'Precise layout stakes and control for buildings, roads and utilities.' },
  { name: 'Subdivision Platting', description: 'Divides land into lots with roads and easements, and prepares the plat for recording.' },
  { name: 'Mortgage/Loan Survey', description: 'Lender-required survey for property purchase, showing boundaries and improvements.' },
  { name: 'As-Built Survey', description: 'Documents completed construction for compliance verification and record drawings.' },
  { name: 'Route/Easement Survey', description: 'Surveys linear corridors for utilities, pipelines and access easements.' },
  { name: 'Legal Description', description: 'Prepares or verifies written legal descriptions for deeds and property records.' },
  { name: 'GPS/GNSS Surveying', description: 'High-precision satellite positioning for large areas and complex projects.' },
  { name: 'Deed Research', description: 'Property and record research for title work and boundary resolution.' },
];

// ── SERVICE AREA ────────────────────────────────────────────────────────────────────────────────
//
// The counties inside the ~150-mile radius of the Belton office. `/service-area` renders this same
// array, so the page a visitor reads and the area Google is told about cannot disagree.
export const SERVICE_AREA_COUNTIES: string[] = [
  'Austin County',
  'Bastrop County',
  'Bell County',
  'Bexar County',
  'Bosque County',
  'Brazos County',
  'Brown County',
  'Burnet County',
  'Caldwell County',
  'Comanche County',
  'Comal County',
  'Coryell County',
  'Dallas County',
  'Denton County',
  'Ellis County',
  'Erath County',
  'Falls County',
  'Fayette County',
  'Fort Bend County',
  'Freestone County',
  'Grimes County',
  'Guadalupe County',
  'Hamilton County',
  'Harris County',
  'Hays County',
  'Hill County',
  'Johnson County',
  'Lampasas County',
  'Lee County',
  'Leon County',
  'Limestone County',
  'Madison County',
  'McLennan County',
  'Milam County',
  'Mills County',
  'Montgomery County',
  'Navarro County',
  'Robertson County',
  'San Jacinto County',
  'San Saba County',
  'Tarrant County',
  'Travis County',
  'Trinity County',
  'Walker County',
  'Waller County',
  'Williamson County',
];

/** Stable node ids. JSON-LD nodes reference each other by `@id`, and a crawler that sees the same
 *  `@id` on every page understands it as ONE business described repeatedly, not many businesses. */
export const BUSINESS_ID = `${SITE_URL}/#business`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

type JsonLd = Record<string, unknown>;

/**
 * The `ProfessionalService` node — a LocalBusiness subtype, which is the correct one for a licensed
 * trade practice rather than the generic `LocalBusiness`.
 */
export function businessNode(): JsonLd {
  return {
    '@type': ['ProfessionalService', 'LocalBusiness'],
    '@id': BUSINESS_ID,
    name: BUSINESS_NAME,
    legalName: LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logos/starr_surveying_logo_aug_2024_alt.png`,
    image: `${SITE_URL}/og-image.png`,
    description:
      'Registered Professional Land Surveyor serving Central Texas from Belton. Boundary surveys, ' +
      'topographic surveys, ALTA/NSPS land title surveys, construction staking, elevation certificates ' +
      'and subdivision platting.',
    telephone: PHONE_E164,
    email: EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: OFFICE_STREET,
      addressLocality: OFFICE_CITY,
      addressRegion: OFFICE_REGION,
      postalCode: OFFICE_POSTAL_CODE,
      addressCountry: OFFICE_COUNTRY,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: OFFICE_LAT,
      longitude: OFFICE_LNG,
    },
    hasMap: `https://www.google.com/maps/search/?api=1&query=${OFFICE_LAT},${OFFICE_LNG}`,
    // `$$` rather than the real ranges from /pricing. The ranges there are explicitly labelled rough
    // estimates that vary by acreage; publishing "$250–$15,000" as a machine-readable price invites a
    // search result that quotes a number nobody agreed to.
    priceRange: '$$',
    currenciesAccepted: 'USD',
    openingHoursSpecification: OPENING_HOURS.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [...h.days],
      opens: h.opens,
      closes: h.closes,
    })),
    // Both the radius the business actually works within AND the named counties. The circle is what a
    // geo-aware crawler can reason about; the county names are what people type.
    areaServed: [
      {
        '@type': 'GeoCircle',
        geoMidpoint: { '@type': 'GeoCoordinates', latitude: OFFICE_LAT, longitude: OFFICE_LNG },
        geoRadius: String(SERVICE_RADIUS_METERS),
      },
      ...SERVICE_AREA_COUNTIES.map((county) => ({
        '@type': 'AdministrativeArea',
        name: `${county}, Texas`,
      })),
    ],
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'Professional License',
      name: `Registered Professional Land Surveyor (RPLS) #${RPLS_LICENSE_NUMBER}`,
      recognizedBy: {
        '@type': 'GovernmentOrganization',
        name: 'Texas Board of Professional Engineers and Land Surveyors',
        alternateName: 'TBPELS',
        url: 'https://pels.texas.gov/',
      },
    },
    knowsAbout: SERVICES.map((s) => s.name),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Land Surveying Services',
      itemListElement: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: s.name,
          description: s.description,
          serviceType: s.name,
          provider: { '@id': BUSINESS_ID },
        },
      })),
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: PHONE_E164,
      email: EMAIL,
      areaServed: 'US-TX',
      availableLanguage: 'English',
    },
    // NO `sameAs`. It lists the business's OTHER profiles — Google Business Profile, Facebook, LinkedIn,
    // a BBB listing — and is one of the more valuable properties here, because it is how Google ties
    // this site to the entity it already knows. There are no social links anywhere on this site to read
    // them from, and inventing URLs would publish claims to profiles that may not exist. Add them here
    // the moment the real URLs are known.
  };
}

/** The site itself, so a crawler has a named `WebSite` node to hang pages off, published by the
 *  business above rather than by an unnamed party. */
export function websiteNode(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: BUSINESS_NAME,
    publisher: { '@id': BUSINESS_ID },
    inLanguage: 'en-US',
  };
}

/**
 * The complete document emitted into every page.
 *
 * One `@graph` rather than several separate `<script>` blocks: the nodes reference each other by
 * `@id`, and a single graph is what makes those references resolve.
 */
export function businessJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [businessNode(), websiteNode()],
  };
}
