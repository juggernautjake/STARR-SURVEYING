// lib/projects/model.ts — what a project is, what its jobs inherit, and what it adds up to.
//
// Owner, 2026-08-19: *"create new projects, and then within the project we can create a new job. We
// would then be able to have multiple jobs within a project."*
//
// ── THE THREE RULES WORTH STATING IN ONE PLACE ──────────────────────────────────────────────────
//
// 1. **A job inherits the project's client and site, it does not copy a reference to them.** The
//    values are written onto the job at creation, so a job remains a complete, self-describing
//    record — every report, invoice, PDF export, field packet and CAD title block already reads
//    `job.client_name` and `job.address`, and none of them would survive those turning into
//    lookups. Inheritance happens once, at creation; afterwards the job's copy is its own and may
//    be overridden. The alternative — resolving through the project on every read — would have
//    meant editing several dozen call sites to fix a problem nobody has.
//
// 2. **Money is never stored on a project.** It is summed from the jobs. A stored total is a second
//    source of truth that drifts the first time a job is edited by anything that does not know to
//    update its parent, and a wrong money figure is worse than no money figure.
//
// 3. **Project numbers are visibly not job numbers.** `P-2026-0014` against `2026-0007`. Job
//    numbers are untouched, because they are already printed on quotes, invoices and drawings.
//
// Pure. No I/O — tested in `__tests__/projects/model.test.ts`.

export const PROJECT_STATUSES = ['active', 'on_hold', 'complete', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

/** Brand colours, matching the stage chips already used on jobs. */
export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  active: '#1D3095',
  on_hold: '#B45309',
  complete: '#047857',
  cancelled: '#6B7280',
};

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === 'string' && (PROJECT_STATUSES as readonly string[]).includes(v);
}

/** The `P-` is load-bearing: it is what stops a project number reading as a job number. */
export const PROJECT_NUMBER_PREFIX = 'P-';

/**
 * The next project number for a year, given the numbers already used that year.
 *
 * Takes the MAX rather than the count, because counting is wrong the moment a project is deleted:
 * with `P-2026-0001..0003` and 0002 removed, a count-based scheme returns 0003 — which already
 * exists — and the insert fails on the unique index, or worse, silently reuses a number that is on
 * somebody's paperwork.
 */
export function nextProjectNumber(year: number, existing: string[]): string {
  const prefix = `${PROJECT_NUMBER_PREFIX}${year}-`;
  let max = 0;
  for (const n of existing) {
    if (!n || !n.startsWith(prefix)) continue;
    const tail = Number.parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** The fields a project owns and a new job starts life with. */
export const INHERITED_FIELDS = [
  'customer_id',
  'client_name', 'client_email', 'client_phone', 'client_company', 'client_address',
  'address', 'city', 'state', 'zip', 'county',
  'subdivision', 'abstract_number', 'lot_number', 'acreage',
  'latitude', 'longitude',
  'lead_rpls_email',
] as const;

export type InheritedField = (typeof INHERITED_FIELDS)[number];

type Bag = Record<string, unknown>;

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

/**
 * Fill a new job's blanks from its project.
 *
 * **What the caller supplies always wins.** Somebody typing a different address into the New Job
 * form is telling you something — that this job is on the adjoining parcel, or for the buyer rather
 * than the seller — and a project that overwrote it would be silently discarding the more specific
 * of the two facts. So this fills only what is absent, and an explicitly emptied field stays empty.
 */
export function inheritFromProject(project: Bag, job: Bag): Bag {
  const out: Bag = { ...job };
  for (const field of INHERITED_FIELDS) {
    if (present(out[field])) continue;
    if (!present(project[field])) continue;
    out[field] = project[field];
  }
  return out;
}

/** Which inherited fields this job has diverged from — what the UI marks as overridden. */
export function overriddenFields(project: Bag, job: Bag): InheritedField[] {
  return INHERITED_FIELDS.filter((f) => {
    if (!present(project[f]) && !present(job[f])) return false;
    const a = typeof project[f] === 'string' ? (project[f] as string).trim() : project[f];
    const b = typeof job[f] === 'string' ? (job[f] as string).trim() : job[f];
    return a !== b;
  });
}

export interface JobMoney {
  quote_amount?: number | null;
  final_amount?: number | null;
  amount_paid?: number | null;
  stage?: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
}

export interface ProjectRollup {
  jobs: number;
  active: number;
  archived: number;
  quoted: number;
  /** `final_amount` where it is set, otherwise the quote — what the firm expects to be paid. */
  billable: number;
  paid: number;
  outstanding: number;
}

/**
 * Add a project's jobs up.
 *
 * Deleted jobs are excluded entirely — money owed on work that was thrown away is not money owed.
 * `billable` falls back to the quote when no final amount is set, because a job in progress has a
 * number the firm is counting on and reporting it as zero makes the project look free.
 */
export function rollUp(jobs: JobMoney[]): ProjectRollup {
  const live = jobs.filter((j) => !j.deleted_at);
  let quoted = 0, billable = 0, paid = 0, archived = 0;

  for (const j of live) {
    const q = num(j.quote_amount);
    const f = num(j.final_amount);
    quoted += q;
    billable += f > 0 ? f : q;
    paid += num(j.amount_paid);
    if (j.is_archived) archived += 1;
  }

  return {
    jobs: live.length,
    active: live.length - archived,
    archived,
    quoted: round2(quoted),
    billable: round2(billable),
    paid: round2(paid),
    // Never negative: an overpayment is a credit to be handled on the job, not a negative balance
    // that quietly cancels out another job's genuine debt in the project total.
    outstanding: round2(Math.max(0, billable - paid)),
  };
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A suggested project name, from the parts the firm actually names projects after.
 *
 * Owner, 2026-08-19: *"We will likely name the project by the name of the customer or location or
 * date or some combination of all 3."*
 *
 * A SUGGESTION, not a format. The name stays free text, because the day somebody needs
 * "Smith Tract — re-survey after the flood" is the day an enforced pattern becomes an obstacle.
 * Parts that are missing are simply left out rather than leaving an empty separator behind — a name
 * reading "— Edinburg — Aug 2026" looks like a bug, and people retype around bugs.
 */
export function suggestProjectName(parts: { client?: string | null; location?: string | null; date?: Date }): string {
  const bits: string[] = [];
  const client = (parts.client ?? '').trim();
  const location = (parts.location ?? '').trim();
  if (client) bits.push(client);
  // Only when it adds something: "Smith Holdings — Smith Holdings" helps nobody.
  if (location && location.toLowerCase() !== client.toLowerCase()) bits.push(location);
  if (parts.date && !Number.isNaN(parts.date.getTime())) {
    bits.push(parts.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  }
  // A date on its own is not a name, it is a timestamp — so it never stands alone.
  if (bits.length === 1 && !client && !location) return '';
  return bits.join(' — ');
}

/** How a project is titled everywhere it is listed. */
export function projectLabel(p: { project_number?: string | null; name?: string | null }): string {
  const num = (p.project_number ?? '').trim();
  const name = (p.name ?? '').trim() || 'Untitled project';
  return num ? `${num} — ${name}` : name;
}
