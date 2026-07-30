// lib/compliance/records-catalogue.ts — every record a Texas land surveying firm keeps, as data.
//
// The owner's ask: *"We need to create a checklist/to do list that allows us to go through and gather all
// of the documents listed to keep on file so that we never lose them and they are all up to date and
// current. We need to build a system that keeps track of all time sensitive files and documents that
// require filing at certain times or renewals."*
//
// ── WHY A MODULE AND NOT A MARKDOWN CHECKLIST ────────────────────────────────────────────────────────
//
// A checklist in a document answers "what should we have?" once, on the day it is written. It cannot answer
// "what is due in the next 60 days?", and it silently rots — the version that says the RPLS expires
// 12/31/2026 is still saying that in 2027. The whole value of the request is the SECOND question, and that
// needs the renewal cadence to be a field rather than a sentence.
//
// So this is the checklist as records: each one carrying who issues it, what it costs, how often it comes
// back around, how long it must be kept, and whether a professional needs to look at it. `deadlines.ts`
// turns the cadence into dates; the vault (`file_nodes`, seeds 384/385) holds the actual documents; this
// file is the register that says what SHOULD be in there.
//
// ── TWO KINDS OF TRUTH IN HERE, AND THEY ARE MARKED APART ────────────────────────────────────────────
//
// `verified` — checked against the issuing authority. Two were verified on 2026-07-29 and both changed the
// plan: the TBPELS firm-registration requirement, and Texas sales tax on surveying (see `salesTaxNote`).
// `ownerStated` — the owner's own numbers (licence numbers, filing dates). Recorded as given, not
// re-verified, because they come from documents in hand.
//
// Nothing in here is legal or tax advice, and `professionalReview` names the items where that matters. Pure:
// no DB, no clock — `deadlines.ts` takes `today` as a parameter so every date is testable.

export const RECORD_CATEGORIES = [
  { id: 'formation', label: 'Formation & corporate governance' },
  { id: 'tax', label: 'Tax & financial records' },
  { id: 'licensing', label: 'Licensing & professional' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'contracts', label: 'Contracts & legal templates' },
  { id: 'operations', label: 'Operational & field records' },
  { id: 'hr', label: 'HR & personnel' },
  { id: 'compliance', label: 'Compliance & regulatory' },
  { id: 'banking', label: 'Banking & financial infrastructure' },
  { id: 'systems', label: 'Digital systems & tools' },
] as const;

export type RecordCategoryId = (typeof RECORD_CATEGORIES)[number]['id'];

/**
 * Where a record stands.
 *
 * `pending` is NOT the same as `action`: pending means the requirement only starts when something happens
 * (the first W-2 hire, a second shareholder), and showing those as overdue tasks would bury the real ones.
 */
export type RecordStatus = 'on_file' | 'action' | 'pending' | 'unknown';

/** How often a record comes back around. */
export type Recurrence =
  /** Obtained once and kept. */
  | { kind: 'once' }
  /** Due on the same calendar date each year — franchise tax on 15 May. */
  | { kind: 'annual'; dueMonth: number; dueDay: number }
  /**
   * Renewable inside a window that CLOSES on a date — the RPLS licence opens 1 Nov and must be done by
   * 31 Dec. Modelled apart from `annual` because the window opening is the actionable moment: a reminder
   * on the due date is a reminder you are nearly late.
   */
  | { kind: 'annual_window'; opensMonth: number; opensDay: number; dueMonth: number; dueDay: number }
  /** Four times a year — estimated tax. */
  | { kind: 'quarterly' }
  /** Every month — bank reconciliation. */
  | { kind: 'monthly' }
  /** Triggered by an event, with no calendar date. */
  | { kind: 'per_event'; event: string }
  /** Maintained continuously; nothing to file. */
  | { kind: 'ongoing' };

/** How long a record is kept, and from when. */
export type Retention =
  | { kind: 'permanent' }
  | { kind: 'years'; years: number; from: 'creation' | 'filing' | 'job_completion' }
  | { kind: 'while_active' };

export interface RecordDefinition {
  id: string;
  category: RecordCategoryId;
  title: string;
  /** One line on why it is kept — so nobody deletes it to tidy up. */
  why: string;
  /** Who issues it, or who it is filed with. */
  authority?: string;
  formNumber?: string;
  sourceUrl?: string;
  recurrence: Recurrence;
  retention: Retention;
  feeUsd?: number;
  status: RecordStatus;
  /** The owner's own identifier / date for this record, as supplied. Not re-verified. */
  ownerStated?: string;
  /** ISO date this instance expires, where one is known. Drives the deadline list. */
  expiresOn?: string;
  /** True when the requirement itself was checked against the issuing authority this session. */
  verified?: boolean;
  /** Items where a professional should be the one deciding. */
  professionalReview?: 'cpa' | 'attorney' | 'insurance_agent';
  /** Anything a reader needs before acting. */
  note?: string;
}

/**
 * The Texas sales tax finding, kept next to the records it affects.
 *
 * The owner's master checklist said *"professional surveying is generally not taxable in TX, but confirm
 * with your CPA"*. Verified 2026-07-29 and it is the other way round — which is why it is written out here
 * rather than left as a one-word status.
 */
export const salesTaxNote = {
  verifiedOn: '2026-07-29',
  authority: '34 TAC §3.276 (Surveying Services), effective 11 April 2022',
  finding:
    'Surveying is an enumerated taxable real property service in Texas. §3.276: a person who performs a ' +
    'surveying service for consideration MUST obtain a sales and use tax permit and collect and remit tax ' +
    'on all charges for taxable surveying services.',
  taxable: [
    'boundary surveys', 'easement surveys', 'land title surveys', 'title surveys',
    'right-of-way surveys', 'subdivision plats',
    'staking or placement establishing a structure’s location relative to property boundaries',
  ],
  notTaxable: [
    'construction surveys', 'design surveys', 'geodetic surveys', 'hydrographic surveys',
    'topographic surveys', 'seismic surveys', 'tree surveys',
  ],
  statutoryExclusions: [
    'a contractor purchasing the survey as part of constructing a new improvement to residential real property',
    'a landman performing the survey as necessary to negotiate or secure land or mineral rights',
  ],
  supersedes: 'The surveying portions of the older Rule 3.356 were repealed when §3.276 took effect.',
  caution:
    'A surveyor may NOT accept a resale certificate from an engineering firm for taxable surveying acquired ' +
    'in order to provide nontaxable engineering services.',
  actionForOwner:
    'Confirm permit status, and ask the CPA about prior periods BEFORE filing — that is a question for a ' +
    'professional, not for this app.',
} as const;

const ONCE: Recurrence = { kind: 'once' };
const PERMANENT: Retention = { kind: 'permanent' };
const WHILE_ACTIVE: Retention = { kind: 'while_active' };

/**
 * The register.
 *
 * Ordered by category, then roughly by how load-bearing each record is. Every entry the owner's checklist
 * named is here; nothing was dropped for being inconvenient, and the two items their list marked
 * "have it" are recorded `on_file` with the identifier they supplied.
 */
export const RECORDS: readonly RecordDefinition[] = [
  // ── A. Formation & corporate governance ───────────────────────────────────────────────────────────
  {
    id: 'certificate-of-formation',
    category: 'formation',
    title: 'Certificate of Formation',
    why: 'Proves the corporation exists. Every bank, insurer and platform asks for it.',
    authority: 'Texas Secretary of State',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'on_file',
    ownerStated: 'Document #296880850007, filed 2010-03-01',
  },
  {
    id: 'certificate-of-status',
    category: 'formation',
    title: 'Certificate of Status / Good Standing',
    why: 'What a lender or client asks for to confirm you are current with the state.',
    authority: 'Texas Comptroller',
    sourceUrl: 'https://mycpa.cpa.state.tx.us/coa/',
    recurrence: { kind: 'annual', dueMonth: 6, dueDay: 1 },
    retention: { kind: 'years', years: 3, from: 'creation' },
    status: 'action',
    note: 'Free to pull. Refresh yearly so a current one is always in the vault.',
  },
  {
    id: 'assumed-name-503',
    category: 'formation',
    title: 'Assumed Name Certificate — "Starr Surveying"',
    why: 'Legal permission to invoice and advertise under the trade name.',
    authority: 'Texas Secretary of State',
    formNumber: 'Form 503',
    sourceUrl: 'https://www.sos.state.tx.us/corp/forms/503_boc.pdf',
    recurrence: { kind: 'annual', dueMonth: 11, dueDay: 28 },
    retention: PERMANENT,
    feeUsd: 25,
    status: 'action',
    ownerStated: 'Expired 2021-11-28',
    expiresOn: '2021-11-28',
    verified: true,
    note:
      'A certificate runs up to ten years, so the "annual" cadence here is a nudge to check, not a yearly ' +
      'filing. Since 2019 (HB 3609) this is filed with the SOS only — no county clerk filing.',
  },
  {
    id: 'bylaws',
    category: 'formation',
    title: 'Corporate bylaws (signed)',
    why: 'The rules the corporation runs by. Asked for in due diligence and by some banks.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'unknown',
    professionalReview: 'attorney',
  },
  {
    id: 'organizational-minutes',
    category: 'formation',
    title: 'Organizational minutes / initial consent',
    why: 'The first board and shareholder actions — part of proving the corporation is real and separate.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'unknown',
  },
  {
    id: 'annual-minutes',
    category: 'formation',
    title: 'Annual meeting minutes',
    why:
      'Keeping corporate formalities is part of what preserves the liability shield. A short one each ' +
      'year is enough.',
    recurrence: { kind: 'annual', dueMonth: 12, dueDay: 31 },
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'attorney',
  },
  {
    id: 'stock-ledger',
    category: 'formation',
    title: 'Stock ledger / share certificates / cap table',
    why: 'Documents who owns what. Records Hank’s 100%.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'unknown',
  },
  {
    id: 'shareholder-agreement',
    category: 'formation',
    title: 'Shareholder / buy-sell agreement',
    why: 'What happens to shares on death, exit or dispute.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'pending',
    professionalReview: 'attorney',
    note: 'Only needed if there is ever more than one owner.',
  },
  {
    id: 'corporate-resolutions',
    category: 'formation',
    title: 'Corporate resolutions (banking authority, signing authority)',
    why: 'PNC will want the resolution naming who may sign. Ties to the banking section.',
    recurrence: { kind: 'per_event', event: 'a change in officers or signing authority' },
    retention: PERMANENT,
    status: 'unknown',
  },
  {
    id: 'officer-director-list',
    category: 'formation',
    title: 'Current officer & director list',
    why: 'Has to match what the PIR and the registered-agent record say.',
    recurrence: { kind: 'annual', dueMonth: 5, dueDay: 15 },
    retention: WHILE_ACTIVE,
    status: 'action',
    ownerStated: 'Formation names Hank + Sena Ash Maddux — confirm who is current',
    note: 'Reconcile against the PIR before filing it; a stale officer list is the most common PIR error.',
  },
  {
    id: 'registered-agent-401',
    category: 'formation',
    title: 'Registered agent record + any Form 401 filings',
    why: 'Where the state and courts send legal service. Must be a physical Texas street address.',
    authority: 'Texas Secretary of State',
    formNumber: 'Form 401',
    sourceUrl: 'https://www.sos.state.tx.us/corp/forms/401_boc.pdf',
    recurrence: { kind: 'per_event', event: 'the agent or office address changes' },
    retention: PERMANENT,
    feeUsd: 15,
    status: 'unknown',
    verified: true,
    note:
      'The registered office must equal the agent’s business address and cannot be a PO box. Form 401-A ' +
      '(the agent’s consent) is kept in the corporate records, NOT filed.',
  },
  {
    id: 'ein-letter',
    category: 'formation',
    title: 'EIN confirmation (CP-575 or 147C)',
    why: 'Every bank, payment processor and payroll provider asks for it.',
    authority: 'IRS',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'unknown',
    ownerStated: 'EIN 27-2009146',
    note: 'A lost CP-575 cannot be reissued — request a 147C letter instead, by phone.',
  },
  {
    id: 'filed-franchise-reports',
    category: 'formation',
    title: 'Filed franchise tax / PIR copies',
    why: 'Proof of good standing for each year. Keep the stamped copy, not just the confirmation email.',
    authority: 'Texas Comptroller',
    recurrence: { kind: 'annual', dueMonth: 5, dueDay: 15 },
    retention: PERMANENT,
    status: 'action',
  },

  // ── B. Tax & financial ────────────────────────────────────────────────────────────────────────────
  {
    id: 'form-1120',
    category: 'tax',
    title: 'Federal corporate tax returns (Form 1120)',
    why: 'The return itself plus the workpapers behind it.',
    authority: 'IRS',
    recurrence: { kind: 'annual', dueMonth: 4, dueDay: 15 },
    retention: { kind: 'years', years: 7, from: 'filing' },
    status: 'unknown',
    professionalReview: 'cpa',
  },
  {
    id: 'franchise-tax-pir',
    category: 'tax',
    title: 'Texas franchise tax report + Public Information Report',
    why:
      'You owe $0 tax under the revenue threshold but MUST still file the PIR. Skipping it risks ' +
      'forfeiting the right to transact business and can expose officers personally.',
    authority: 'Texas Comptroller',
    formNumber: 'Form 05-102',
    sourceUrl: 'https://comptroller.texas.gov/forms/05-102-a-26.pdf',
    recurrence: { kind: 'annual', dueMonth: 5, dueDay: 15 },
    retention: { kind: 'years', years: 7, from: 'filing' },
    status: 'action',
    verified: true,
  },
  {
    id: 'sales-tax-permit',
    category: 'tax',
    title: 'Texas Sales & Use Tax Permit',
    why:
      'Required to collect tax on taxable surveying. §3.276 makes the permit mandatory for anyone ' +
      'performing surveying services for consideration.',
    authority: 'Texas Comptroller',
    formNumber: 'Form AP-201',
    sourceUrl: 'https://comptroller.texas.gov/forms/ap-201.pdf',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'action',
    verified: true,
    professionalReview: 'cpa',
    note:
      'See `salesTaxNote`. This corrects the master checklist, which had surveying as generally ' +
      'non-taxable. Ask the CPA about prior periods before filing.',
  },
  {
    id: 'sales-tax-returns',
    category: 'tax',
    title: 'Sales tax returns + exemption/resale certificates received',
    why:
      'Once you hold a permit you file on a schedule, and every untaxed sale needs its certificate on ' +
      'file to survive an audit.',
    authority: 'Texas Comptroller',
    recurrence: { kind: 'quarterly' },
    retention: { kind: 'years', years: 4, from: 'filing' },
    status: 'pending',
    professionalReview: 'cpa',
    note: 'Filing frequency (monthly / quarterly / annual) is assigned by the Comptroller with the permit.',
  },
  {
    id: 'contractor-w9',
    category: 'tax',
    title: 'W-9 from every 1099 contractor',
    why: 'No W-9, no pay. Without it you cannot issue a correct 1099 and may owe backup withholding.',
    authority: 'IRS (collected by you, not filed)',
    formNumber: 'Form W-9',
    sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
    recurrence: { kind: 'per_event', event: 'before a contractor’s first payment' },
    retention: { kind: 'years', years: 4, from: 'creation' },
    status: 'action',
  },
  {
    id: 'form-1099-nec',
    category: 'tax',
    title: '1099-NEC + 1096 filings',
    why: 'Every contractor paid $600 or more in a calendar year gets one.',
    authority: 'IRS',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 31 },
    retention: { kind: 'years', years: 4, from: 'filing' },
    status: 'action',
  },
  {
    id: 'general-ledger',
    category: 'tax',
    title: 'Accounting system / general ledger',
    why: 'The books everything else reconciles to. Chart of accounts set up for a surveying firm.',
    recurrence: { kind: 'ongoing' },
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'cpa',
  },
  {
    id: 'bank-reconciliations',
    category: 'tax',
    title: 'Bank statements + monthly reconciliations',
    why: 'Catches errors and fraud while they are still small.',
    recurrence: { kind: 'monthly' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
    note: 'The app has a reconciliation surface at /admin/finances/reconcile.',
  },
  {
    id: 'financial-statements',
    category: 'tax',
    title: 'Financial statements (P&L, balance sheet, cash flow)',
    why: 'What a lender asks for, and how you know whether the business is working.',
    recurrence: { kind: 'monthly' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
  },
  {
    id: 'ar-ap-records',
    category: 'tax',
    title: 'Invoices issued + bills received (A/R and A/P)',
    why: 'The invoice record is also the sales-tax record. Keep the issued PDF, not just the row.',
    recurrence: { kind: 'ongoing' },
    retention: { kind: 'years', years: 4, from: 'creation' },
    status: 'on_file',
    note: 'Handled by the app: customer_invoices + receipt PDFs.',
  },
  {
    id: 'expense-receipts-mileage',
    category: 'tax',
    title: 'Expense receipts + mileage logs',
    why: 'Field driving is a large deduction and the first thing an auditor asks to see substantiated.',
    recurrence: { kind: 'ongoing' },
    retention: { kind: 'years', years: 4, from: 'creation' },
    status: 'on_file',
    note: 'The app captures both — field receipts and manual mileage feed the financials.',
  },
  {
    id: 'fixed-asset-register',
    category: 'tax',
    title: 'Fixed-asset register + depreciation schedule',
    why:
      'GNSS, total station, TSC3/TDC600, vehicles — by serial number. Doubles as the insurance schedule ' +
      'and the theft report.',
    recurrence: { kind: 'annual', dueMonth: 12, dueDay: 31 },
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'cpa',
  },
  {
    id: 'estimated-tax',
    category: 'tax',
    title: 'Estimated tax payments',
    why: 'Corporate and, for the owners, personal. Underpayment penalties are avoidable.',
    authority: 'IRS',
    recurrence: { kind: 'quarterly' },
    retention: { kind: 'years', years: 7, from: 'filing' },
    status: 'unknown',
    professionalReview: 'cpa',
  },

  // ── C. Licensing & professional ───────────────────────────────────────────────────────────────────
  {
    id: 'rpls-licence',
    category: 'licensing',
    title: 'RPLS licence — Hank',
    why: 'Without an active RPLS the firm cannot lawfully offer surveying at all. The load-bearing licence.',
    authority: 'TBPELS',
    sourceUrl: 'https://pels.texas.gov/',
    recurrence: { kind: 'annual_window', opensMonth: 11, opensDay: 1, dueMonth: 12, dueDay: 31 },
    retention: PERMANENT,
    feeUsd: 100,
    status: 'on_file',
    ownerStated: 'RPLS #6706, active through 2026-12-31',
    expiresOn: '2026-12-31',
  },
  {
    id: 'tbpels-firm-registration',
    category: 'licensing',
    title: 'TBPELS firm registration',
    why:
      'The FIRM’s licence to offer surveying, separate from Hank’s personal licence. A business entity ' +
      'offering surveying to the public must hold one, and must employ a full-time RPLS.',
    authority: 'TBPELS — 1917 S. Interstate 35, Austin, TX 78741 · (512) 440-7723',
    sourceUrl: 'https://pels.texas.gov/surveying_firm.htm',
    recurrence: { kind: 'annual_window', opensMonth: 11, opensDay: 1, dueMonth: 12, dueDay: 31 },
    retention: PERMANENT,
    feeUsd: 150,
    status: 'on_file',
    ownerStated: 'Firm #10193754',
    verified: true,
    note:
      'Renews BEFORE 1 January to offer services in the next year — so the practical deadline is 31 ' +
      'December, not a date in January. The Belton address change needs to reach the Board too.',
  },
  {
    id: 'rpls-continuing-education',
    category: 'licensing',
    title: 'RPLS continuing education records',
    why: 'Renewal depends on it, and the Board can audit the certificates.',
    authority: 'TBPELS',
    recurrence: { kind: 'annual', dueMonth: 12, dueDay: 31 },
    retention: { kind: 'years', years: 5, from: 'creation' },
    status: 'action',
  },
  {
    id: 'sit-records',
    category: 'licensing',
    title: 'Surveyor-in-Training records — Jacob',
    why: 'Coursework, exam results and the experience log that add up to an RPLS application.',
    authority: 'TBPELS',
    recurrence: { kind: 'ongoing' },
    retention: PERMANENT,
    status: 'action',
    note: 'The experience log is the part that is painful to reconstruct later. Keep it as you go.',
  },
  {
    id: 'seal-records',
    category: 'licensing',
    title: 'Seal / stamp records',
    why: 'Which seal was used on which sealed deliverable. Matters in a dispute.',
    recurrence: { kind: 'ongoing' },
    retention: PERMANENT,
    status: 'unknown',
  },
  {
    id: 'cst-certs',
    category: 'licensing',
    title: 'CST (Certified Survey Technician) certificates',
    why: 'Optional crew credentialing; useful on qualifications statements.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'pending',
  },
  {
    id: 'tbpels-correspondence',
    category: 'licensing',
    title: 'TBPELS correspondence',
    why: 'Board letters, complaints, audits. Keep every one, including the ones that resolved fine.',
    recurrence: { kind: 'per_event', event: 'any board contact' },
    retention: PERMANENT,
    status: 'unknown',
  },

  // ── D. Insurance ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'professional-liability-eo',
    category: 'insurance',
    title: 'Professional liability / E&O',
    why:
      'Covers the claim that a survey was wrong — the characteristic surveying claim. Essential, and ' +
      'many clients require proof of it.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: PERMANENT,
    status: 'unknown',
    professionalReview: 'insurance_agent',
    note:
      'Keep expired policies permanently: E&O is usually claims-made, so which policy was in force on the ' +
      'survey date decides who pays.',
  },
  {
    id: 'general-liability',
    category: 'insurance',
    title: 'General liability',
    why: 'Third-party injury and property damage.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: { kind: 'years', years: 10, from: 'creation' },
    status: 'unknown',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'commercial-auto',
    category: 'insurance',
    title: 'Commercial auto',
    why: 'Field trucks, and confirmation that whoever drives them is covered — including 1099 crew.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: { kind: 'years', years: 10, from: 'creation' },
    status: 'unknown',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'equipment-inland-marine',
    category: 'insurance',
    title: 'Equipment / inland marine',
    why: 'GNSS, total station and data collectors are high-value and live in the field. Ties to the asset register.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: WHILE_ACTIVE,
    status: 'unknown',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'workers-comp-decision',
    category: 'insurance',
    title: 'Workers’ comp — policy or documented non-subscriber decision',
    why:
      'Texas does not require private employers to carry it, but a non-subscriber loses key legal ' +
      'defences if a worker is hurt. For field survey work that is a real exposure, so the DECISION ' +
      'itself gets documented either way.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: PERMANENT,
    status: 'unknown',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'cyber-liability',
    category: 'insurance',
    title: 'Cyber liability',
    why: 'Client data sits in the web app. Worth having once the app is live.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: WHILE_ACTIVE,
    status: 'pending',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'umbrella-excess',
    category: 'insurance',
    title: 'Umbrella / excess liability',
    why: 'Extra limits above GL and auto; often required by larger clients.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: WHILE_ACTIVE,
    status: 'pending',
    professionalReview: 'insurance_agent',
  },
  {
    id: 'certificates-of-insurance',
    category: 'insurance',
    title: 'Certificates of insurance — issued and collected',
    why:
      'Issue to clients on request; COLLECT from every subcontractor. An uninsured sub is your ' +
      'exposure, and the certificate is the only proof you checked.',
    recurrence: { kind: 'per_event', event: 'each client request, and each subcontractor engagement' },
    retention: { kind: 'years', years: 10, from: 'creation' },
    status: 'action',
  },

  // ── E. Contracts & legal templates ────────────────────────────────────────────────────────────────
  {
    id: 'contractor-agreement',
    category: 'contracts',
    title: 'Independent contractor agreement (1099)',
    why: 'The written terms for every crew member paid on a 1099.',
    recurrence: { kind: 'per_event', event: 'each contractor engagement' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
    professionalReview: 'attorney',
    note: 'See `workerClassificationNote` — the contract helps, but the facts control, not the label.',
  },
  {
    id: 'client-contract-engagement',
    category: 'contracts',
    title: 'Client contract / proposal + engagement letter',
    why: 'Scope, fee and terms per job. The first document read in any fee dispute.',
    recurrence: { kind: 'per_event', event: 'each job' },
    retention: { kind: 'years', years: 10, from: 'job_completion' },
    status: 'action',
    professionalReview: 'attorney',
  },
  {
    id: 'standard-terms',
    category: 'contracts',
    title: 'Standard terms & conditions',
    why:
      'Payment terms, limitation of liability, which survey standard applies, and restrictions on reuse ' +
      'of the survey by third parties.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'attorney',
    note: 'Should state the sales-tax treatment now that §3.276 is settled.',
  },
  {
    id: 'right-of-entry',
    category: 'contracts',
    title: 'Right-of-entry / permission-to-enter form',
    why: 'Authority to be on the property. Protects the crew from a trespass complaint.',
    recurrence: { kind: 'per_event', event: 'each property accessed' },
    retention: { kind: 'years', years: 10, from: 'job_completion' },
    status: 'action',
  },
  {
    id: 'subcontractor-agreement',
    category: 'contracts',
    title: 'Subcontractor agreement',
    why: 'For subbing work to another firm or surveyor.',
    recurrence: { kind: 'per_event', event: 'each subcontract' },
    retention: { kind: 'years', years: 10, from: 'job_completion' },
    status: 'pending',
    professionalReview: 'attorney',
  },
  {
    id: 'nda',
    category: 'contracts',
    title: 'NDA / confidentiality agreement',
    why: 'For clients and contractors who touch sensitive project data.',
    recurrence: { kind: 'per_event', event: 'as needed' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
  },
  {
    id: 'equipment-use-agreement',
    category: 'contracts',
    title: 'Equipment-use / loan agreement',
    why:
      'For contractors using company GNSS, total station or vehicles. Also relevant to classification — ' +
      'who supplies the tools is one of the factors.',
    recurrence: { kind: 'per_event', event: 'each contractor issued equipment' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
    professionalReview: 'attorney',
  },
  {
    id: 'change-order-template',
    category: 'contracts',
    title: 'Change-order template',
    why: 'Scope changes mid-job, in writing, before the work. Prevents the unbillable extra.',
    recurrence: ONCE,
    retention: PERMANENT,
    status: 'action',
  },
  {
    id: 'lien-forms',
    category: 'contracts',
    title: 'Mechanic’s / materialman’s lien process',
    why: 'Texas surveyors can have lien rights on some work, but the deadlines are short and strict.',
    recurrence: { kind: 'per_event', event: 'an unpaid job' },
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'attorney',
    note: 'Worth knowing the deadline clock BEFORE you need it — by the time an invoice is old it may be late.',
  },

  // ── F. Operational & field records ────────────────────────────────────────────────────────────────
  {
    id: 'per-job-project-file',
    category: 'operations',
    title: 'Per-job project file',
    why:
      'Field notes, raw and processed data, deed/plat research, CAD, computations, and the signed and ' +
      'sealed deliverable. This is the file that defends the survey.',
    recurrence: { kind: 'per_event', event: 'each job' },
    retention: { kind: 'years', years: 10, from: 'job_completion' },
    status: 'action',
    note:
      'Retention is driven by Texas’ statute of repose for design professionals — owner-stated as 10 ' +
      'years from completion. Worth confirming with the attorney, since every retention span in this ' +
      'section keys off it.',
  },
  {
    id: 'job-register',
    category: 'operations',
    title: 'Job register / project log',
    why: 'Master list of every job with its number and client. The index into the archive.',
    recurrence: { kind: 'ongoing' },
    retention: PERMANENT,
    status: 'on_file',
    note: 'The app’s jobs table is this.',
  },
  {
    id: 'field-notes',
    category: 'operations',
    title: 'Original field notes / raw field data',
    why: 'The observations behind the survey. Cannot be recreated.',
    recurrence: { kind: 'per_event', event: 'each job' },
    retention: { kind: 'years', years: 10, from: 'job_completion' },
    status: 'action',
  },
  {
    id: 'sealed-deliverable-archive',
    category: 'operations',
    title: 'Signed & sealed deliverable archive',
    why: 'The sealed survey and its legal description. Keep permanently — these get relied on for decades.',
    recurrence: { kind: 'per_event', event: 'each sealed deliverable' },
    retention: PERMANENT,
    status: 'action',
  },
  {
    id: 'equipment-calibration',
    category: 'operations',
    title: 'Equipment calibration & maintenance logs',
    why:
      'Calibration certificates for GNSS, total station, levels and rods. If a measurement is ever ' +
      'challenged, this is the evidence the instrument was sound.',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 31 },
    retention: { kind: 'years', years: 10, from: 'creation' },
    status: 'action',
  },
  {
    id: 'equipment-inventory',
    category: 'operations',
    title: 'Equipment inventory with serial numbers',
    why: 'Ties the insurance schedule, the asset register and a police report together.',
    recurrence: { kind: 'annual', dueMonth: 12, dueDay: 31 },
    retention: WHILE_ACTIVE,
    status: 'on_file',
    note: 'The app tracks equipment and assignments.',
  },
  {
    id: 'vehicle-maintenance',
    category: 'operations',
    title: 'Vehicle maintenance logs',
    why: 'Supports the auto deduction and shows the fleet was maintained.',
    recurrence: { kind: 'ongoing' },
    retention: { kind: 'years', years: 4, from: 'creation' },
    status: 'on_file',
  },
  {
    id: 'control-monument-records',
    category: 'operations',
    title: 'Control / monument records',
    why: 'Control network data and monuments set or recovered — reused across jobs for years.',
    recurrence: { kind: 'ongoing' },
    retention: PERMANENT,
    status: 'action',
  },
  {
    id: 'digital-backups',
    category: 'operations',
    title: 'Digital data backups (field data + CAD)',
    why:
      'A ten-year retention obligation is only real if the data survives a dead laptop. Offsite, ' +
      'automated, and restore-tested.',
    recurrence: { kind: 'monthly' },
    retention: WHILE_ACTIVE,
    status: 'action',
    note: 'An untested backup is a hope. Restore one file a quarter.',
  },

  // ── G. HR & personnel ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'contractor-file',
    category: 'hr',
    title: 'Per-contractor file (agreement, W-9, COI, licences)',
    why: 'One folder per contractor so nothing is missing at 1099 time or in an audit.',
    recurrence: { kind: 'per_event', event: 'each contractor engagement' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'action',
  },
  {
    id: 'form-i9',
    category: 'hr',
    title: 'Form I-9',
    why: 'Required within 3 business days of hire. Store SEPARATELY from the personnel file.',
    authority: 'USCIS',
    formNumber: 'Form I-9',
    sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf',
    recurrence: { kind: 'per_event', event: 'within 3 days of each W-2 hire' },
    retention: { kind: 'years', years: 3, from: 'creation' },
    status: 'pending',
  },
  {
    id: 'form-w4-new-hire',
    category: 'hr',
    title: 'Form W-4 + Texas new-hire report',
    why: 'Withholding, and the state new-hire report within 20 days.',
    authority: 'IRS / Texas Attorney General',
    formNumber: 'Form W-4',
    sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf',
    recurrence: { kind: 'per_event', event: 'each W-2 hire' },
    retention: { kind: 'years', years: 4, from: 'creation' },
    status: 'pending',
  },
  {
    id: 'offer-letter-handbook-ack',
    category: 'hr',
    title: 'Offer letters, job descriptions, handbook acknowledgments',
    why: 'What was agreed, and proof the policies were received.',
    recurrence: { kind: 'per_event', event: 'each W-2 hire' },
    retention: { kind: 'years', years: 7, from: 'creation' },
    status: 'pending',
  },
  {
    id: 'employee-handbook',
    category: 'hr',
    title: 'Employee handbook',
    why: 'Policies, PTO, conduct, safety.',
    recurrence: ONCE,
    retention: WHILE_ACTIVE,
    status: 'pending',
    professionalReview: 'attorney',
  },
  {
    id: 'payroll-filings',
    category: 'hr',
    title: 'Payroll records + 941 / 940 / W-2 / W-3 filings',
    why: 'Quarterly and annual payroll tax filings once there are employees.',
    authority: 'IRS',
    recurrence: { kind: 'quarterly' },
    retention: { kind: 'years', years: 4, from: 'filing' },
    status: 'pending',
    professionalReview: 'cpa',
  },
  {
    id: 'safety-training-records',
    category: 'hr',
    title: 'OSHA safety training records',
    why: 'Heat, traffic and terrain are the field crew’s real risks. Document the training.',
    recurrence: { kind: 'annual', dueMonth: 3, dueDay: 1 },
    retention: { kind: 'years', years: 5, from: 'creation' },
    status: 'pending',
  },

  // ── H. Compliance & regulatory ───────────────────────────────────────────────────────────────────
  {
    id: 'safety-program',
    category: 'compliance',
    title: 'Safety program / field-safety plan',
    why: 'Traffic control, heat illness, PPE. Also what a client’s risk department asks for.',
    recurrence: { kind: 'annual', dueMonth: 3, dueDay: 1 },
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'local-business-licence',
    category: 'compliance',
    title: 'Local business licence / permits',
    why: 'City of Belton and Bell County requirements — confirm what applies at the new address.',
    authority: 'City of Belton / Bell County',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 31 },
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'data-privacy',
    category: 'compliance',
    title: 'Data-privacy basics',
    why: 'You hold client data in the web app. Know where it lives and who can read it.',
    recurrence: { kind: 'annual', dueMonth: 6, dueDay: 30 },
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'records-retention-policy',
    category: 'compliance',
    title: 'Records-retention schedule',
    why:
      'One page mapping each record type to how long it is kept. This register IS that schedule once it ' +
      'is reviewed and signed off.',
    recurrence: { kind: 'annual', dueMonth: 6, dueDay: 30 },
    retention: PERMANENT,
    status: 'action',
    professionalReview: 'attorney',
  },

  // ── I. Banking & financial infrastructure ────────────────────────────────────────────────────────
  {
    id: 'business-checking',
    category: 'banking',
    title: 'Business checking (PNC) + savings buffer',
    why: 'Separating business and personal money is what keeps the corporate shield intact.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'on_file',
    ownerStated: 'PNC business checking — have it',
  },
  {
    id: 'business-credit-card',
    category: 'banking',
    title: 'Business credit card',
    why: 'Clean expense separation, and it builds business credit.',
    recurrence: ONCE,
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'payment-processing',
    category: 'banking',
    title: 'Payment processing (Stripe, Venmo Business)',
    why: 'The card and ACH path the website already codes against.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'action',
    ownerStated: 'Stripe — set up',
    note:
      'Code is built and gated. Needs STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, ' +
      'STRIPE_WEBHOOK_SECRET, PAY_PORTAL_PASSWORD, PAYMENT_ENCRYPTION_KEY, then PAYMENTS_LIVE=true.',
  },
  {
    id: 'accounting-software',
    category: 'banking',
    title: 'Accounting software (QuickBooks Online)',
    why: 'Syncs the bank and Stripe so the books are not hand-keyed.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'payroll-provider',
    category: 'banking',
    title: 'Payroll provider',
    why: 'Gusto or ADP, once there are W-2 employees.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'pending',
  },
  {
    id: 'line-of-credit',
    category: 'banking',
    title: 'Line of credit / financing relationship',
    why: 'Equipment (drone, R12i, scanner) and cash-flow gaps between invoice and payment.',
    recurrence: ONCE,
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'signing-authority-resolution',
    category: 'banking',
    title: 'Signing-authority resolution on file with the bank',
    why: 'Who may move money. Ties back to the corporate resolutions.',
    recurrence: { kind: 'per_event', event: 'a change in signing authority' },
    retention: PERMANENT,
    status: 'unknown',
  },

  // ── K. Digital systems ───────────────────────────────────────────────────────────────────────────
  {
    id: 'duns-number',
    category: 'systems',
    title: 'D-U-N-S number',
    why:
      'Mandatory for BOTH Apple Developer and Google Play organisation accounts — so the mobile app ' +
      'cannot ship without it, registered to the exact legal entity.',
    authority: 'Dun & Bradstreet',
    sourceUrl: 'https://developer.apple.com/help/account/membership/D-U-N-S',
    recurrence: { kind: 'per_event', event: 'any change of legal name or address' },
    retention: PERMANENT,
    status: 'action',
    verified: true,
    note:
      'Apple rejects DBAs, trade names and branches — enroll as Starr Technical Services, Inc., never as ' +
      'Starr Surveying. Google warns D&B can take up to 30 days.',
  },
  {
    id: 'apple-developer',
    category: 'systems',
    title: 'Apple Developer Program (organisation)',
    why: 'Required to ship the iOS app. $99/year.',
    authority: 'Apple',
    sourceUrl: 'https://developer.apple.com/help/account/membership/program-enrollment/',
    recurrence: { kind: 'annual', dueMonth: 1, dueDay: 1 },
    retention: WHILE_ACTIVE,
    feeUsd: 99,
    status: 'action',
    verified: true,
    note: 'Lapsing removes your apps from the App Store — this is a renewal that must not be missed.',
  },
  {
    id: 'google-play-developer',
    category: 'systems',
    title: 'Google Play Console (organisation)',
    why: 'Required to ship the Android app. One-time $25 plus identity verification.',
    authority: 'Google',
    sourceUrl: 'https://support.google.com/googleplay/android-developer/answer/13628312',
    recurrence: ONCE,
    retention: WHILE_ACTIVE,
    feeUsd: 25,
    status: 'action',
    verified: true,
  },
  {
    id: 'password-manager',
    category: 'systems',
    title: 'Password manager (shared business vault)',
    why:
      'Every account above has credentials. A shared vault is what stops the business being locked out ' +
      'of its own Stripe account.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'action',
  },
  {
    id: 'document-vault',
    category: 'systems',
    title: 'Document vault + cloud backup',
    why: 'Where every record in this register actually lives.',
    recurrence: { kind: 'ongoing' },
    retention: WHILE_ACTIVE,
    status: 'on_file',
    note: 'The app’s File Explorer at /admin/files is this — file_nodes + file_permissions.',
  },
];

/**
 * The classification question, recorded because it is the highest-consequence open item on the register
 * and the one most likely to be waved off.
 *
 * The owner's own summary is right and worth keeping verbatim in the codebase: crews doing the core survey
 * work, often with company equipment, under the RPLS's legally-required supervision, can look like
 * employees to the IRS or the Texas Workforce Commission regardless of what the contract says. **Facts
 * control, not the label.** IRS Form SS-8 and the TWC can both issue formal determinations.
 *
 * This is not something the app should decide, and not something to quietly model around. It is flagged
 * here so that every 1099-related record in the register points at one place.
 */
export const workerClassificationNote = {
  question: 'Are the 1099 field crews correctly classified as contractors rather than employees?',
  whyItIsLive:
    'They perform the core service, frequently with company equipment, under supervision the RPLS is ' +
    'legally required to exercise. Those are three of the factors that weigh toward employee status.',
  consequence: 'Misclassification means back employment taxes and penalties.',
  routes: ['IRS Form SS-8 determination', 'Texas Workforce Commission determination'],
  owner: 'CPA or employment attorney — not this app, and not an assumption in code.',
  affects: ['contractor-agreement', 'contractor-file', 'contractor-w9', 'form-1099-nec', 'workers-comp-decision'],
} as const;

// ── Lookups ─────────────────────────────────────────────────────────────────────────────────────────

export function recordById(id: string): RecordDefinition | undefined {
  return RECORDS.find((r) => r.id === id);
}

export function recordsInCategory(category: RecordCategoryId): RecordDefinition[] {
  return RECORDS.filter((r) => r.category === category);
}

export function categoryLabel(id: RecordCategoryId): string {
  return RECORD_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Everything still to be done — `action` and `unknown`, but NOT `pending`. See `RecordStatus`. */
export function openItems(): RecordDefinition[] {
  return RECORDS.filter((r) => r.status === 'action' || r.status === 'unknown');
}

/** Items where a professional should make the call, grouped by which professional. */
export function professionalReviewQueue(): Record<'cpa' | 'attorney' | 'insurance_agent', RecordDefinition[]> {
  const out = { cpa: [] as RecordDefinition[], attorney: [] as RecordDefinition[], insurance_agent: [] as RecordDefinition[] };
  for (const r of RECORDS) if (r.professionalReview) out[r.professionalReview].push(r);
  return out;
}

/** Total known annual cost of keeping the licences and accounts current. */
export function annualFeeTotalUsd(): number {
  return RECORDS.reduce((acc, r) => {
    const recurs = r.recurrence.kind === 'annual' || r.recurrence.kind === 'annual_window';
    return acc + (recurs && r.feeUsd ? r.feeUsd : 0);
  }, 0);
}
