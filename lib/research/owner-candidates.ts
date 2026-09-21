// lib/research/owner-candidates.ts — who actually owns it, from what the job already knows.
//
// ── THE RUN THAT PROMPTED THIS ──────────────────────────────────────────────────────────────────
//
// Job 26144, Williamson County, 2026-09-21. The research run searched the county clerk's
// grantor/grantee index three times — "GREEN, EBBY", "EBBY GREEN", "GREEN" — found nothing, and
// moved on having learned nothing about the property.
//
// The job row it came from:
//
//     name:         "ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE"
//     client_name:  "EBBY GREEN"
//     client_email: "ebby@roundrockha.org"
//     address:      "1007 Cushing Dirve"
//
// The owner is in the job's own name, and the email domain corroborates it — `roundrockha.org` is
// the Round Rock Housing Authority. Ebby Green is a person who works there. A grantor index does
// not record employees, so that search could never have returned anything.
//
// `from-job.ts` already warns that `client_name` is the person who HIRED us and may not be the
// owner. That warning was correct and insufficient: it told the run to be careful with the only
// name it had, while three better candidates sat unread one column away.
//
// ── WHY THE JOB NAME IS A GOOD SOURCE AND NOT A GUESS ───────────────────────────────────────────
//
// Surveyors name jobs after whose land it is, then add where. "ROUND ROCK HOUSING AUTHORITY CUSHING
// DRIVE", "SMITH FAMILY TRUST — 14 ACRES", "FIRST BAPTIST CHURCH LOT 4". The organisation comes
// first and the location comes after, because that is the order somebody says it out loud.
//
// So this looks for an ORGANISATION KEYWORD — Authority, LLC, Trust, Church, ISD — and takes the
// span up to and including it. That is a narrow rule with a specific justification: those words
// appear in an entity's legal name and essentially nowhere else in a job title. It does not try to
// parse personal names out of a job title, because "SMITH TRACT" is ambiguous between a person and
// a place and a wrong personal name costs a clerk search.
//
// Everything here is a CANDIDATE. Nothing is asserted as the owner. The run searches them in order
// and the record decides.

/**
 * Words that appear in the legal name of an entity that can own land.
 *
 * Ordered longest-first where one contains another, so "HOUSING AUTHORITY" is preferred over the
 * bare "AUTHORITY" when both would match — the longer span is the more complete name.
 */
const ORG_WORDS: readonly string[] = [
  'HOUSING AUTHORITY', 'WATER SUPPLY CORPORATION', 'INDEPENDENT SCHOOL DISTRICT',
  'HOMEOWNERS ASSOCIATION', 'PROPERTY OWNERS ASSOCIATION', 'LIMITED PARTNERSHIP',
  'DEVELOPMENT CORPORATION', 'MANAGEMENT COMPANY', 'FAMILY TRUST', 'LIVING TRUST',
  'AUTHORITY', 'ASSOCIATION', 'CORPORATION', 'PARTNERSHIP', 'PARTNERS', 'PROPERTIES',
  'ENTERPRISES', 'INVESTMENTS', 'HOLDINGS', 'VENTURES', 'DEVELOPERS', 'DEVELOPMENT',
  'MINISTRIES', 'CHURCH', 'CEMETERY', 'FOUNDATION', 'INSTITUTE', 'UNIVERSITY', 'COLLEGE',
  'HOSPITAL', 'DISTRICT', 'COUNTY', 'COMPANY', 'TRUST', 'ESTATE', 'RANCH', 'FARMS',
  'BANK', 'ISD', 'MUD', 'HOA', 'LLC', 'L.L.C.', 'INC', 'INC.', 'CORP', 'CORP.',
  'LTD', 'LTD.', 'LP', 'L.P.', 'LLP', 'PLLC', 'CO.',
];

/** Free email providers — a domain here says nothing about an organisation. */
const FREE_MAIL = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'comcast.net', 'sbcglobal.net', 'att.net', 'verizon.net',
  'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com', 'txrr.com',
]);

export type CandidateSource = 'job-name' | 'client-company' | 'client-name' | 'email-domain';

export interface OwnerCandidate {
  name: string;
  source: CandidateSource;
  /** True when this looks like an entity rather than a person. */
  isOrganisation: boolean;
  /** Said out loud in the briefing, so a researcher knows what they are looking at. */
  why: string;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Pull an organisation name out of a job title.
 *
 * Takes everything up to and including the organisation keyword, then trims a trailing connector.
 * "ROUND ROCK HOUSING AUTHORITY CUSHING DRIVE" → "ROUND ROCK HOUSING AUTHORITY".
 *
 * Returns null when no keyword is present, which is the common case for "SMITH TRACT" — and
 * returning null there is correct. A guess at a personal name costs a clerk search and can send a
 * researcher after the wrong family.
 */
export function organisationInTitle(title: string | null | undefined): string | null {
  const t = squash(String(title ?? '')).toUpperCase();
  if (!t) return null;

  // ── THE RIGHTMOST KEYWORD WINS, NOT THE FIRST ONE IN THE LIST ─────────────────────────────
  //
  // The first version returned on the first keyword that matched in list order, and the test suite
  // caught what that does to "ACME PARTNERS LP": `PARTNERS` is listed before `LP`, so the name came
  // back as "ACME PARTNERS" with the entity suffix cut off — a different string from the one a deed
  // is recorded under, and therefore a clerk search that finds nothing.
  //
  // An entity's legal name ENDS with its designator, so the correct span is the one reaching
  // furthest right. Ties go to the longer keyword, which is how "TEMPLE HOUSING AUTHORITY" beats
  // the bare "AUTHORITY" ending at the same place.
  let best: { end: number; word: string } | null = null;

  for (const word of ORG_WORDS) {
    // Word-boundary match, so "CORP" does not fire inside "INCORPORATED" and "CO." does not fire
    // inside "COUNTY".
    const pattern = new RegExp(`(^|[^A-Z0-9])${word.replace(/[.]/g, '\\.')}([^A-Z0-9]|$)`, 'g');
    for (const m of t.matchAll(pattern)) {
      if (m.index === undefined) continue;
      const end = m.index + m[0].length - (m[2] ? m[2].length : 0);
      if (!best || end > best.end || (end === best.end && word.length > best.word.length)) {
        best = { end, word };
      }
    }
  }

  if (!best) return null;
  const name = squash(t.slice(0, best.end).replace(new RegExp('^[^A-Z0-9]+'), ''));
  // "LLC" alone is not a name, and neither is "COUNTY" in "COUNTY ROAD 314". Require something in
  // front of the keyword.
  return name.length > best.word.length + 1 ? name : null;
}

/** Does this read as an entity rather than a person? */
export function looksLikeOrganisation(name: string | null | undefined): boolean {
  return organisationInTitle(name) !== null;
}

/**
 * The email's domain, when it is not a free provider.
 *
 * A work domain does not give us the entity's legal name — `roundrockha.org` is not searchable in a
 * grantor index — but it is strong evidence that the contact is acting FOR an organisation rather
 * than owning the land themselves, which is exactly the distinction the run needs to know about.
 */
export function organisationDomain(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return null;
  const domain = e.slice(at + 1);
  if (!domain.includes('.') || FREE_MAIL.has(domain)) return null;
  return domain;
}

export interface JobForOwners {
  name?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  client_email?: string | null;
}

/**
 * Every name worth searching, best first.
 *
 * ORDER IS THE POINT. The clerk search spends a fixed number of attempts, and on job 26144 it spent
 * all of them on an employee. An organisation drawn from the job's own title goes first because
 * that is the name a deed is recorded in.
 */
export function ownerCandidates(job: JobForOwners): OwnerCandidate[] {
  const out: OwnerCandidate[] = [];
  const seen = new Set<string>();

  const add = (name: string | null, source: CandidateSource, why: string) => {
    const n = squash(String(name ?? ''));
    if (!n) return;
    const key = n.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, source, isOrganisation: looksLikeOrganisation(n), why });
  };

  // 1 · The organisation named in the job title. The best candidate there is.
  const fromTitle = organisationInTitle(job.name);
  if (fromTitle) {
    add(fromTitle, 'job-name', 'the organisation named in the job title — a deed is recorded in a name like this');
  }

  // 2 · An explicit company on the job.
  const company = squash(String(job.client_company ?? ''));
  if (company) {
    add(company, 'client-company', 'the company recorded on the job');
  }

  // 3 · The contact. Last, because a person named on a job is frequently an employee, an agent or a
  //     title officer rather than the owner.
  const person = squash(String(job.client_name ?? ''));
  if (person) {
    const domain = organisationDomain(job.client_email);
    add(
      person,
      'client-name',
      domain
        ? `the contact on the job, at ${domain} — a work address, so they are likely acting for that organisation rather than owning the land`
        : 'the contact on the job, who may or may not be the record owner',
    );
  }

  return out;
}

/** The single best name to hand a run that only takes one. */
export function bestOwnerName(job: JobForOwners): string | null {
  const c = ownerCandidates(job);
  return c.length ? c[0]!.name : null;
}

/**
 * The paragraph that goes into the briefing.
 *
 * Written as prose rather than a list because it lands in `intake_notes`, which is read by a model
 * and by a person, and both do better with the reasoning attached than with four bare names.
 */
export function describeOwnerCandidates(job: JobForOwners): string | null {
  const c = ownerCandidates(job);
  if (c.length === 0) return null;

  const lines: string[] = [];
  const org = c.find((x) => x.isOrganisation);
  const person = c.find((x) => !x.isOrganisation);

  if (org && person) {
    lines.push(
      `Search the grantor/grantee index for "${org.name}" FIRST — ${org.why}. ` +
      `"${person.name}" is ${person.why}, so a search on that name alone is likely to return nothing ` +
      'even when the property is well documented.',
    );
  } else if (org) {
    lines.push(`Search the grantor/grantee index for "${org.name}" — ${org.why}.`);
  } else if (person) {
    lines.push(`The only name on the job is "${person.name}" — ${person.why}.`);
  }

  if (c.length > 1) {
    lines.push(`Names to try, best first: ${c.map((x) => `"${x.name}"`).join(', ')}.`);
  }
  return lines.join(' ');
}
