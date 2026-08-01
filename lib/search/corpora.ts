// lib/search/corpora.ts — every place a document or record can hide (§3b).
//
// Owner objective 2026-08-01: *"if we need to pull up a customer's info or job info, or business
// documents, we can do that."* The obstacle is not ranking or relevance — it is that the answer lives
// in eleven different tables that have never been queried together.
//
// ── WHY THIS IS A REGISTRY AND NOT ELEVEN QUERIES ──────────────────────────────────────────────────
//
// The tempting shape is a route with eleven hand-written SELECTs. This repo already knows how that
// ends: audit §1.3 found two hand-maintained navigation lists drifted apart by 32 routes, and §1.1b
// found three queries pointed at tables that never existed, each degrading to an empty result because
// the error was discarded. A search box is the worst possible place to repeat either mistake — it
// returns nothing, which is indistinguishable from "there is nothing", so nobody reports it as broken.
//
// So the corpora are DATA. One place says what is searchable, which columns hold text, which dates
// mean what, and how to open a hit. Adding a table means adding a row here, and the guard test fails
// if a row names a column that does not exist.
//
// ── WHAT COUNTS AS A "DOCUMENT" IS NOT OBVIOUS ────────────────────────────────────────────────────
//
// The File Explorer (`file_nodes`) looks like the answer and is not: it holds **6 rows**, because it
// is a virtual filesystem whose `mnt:` mounts are read-only views over the tables below. Searching it
// finds almost nothing. The real corpus is `research_documents` (654 rows) plus the per-feature upload
// tables, none of which the Explorer owns.
//
// Records are included alongside documents on purpose. "Pull up that customer's info" is the same
// user intent as "find that deed", and making the user choose which of two search boxes to use is the
// problem, not the interface.

/** A date on a corpus row, and what it actually means. Kept distinct because they routinely differ by
 *  years: a deed RECORDED in 1974 may have been uploaded last Tuesday, and for a title chain the
 *  recording date is the only one that matters. Filtering "documents from 1974" against `created_at`
 *  would return nothing and look like an empty archive. */
export type DateRole = 'created' | 'modified' | 'effective';

export interface CorpusDate {
  column: string;
  role: DateRole;
  /** Shown in the date-filter dropdown. Says what the date MEANS, not which column it is. */
  label: string;
}

export interface Corpus {
  id: string;
  label: string;
  /** `document` = a file with bytes behind it. `record` = a business entity. Both are searchable; the
   *  distinction drives the icon, the result grouping, and whether a download link makes sense. */
  kind: 'document' | 'record';
  table: string;
  /** Columns whose text is matched. Order matters: the first is the display title. */
  titleColumns: string[];
  /** Additional text matched but not shown as the title (body text, notes, descriptions). */
  bodyColumns: string[];
  dates: CorpusDate[];
  /** Column holding a document/category type, if the corpus has one. Drives the type filter. */
  typeColumn: string | null;
  /** Column holding a MIME or file-extension hint, if any. */
  mimeColumn: string | null;
  /** Tenant column. `null` means the table has no `org_id` (§1.2 classified it out of scope). */
  orgColumn: string | null;
  /** Soft-delete column to exclude. `deleted_at`-style (exclude when NOT NULL) or boolean. */
  softDelete: { column: string; kind: 'timestamp' | 'boolean' } | null;
  /** Builds the in-app URL for a hit, or `null` when the corpus has no viewer page.
   *
   *  `null` is deliberate rather than a placeholder link. `customers` is the live example: the table
   *  holds real rows and there is no `/admin/customers` page anywhere in the app. Pointing a result at
   *  one would ship a 404 dressed as a feature — the "dangling registry entry" defect §1.4 already
   *  names. A hit with no viewer still answers the question, because the result itself carries the
   *  name, company, email and phone; it renders as a fact rather than a link.
   *
   *  The guard test asserts every NON-null href resolves to a real page file, so this cannot rot. */
  href: (row: Record<string, unknown>) => string | null;
  /** Roles that may see ANY hit from this corpus. Search assembles results with the service role,
   *  bypassing every per-page gate — so the gate has to be restated here or it does not exist.
   *  Deliberately coarse: this is the floor, not the whole access story. Row-level ownership
   *  (a personal file, a private note) is enforced separately in the query builder. */
  roles: string[];
}

export const CORPORA: Corpus[] = [
  // ── Documents ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'research-documents',
    label: 'Research documents',
    kind: 'document',
    table: 'research_documents',
    titleColumns: ['document_label', 'original_filename'],
    // `extracted_text` is the whole point — it is the OCR'd body of a deed or plat, and the only
    // reason a keyword search over county records can work at all.
    bodyColumns: ['extracted_text', 'recording_info', 'source_url'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Uploaded' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
      { column: 'recorded_date', role: 'effective', label: 'Recorded with the county' },
    ],
    typeColumn: 'document_type',
    mimeColumn: 'file_type',
    orgColumn: 'org_id',
    softDelete: null,
    href: (r) => `/admin/research/${r.research_project_id}`,
    roles: ['admin', 'developer', 'researcher', 'drawer', 'tech_support'],
  },
  {
    id: 'job-files',
    label: 'Job files',
    kind: 'document',
    table: 'job_files',
    titleColumns: ['file_name', 'name'],
    bodyColumns: ['description', 'section'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Uploaded' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: 'file_type',
    mimeColumn: 'mime_type',
    orgColumn: 'org_id',
    softDelete: { column: 'is_deleted', kind: 'boolean' },
    href: (r) => `/admin/jobs/${r.job_id}`,
    roles: ['admin', 'developer', 'field_crew', 'tech_support', 'researcher'],
  },
  {
    id: 'field-media',
    label: 'Field photos & video',
    kind: 'document',
    table: 'field_media',
    titleColumns: ['point_name'],
    // Voice notes are transcribed, so a crew member's spoken "found the iron rod at the fence corner"
    // is searchable text. This is often the only written record of what happened on site.
    bodyColumns: ['transcription'],
    dates: [
      { column: 'captured_at', role: 'effective', label: 'Captured in the field' },
      { column: 'created_at', role: 'created', label: 'Uploaded' },
    ],
    typeColumn: 'media_type',
    mimeColumn: null,
    orgColumn: null,
    softDelete: null,
    href: (r) => `/admin/jobs/${r.job_id}`,
    roles: ['admin', 'developer', 'field_crew', 'tech_support'],
  },
  {
    id: 'maintenance-documents',
    label: 'Equipment maintenance documents',
    kind: 'document',
    table: 'maintenance_event_documents',
    titleColumns: ['filename'],
    bodyColumns: ['description'],
    dates: [{ column: 'uploaded_at', role: 'created', label: 'Uploaded' }],
    typeColumn: 'kind',
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: null,
    href: () => '/admin/equipment/maintenance',
    roles: ['admin', 'developer', 'tech_support', 'equipment_manager'],
  },
  {
    id: 'files',
    label: 'File explorer',
    kind: 'document',
    table: 'file_nodes',
    titleColumns: ['name'],
    bodyColumns: [],
    dates: [
      { column: 'created_at', role: 'created', label: 'Created' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: 'node_type',
    mimeColumn: 'mime_type',
    orgColumn: 'org_id',
    softDelete: { column: 'deleted_at', kind: 'timestamp' },
    href: (r) => `/admin/files?node=${r.id}`,
    roles: ['admin', 'developer', 'tech_support'],
  },

  // ── Records ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'customers',
    label: 'Customers',
    kind: 'record',
    table: 'customers',
    titleColumns: ['display_name', 'company'],
    bodyColumns: ['primary_email', 'primary_phone', 'notes'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Added' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: null,
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: null,
    // No viewer page exists — see the `href` doc comment. The result carries the contact details.
    href: () => null,
    roles: ['admin', 'developer', 'tech_support'],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    kind: 'record',
    table: 'jobs',
    titleColumns: ['job_number', 'name'],
    // Address, legal description and client name are how people actually search for a job — almost
    // never by job number, which is the one field a job-number-only search would cover.
    bodyColumns: [
      'description', 'address', 'city', 'county', 'subdivision', 'lot_number',
      'abstract_number', 'client_name', 'client_company', 'notes',
    ],
    dates: [
      { column: 'created_at', role: 'created', label: 'Created' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
      { column: 'date_received', role: 'effective', label: 'Received' },
    ],
    typeColumn: 'survey_type',
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: { column: 'deleted_at', kind: 'timestamp' },
    href: (r) => `/admin/jobs/${r.id}`,
    roles: ['admin', 'developer', 'field_crew', 'tech_support', 'researcher'],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    kind: 'record',
    table: 'contacts',
    titleColumns: ['name', 'company'],
    bodyColumns: ['email', 'phone', 'title', 'address', 'city', 'notes'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Added' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: null,
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: null,
    href: (r) => `/admin/contacts/${r.id}`,
    roles: ['admin', 'developer', 'tech_support'],
  },
  {
    id: 'leads',
    label: 'Leads',
    kind: 'record',
    table: 'leads',
    titleColumns: ['name', 'company'],
    bodyColumns: ['email', 'phone', 'property_address', 'city', 'survey_type', 'notes', 'how_heard'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Came in' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: 'status',
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: null,
    href: (r) => `/admin/leads/${r.id}`,
    roles: ['admin', 'developer', 'tech_support'],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    kind: 'record',
    table: 'customer_invoices',
    titleColumns: ['invoice_number', 'customer_name'],
    bodyColumns: ['customer_email', 'billing_address', 'notes'],
    dates: [
      { column: 'created_at', role: 'created', label: 'Drafted' },
      { column: 'issued_at', role: 'effective', label: 'Issued' },
      { column: 'updated_at', role: 'modified', label: 'Last changed' },
    ],
    typeColumn: 'status',
    mimeColumn: null,
    orgColumn: 'org_id',
    softDelete: null,
    href: (r) => `/admin/invoicing?invoice=${r.id}`,
    roles: ['admin', 'developer', 'tech_support'],
  },
];

export const CORPUS_BY_ID = new Map(CORPORA.map((c) => [c.id, c]));

/** Every column a corpus reads, deduplicated. Used to build the SELECT and by the guard test that
 *  checks each one exists in the live schema — a corpus naming a column that was renamed would
 *  otherwise fail at query time and, if the error were swallowed, look like an empty archive. */
export function columnsFor(c: Corpus): string[] {
  const cols = new Set<string>(['id']);
  for (const col of [...c.titleColumns, ...c.bodyColumns]) cols.add(col);
  for (const d of c.dates) cols.add(d.column);
  if (c.typeColumn) cols.add(c.typeColumn);
  if (c.mimeColumn) cols.add(c.mimeColumn);
  if (c.orgColumn) cols.add(c.orgColumn);
  if (c.softDelete) cols.add(c.softDelete.column);
  return [...cols];
}

/** Corpora a set of roles may search at all. Admin sees everything, matching `accessibleRoutes`. */
export function corporaFor(roles: string[]): Corpus[] {
  if (roles.includes('admin')) return CORPORA;
  return CORPORA.filter((c) => c.roles.some((r) => roles.includes(r)));
}
