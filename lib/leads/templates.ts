// lib/leads/templates.ts
//
// LR4 of lead-reply-expansion-2026-06-18.md — pure template helpers.
// Templates use `{{var}}` interpolation (NOT Handlebars or any other
// library). Kept here so vitest can lock the substitution + escape
// rules without dragging in a templating runtime.
//
// Variables supported today:
//   {{first_name}}   — split lead.name on whitespace; first token
//   {{full_name}}    — lead.name verbatim
//   {{ref_number}}   — pulled from `Ref: SS-XXX` in lead.notes
//   {{survey_type}}  — lead.survey_type ?? 'survey'
//   {{quote_amount}} — fmtCurrency(lead.quote_amount); '$0.00' when null
//
// Future variables (e.g. {{follow_up_date}}, {{deadline}}) can be added
// to `buildTemplateVarsFromLead` without touching `interpolateTemplate`.

export interface TemplateVars {
  first_name: string;
  full_name: string;
  ref_number: string;
  survey_type: string;
  quote_amount: string;
}

/** Pure helper — substitute `{{key}}` tokens with the matching value
 *  from `vars`. Unknown keys are left literal so a typo doesn't break
 *  the template; an empty-string value substitutes to an empty string
 *  (no zero-width gap). Pure + exported.
 *
 *  Plain-text variant: use this for subject lines. Use
 *  `interpolateTemplateHtml` for body HTML so a customer name like
 *  `<script>alert(1)</script>` can't survive the substitution. */
export function interpolateTemplate(
  template: string,
  vars: Partial<TemplateVars>,
): string {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key as keyof TemplateVars];
      return v === undefined || v === null ? '' : String(v);
    }
    return match;
  });
}

/** Pure helper — HTML-escape a string. Pure + exported so the spec
 *  can lock the exact substitution rules. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** LR9 QA pass — HTML-safe interpolation. Each var value is
 *  HTML-escaped before substitution so a customer-supplied lead
 *  field (name / survey_type / notes — all user input) can't
 *  inject script tags or event handlers when the body template
 *  is rendered via dangerouslySetInnerHTML / innerHTML.
 *
 *  Use this for body HTML; use `interpolateTemplate` for plain-text
 *  subject lines. */
export function interpolateTemplateHtml(
  template: string,
  vars: Partial<TemplateVars>,
): string {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key as keyof TemplateVars];
      return v === undefined || v === null ? '' : escapeHtml(String(v));
    }
    return match;
  });
}

/** Pure helper — first whitespace-split token of the customer's name.
 *  Falls back to the full name when there's no whitespace, then to
 *  "there" so the greeting still reads naturally. */
export function extractFirstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (trimmed.length === 0) return 'there';
  const head = trimmed.split(/\s+/)[0];
  return head.length > 0 ? head : trimmed;
}

/** Pure helper — extract the `SS-…` reference number from the
 *  customer's notes. The intake helper prepends `Ref: SS-…` to every
 *  lead's notes (see lib/leads/intake.ts buildLeadRowFromForm), so we
 *  can pull it back out reliably. Returns '' when not found. */
export function extractRefNumber(notes: string | null | undefined): string {
  const match = (notes ?? '').match(/Ref:\s*(\S+)/);
  return match ? match[1] : '';
}

/** Pure helper — format a numeric quote_amount as a USD currency
 *  string. Used by the {{quote_amount}} substitution. Pure + exported. */
export function formatQuoteAmount(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0.00';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Build the template-var bag from a lead row. The lead-detail page
 *  passes only the fields it has on screen; missing fields collapse
 *  to friendly defaults rather than leaving `{{...}}` literal in the
 *  rendered email. */
export interface LeadVarSource {
  name?: string | null;
  notes?: string | null;
  survey_type?: string | null;
  quote_amount?: number | null;
}

export function buildTemplateVarsFromLead(lead: LeadVarSource): TemplateVars {
  return {
    first_name: extractFirstName(lead.name),
    full_name: (lead.name ?? '').trim() || 'there',
    ref_number: extractRefNumber(lead.notes),
    survey_type: (lead.survey_type ?? '').trim() || 'survey',
    quote_amount: formatQuoteAmount(lead.quote_amount ?? null),
  };
}
