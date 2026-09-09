// lib/research/intake-info.ts — the kinds of "additional information" a person can hand a research run,
// each with its own field shape and an ENFORCED format.
//
// ── WHY A CATALOGUE (owner, 2026-09-09) ──────────────────────────────────────────────────────────
//
// "The '+Add Info' button will then prompt the user to select what kind of info they want to add. …
//  Each option should render a field that is designed specifically for that option, with enforced
//  formatting. The input would need to match a particular syntax for the kind of info. The
//  volume/page field would actually be two fields with a '/' between them."
//
// A free-text "notes" box takes anything and the run has to guess what it was. A category with a
// syntax means an instrument number arrives as an instrument number — the shape the clerk's index is
// searched on — and a volume/page arrives as two numbers, which is the only form the advanced search
// accepts. Every entry here says what it is, what it looks like, how it is cleaned as it is typed,
// and what makes it invalid. The modal renders from this table; nothing about a category is decided
// in the component.
//
// Pure. No React, no DOM: the rules are unit-tested on strings.

export type InfoCategoryId =
  | 'owner_current'
  | 'owner_previous'
  | 'instrument'
  | 'volume_page'
  | 'cabinet_slide'
  | 'subdivision'
  | 'abstract'
  | 'geo_id'
  | 'legal_description'
  | 'acreage'
  | 'prior_address'
  | 'recorded_date'
  | 'coordinates'
  | 'other';

export interface InfoFieldSpec {
  key: string;
  label: string;
  placeholder: string;
  /** Relative width in the line — the component maps these to CSS classes. */
  width: 'xs' | 'sm' | 'md' | 'lg' | 'full';
  inputMode?: 'text' | 'numeric' | 'decimal';
  type?: 'text' | 'date';
  maxLength: number;
  /** May be left blank when another field in the line carries the value. */
  optional?: boolean;
  /** Applied on every keystroke: the field can only ever hold characters the format allows. */
  sanitize: (raw: string) => string;
  /** The reason a non-empty value is wrong, or null when it is acceptable. */
  validate: (value: string) => string | null;
}

export interface InfoCategorySpec {
  id: InfoCategoryId;
  label: string;
  /** One line under the chip in the picker. */
  hint: string;
  /** Shown in the section's info popover. */
  help: string;
  example: string;
  fields: InfoFieldSpec[];
  /** Text drawn between the fields — "/" for volume/page, cabinet/slide. */
  joiner?: string;
}

export interface IntakeInfoLine {
  key: string;
  category: InfoCategoryId;
  values: Record<string, string>;
}

// ── Sanitizers ────────────────────────────────────────────────────────────

const collapseSpaces = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
const digitsOnly = (s: string) => s.replace(/\D/g, '');
const upperAlnumDash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, '');
const upperAlnumDotDash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
const nameChars = (s: string) => collapseSpaces(s.replace(/[^A-Za-z0-9 .,&'’\-/()]/g, ''));
const decimalChars = (s: string) => {
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  // one leading minus, one dot
  const neg = cleaned.startsWith('-') ? '-' : '';
  const body = cleaned.replace(/-/g, '');
  const [whole, ...rest] = body.split('.');
  return neg + (rest.length ? `${whole}.${rest.join('')}` : whole);
};
const plainText = (s: string) => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

// ── Validators ────────────────────────────────────────────────────────────

const personName = (v: string): string | null => {
  if (v.trim().length < 2) return 'Give at least two characters.';
  if (!/[A-Za-z]/.test(v)) return 'A name needs letters in it.';
  return null;
};

const instrumentNumber = (v: string): string | null => {
  if (v.length < 4 || v.length > 20) return 'Instrument numbers are 4–20 characters.';
  if ((v.match(/\d/g) ?? []).length < 4) return 'Needs at least four digits, as the county writes it (2019-12345 or 2022074210).';
  if (!/^[A-Z]{0,4}-?\d[\dA-Z-]*$/.test(v)) return 'Letters may only lead (OPR-2019-1234); the rest is digits and dashes.';
  return null;
};

const volumeNumber = (v: string): string | null =>
  /^\d{1,6}$/.test(v) ? null : 'Volume is a number (1–6 digits).';

const pageNumber = (v: string): string | null =>
  /^\d{1,6}[A-Z]?$/.test(v) ? null : 'Page is a number, with at most one trailing letter (385 or 385A).';

const cabinet = (v: string): string | null =>
  /^[A-Z0-9]{1,4}$/.test(v) ? null : 'Cabinet is a letter or a short number (C, 2, AA).';

const slide = (v: string): string | null =>
  /^\d{1,5}(?:-?[A-Z]{1,4})?$/.test(v) ? null : 'Slide is a number with an optional suffix (166, 166-A, 166-APR).';

const shortCode = (what: string) => (v: string): string | null =>
  /^[A-Z0-9-]{1,10}$/.test(v) ? null : `${what} is letters, digits or dashes (up to 10).`;

const abstractNumber = (v: string): string | null =>
  /^\d{1,6}$/.test(v) ? null : 'The abstract number alone — 38, not A-38.';

const geoId = (v: string): string | null =>
  /^[A-Z0-9][A-Z0-9.\-]{2,40}$/.test(v) ? null : 'Letters, digits, dots and dashes, as the appraisal district prints it (S09200-001-01-00, R123456).';

const acreage = (v: string): string | null => {
  if (!/^\d{1,6}(?:\.\d{1,4})?$/.test(v)) return 'Acres as a number with up to four decimals (2.3, 0.4577).';
  if (Number(v) <= 0) return 'Acreage must be more than zero.';
  return null;
};

const minLen = (n: number, what: string) => (v: string): string | null =>
  v.trim().length >= n ? null : `${what} needs at least ${n} characters.`;

const recordedDate = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'A date as YYYY-MM-DD.';
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'That is not a real date.';
  const year = Number(v.slice(0, 4));
  if (year < 1800) return 'Texas records do not go back before 1800.';
  if (d.getTime() > Date.now() + 86_400_000) return 'A recording date cannot be in the future.';
  return null;
};

const latitude = (v: string): string | null => {
  if (!/^-?\d{1,2}(?:\.\d{1,8})?$/.test(v)) return 'Latitude in decimal degrees (30.9873).';
  const n = Number(v);
  return n >= -90 && n <= 90 ? null : 'Latitude runs from -90 to 90.';
};

const longitude = (v: string): string | null => {
  if (!/^-?\d{1,3}(?:\.\d{1,8})?$/.test(v)) return 'Longitude in decimal degrees (-97.3428).';
  const n = Number(v);
  return n >= -180 && n <= 180 ? null : 'Longitude runs from -180 to 180.';
};

// ── The catalogue ─────────────────────────────────────────────────────────

export const INFO_CATEGORIES: InfoCategorySpec[] = [
  {
    id: 'owner_current',
    label: 'Current owner',
    hint: 'The name on the deed today',
    help: 'As the appraisal district records it — surname first is fine. The clerk index is searched by grantor and grantee under this name; it is how the deed that conveyed the property is found.',
    example: 'GOODNIGHT, W GENE ETUX',
    fields: [{ key: 'name', label: 'Owner name', placeholder: 'SMITH, JOHN ETUX MARY', width: 'full', maxLength: 120, sanitize: nameChars, validate: personName }],
  },
  {
    id: 'owner_previous',
    label: 'Previous owner',
    hint: 'A grantor further back in the chain',
    help: 'Someone who owned the property before — a seller, an estate, a company. Searching the clerk under an earlier name reaches older deeds and the plats recorded with them.',
    example: 'FERRELL, GEORGE W',
    fields: [{ key: 'name', label: 'Previous owner name', placeholder: 'FERRELL, GEORGE W', width: 'full', maxLength: 120, sanitize: nameChars, validate: personName }],
  },
  {
    id: 'instrument',
    label: 'Instrument number',
    hint: 'A deed or document number',
    help: 'The number the county clerk assigned when the document was recorded. Typed exactly as the county writes it — 2019-12345 in some counties, 2022074210 in others. The deed search starts from this document instead of having to find one first.',
    example: '2022074210',
    fields: [{ key: 'instrument', label: 'Instrument number', placeholder: '2022074210', width: 'md', maxLength: 20, sanitize: upperAlnumDash, validate: instrumentNumber }],
  },
  {
    id: 'volume_page',
    label: 'Volume / Page',
    hint: 'Where an older deed is recorded',
    help: 'Deeds recorded before instrument numbers are cited by the book they were copied into and the page they start on. Two numbers — the volume, then the page. The clerk\'s advanced search resolves them to the document.',
    example: '2466 / 385',
    joiner: '/',
    fields: [
      { key: 'volume', label: 'Volume', placeholder: 'Vol', width: 'xs', inputMode: 'numeric', maxLength: 6, sanitize: digitsOnly, validate: volumeNumber },
      { key: 'page', label: 'Page', placeholder: 'Page', width: 'xs', maxLength: 7, sanitize: upperAlnumDash, validate: pageNumber },
    ],
  },
  {
    id: 'cabinet_slide',
    label: 'Plat cabinet / slide',
    hint: 'Where a plat is filed',
    help: 'Subdivision plats are filed in cabinets and slides rather than volumes and pages. The cabinet is a letter or short number; the slide is a number, sometimes with a suffix.',
    example: 'C / 166-A',
    joiner: '/',
    fields: [
      { key: 'cabinet', label: 'Cabinet', placeholder: 'Cab', width: 'xs', maxLength: 4, sanitize: upperAlnumDash, validate: cabinet },
      { key: 'slide', label: 'Slide', placeholder: 'Slide', width: 'sm', maxLength: 10, sanitize: upperAlnumDash, validate: slide },
    ],
  },
  {
    id: 'subdivision',
    label: 'Subdivision, lot, block',
    hint: 'A platted lot',
    help: 'The subdivision name as it appears on the plat, and the lot and block if you have them. This is how the plat repository and the clerk\'s plat records are searched, and it names the neighbours.',
    example: 'FREEMAN, lot 4, block 1',
    fields: [
      { key: 'name', label: 'Subdivision', placeholder: 'W S CHAPMAN ADDITION', width: 'lg', maxLength: 100, sanitize: nameChars, validate: minLen(2, 'Subdivision') },
      { key: 'lot', label: 'Lot', placeholder: 'Lot', width: 'xs', maxLength: 10, optional: true, sanitize: upperAlnumDash, validate: shortCode('Lot') },
      { key: 'block', label: 'Block', placeholder: 'Block', width: 'xs', maxLength: 10, optional: true, sanitize: upperAlnumDash, validate: shortCode('Block') },
    ],
  },
  {
    id: 'abstract',
    label: 'Abstract / survey',
    hint: 'An original land-grant survey',
    help: 'Rural land is described by the original survey it lies in — an abstract number and the survey\'s name (the original grantee). The number alone is enough; the name helps confirm it.',
    example: 'A-38, Daniel Monroe Survey',
    fields: [
      { key: 'number', label: 'Abstract no.', placeholder: '38', width: 'xs', inputMode: 'numeric', maxLength: 6, sanitize: digitsOnly, validate: abstractNumber },
      { key: 'survey', label: 'Survey name', placeholder: 'DANIEL MONROE', width: 'lg', maxLength: 100, optional: true, sanitize: nameChars, validate: minLen(2, 'Survey name') },
    ],
  },
  {
    id: 'geo_id',
    label: 'Geo ID / account no.',
    hint: 'The appraisal district\'s other number',
    help: 'Many appraisal districts print a second identifier beside the Property ID — a geographic ID or account number that encodes the subdivision and lot. Either finds the parcel; this one survives a renumbering.',
    example: 'S09200-001-01-00',
    fields: [{ key: 'id', label: 'Geo ID', placeholder: 'S09200-001-01-00', width: 'md', maxLength: 40, sanitize: upperAlnumDotDash, validate: geoId }],
  },
  {
    id: 'legal_description',
    label: 'Legal description',
    hint: 'The description from a deed or tax record',
    help: 'The property as a deed describes it — a lot and block, an abstract and acreage, or the opening of a metes-and-bounds call. Given to the AI to match documents against; it is not searched on directly.',
    example: 'S09200 FREEMAN BLK 1 W PT OF',
    fields: [{ key: 'text', label: 'Legal description', placeholder: 'A0430 DE PENA, J.A., .465 ACRES', width: 'full', maxLength: 500, sanitize: plainText, validate: minLen(5, 'A legal description') }],
  },
  {
    id: 'acreage',
    label: 'Acreage',
    hint: 'How much land',
    help: 'The acreage the seller, the deed or the tax record claims. Used to tell the right tract from a neighbour of the same name and to flag a deed whose acreage disagrees.',
    example: '2.3',
    fields: [{ key: 'acres', label: 'Acres', placeholder: '2.3', width: 'xs', inputMode: 'decimal', maxLength: 11, sanitize: decimalChars, validate: acreage }],
  },
  {
    id: 'prior_address',
    label: 'Previous address',
    hint: 'How the property used to be addressed',
    help: 'Rural routes become street addresses, roads get renamed, and an older deed or plat may carry the old one. A second address widens the appraisal-district search without changing the main one.',
    example: 'RR 2 BOX 114',
    fields: [{ key: 'address', label: 'Previous address', placeholder: 'RR 2 BOX 114, BELTON', width: 'full', maxLength: 160, sanitize: plainText, validate: minLen(5, 'An address') }],
  },
  {
    id: 'recorded_date',
    label: 'Recording date',
    hint: 'When a deed was recorded',
    help: 'The date a document was recorded at the clerk. Narrows a clerk search to the right range when the number is unknown.',
    example: '2009-03-17',
    fields: [{ key: 'date', label: 'Recorded on', placeholder: 'YYYY-MM-DD', width: 'sm', type: 'date', maxLength: 10, sanitize: (s) => s.slice(0, 10), validate: recordedDate }],
  },
  {
    id: 'coordinates',
    label: 'Coordinates',
    hint: 'A latitude and longitude on the tract',
    help: 'A point inside the property in decimal degrees — from a phone, a GPS or a map click. The parcel layer is queried at the point, which finds a parcel that has no street address.',
    example: '30.9873, -97.3428',
    joiner: ',',
    fields: [
      { key: 'lat', label: 'Latitude', placeholder: '30.9873', width: 'sm', inputMode: 'decimal', maxLength: 12, sanitize: decimalChars, validate: latitude },
      { key: 'lng', label: 'Longitude', placeholder: '-97.3428', width: 'sm', inputMode: 'decimal', maxLength: 13, sanitize: decimalChars, validate: longitude },
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    hint: 'Anything that does not fit above',
    help: 'A labelled fact of any other kind — a title company file number, a well permit, a plat name you are unsure of. It reaches the AI with its label so it can be weighed.',
    example: 'Title file: 24-001873',
    fields: [
      { key: 'label', label: 'What it is', placeholder: 'Title file no.', width: 'sm', maxLength: 40, sanitize: plainText, validate: minLen(2, 'A label') },
      { key: 'value', label: 'Value', placeholder: '24-001873', width: 'lg', maxLength: 300, sanitize: plainText, validate: minLen(1, 'A value') },
    ],
  },
];

export const INFO_CATEGORY_BY_ID: Record<InfoCategoryId, InfoCategorySpec> = Object.fromEntries(
  INFO_CATEGORIES.map((c) => [c.id, c]),
) as Record<InfoCategoryId, InfoCategorySpec>;

// ── Line validation ───────────────────────────────────────────────────────

export interface LineCheck {
  /** Every field acceptable and at least one required field filled. */
  ok: boolean;
  /** Nothing typed on the line yet — neither valid nor an error; dropped at submit. */
  empty: boolean;
  /** Per-field reasons, only for fields that are wrong. */
  errors: Record<string, string>;
}

export function checkLine(line: IntakeInfoLine): LineCheck {
  const spec = INFO_CATEGORY_BY_ID[line.category];
  const errors: Record<string, string> = {};
  let anyFilled = false;
  for (const f of spec.fields) {
    const v = (line.values[f.key] ?? '').trim();
    if (!v) {
      if (!f.optional) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    anyFilled = true;
    const reason = f.validate(v);
    if (reason) errors[f.key] = reason;
  }
  if (!anyFilled) return { ok: false, empty: true, errors: {} };
  return { ok: Object.keys(errors).length === 0, empty: false, errors };
}

/** A line as one string, for summaries and for the "other" bucket. */
export function describeLine(line: IntakeInfoLine): string {
  const spec = INFO_CATEGORY_BY_ID[line.category];
  const parts = spec.fields.map((f) => (line.values[f.key] ?? '').trim()).filter(Boolean);
  return parts.join(spec.joiner ? ` ${spec.joiner} ` : ', ');
}

// ── The structured payload the run receives ───────────────────────────────

/**
 * A SUPERSET of the shape the run has read since plan H2 (`instrumentNumbers`, `ownerNames`,
 * `volumePages`, `cabinetSlides`) — those four keep their names and shapes so nothing downstream
 * changes; the new kinds are added beside them. Stored on `research_projects.analysis_metadata
 * .supplemental` and handed to the worker unchanged when a run starts.
 */
export interface IntakeSupplemental {
  instrumentNumbers: string[];
  ownerNames: string[];
  volumePages: Array<{ volume: string; page: string }>;
  cabinetSlides: Array<{ cabinet: string; slide: string }>;
  priorOwnerNames: string[];
  subdivisions: Array<{ name: string; lot?: string; block?: string }>;
  abstracts: Array<{ number: string; survey?: string }>;
  geoIds: string[];
  legalDescriptions: string[];
  acreages: number[];
  priorAddresses: string[];
  recordedDates: string[];
  coordinates: Array<{ lat: number; lng: number }>;
  other: Array<{ label: string; value: string }>;
}

export function emptySupplemental(): IntakeSupplemental {
  return {
    instrumentNumbers: [], ownerNames: [], volumePages: [], cabinetSlides: [],
    priorOwnerNames: [], subdivisions: [], abstracts: [], geoIds: [], legalDescriptions: [],
    acreages: [], priorAddresses: [], recordedDates: [], coordinates: [], other: [],
  };
}

/** Fold the lines into the payload. Empty lines are dropped; invalid lines are dropped too — the
 *  form refuses to submit while one exists, so this only ever sees them from a caller that skipped
 *  the check, and passing a malformed value to a clerk search is worse than passing nothing. */
export function linesToSupplemental(lines: IntakeInfoLine[]): IntakeSupplemental {
  const out = emptySupplemental();
  for (const l of lines) {
    const check = checkLine(l);
    if (!check.ok) continue;
    const v = (k: string) => (l.values[k] ?? '').trim();
    switch (l.category) {
      case 'owner_current': out.ownerNames.push(v('name')); break;
      case 'owner_previous': out.priorOwnerNames.push(v('name')); break;
      case 'instrument': out.instrumentNumbers.push(v('instrument')); break;
      case 'volume_page': out.volumePages.push({ volume: v('volume'), page: v('page') }); break;
      case 'cabinet_slide': out.cabinetSlides.push({ cabinet: v('cabinet'), slide: v('slide') }); break;
      case 'subdivision': out.subdivisions.push({ name: v('name'), ...(v('lot') ? { lot: v('lot') } : {}), ...(v('block') ? { block: v('block') } : {}) }); break;
      case 'abstract': out.abstracts.push({ number: v('number'), ...(v('survey') ? { survey: v('survey') } : {}) }); break;
      case 'geo_id': out.geoIds.push(v('id')); break;
      case 'legal_description': out.legalDescriptions.push(v('text')); break;
      case 'acreage': out.acreages.push(Number(v('acres'))); break;
      case 'prior_address': out.priorAddresses.push(v('address')); break;
      case 'recorded_date': out.recordedDates.push(v('date')); break;
      case 'coordinates': out.coordinates.push({ lat: Number(v('lat')), lng: Number(v('lng')) }); break;
      case 'other': out.other.push({ label: v('label'), value: v('value') }); break;
    }
  }
  return out;
}

/** How many facts a payload carries, whatever its keys — the API stores the payload only when this
 *  is above zero, and a new kind must not need the API edited to count. */
export function countSupplemental(s: unknown): number {
  if (!s || typeof s !== 'object') return 0;
  let n = 0;
  for (const value of Object.values(s as Record<string, unknown>)) if (Array.isArray(value)) n += value.length;
  return n;
}

/** US states for the State select — Texas first because that is where the firm works. */
export const US_STATES: Array<{ code: string; name: string }> = [
  { code: 'TX', name: 'Texas' },
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];
