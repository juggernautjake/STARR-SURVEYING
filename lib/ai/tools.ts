// lib/ai/tools.ts — the assistant can do things, not just describe them (audit §5, Phase 3 item 14).
//
// §5's second complaint: *"No tool use anywhere. Not one of these routes defines tools. Every AI
// surface is text-in/text-out. The platform has 517 API endpoints and the AI can call none of them."*
//
// ── EVERY TOOL DECLARES ITS OWN PERMISSION AND ITS OWN REVERSIBILITY ────────────────────────────
//
// D4 settles the policy — *"agentic intake with a human approval gate"* — and Q50 asks whether the
// assistant may act at all, Q57 what it must never touch. Those are per-action answers, so they are
// per-tool fields here rather than one global switch:
//
//   `roles`      — who may invoke it, checked server-side against the session, never inferred from
//                  the prompt. A model can be talked into calling a tool; it cannot be talked into
//                  having a role.
//   `confirm`    — whether the UI must ask before executing. Set on anything a user would not want
//                  to discover afterwards.
//   `reversible` — whether a mistake can be undone. D4 requires AI-created records be reversible;
//                  an irreversible tool needs a much better reason to exist.
//
// ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────────────────────────
//
// No tool sends a customer email, changes a payroll amount, approves hours, or deletes anything.
// Q57 asks what the AI must never touch and the owner has not answered — so the first version can
// read widely and write narrowly, and each addition is a decision someone makes on purpose. Reading
// is where the value is anyway: §5's example failures ("cannot see the crew's active job, cannot
// look up which total station is checked out") are all reads.

import type Anthropic from '@anthropic-ai/sdk';
import type { UserRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export interface AiToolContext {
  email: string;
  roles: UserRole[];
}

export interface AiTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool['input_schema'];
  /** Roles permitted to invoke it. Empty = any signed-in user. */
  roles?: UserRole[];
  /** The UI must ask before running this. */
  confirm: boolean;
  /** Can a mistake be undone without an administrator? */
  reversible: boolean;
  run(input: Record<string, unknown>, ctx: AiToolContext): Promise<unknown>;
}

const REGISTRY: AiTool[] = [
  {
    name: 'find_job',
    description:
      'Find jobs by job number, client name, or property address. Use this whenever the user mentions a job, a customer, or an address and you need its details — do not guess a job number.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Job number, client name, or part of an address.' },
      },
      required: ['query'],
    },
    confirm: false,
    reversible: true,
    async run(input) {
      const q = String(input.query ?? '').trim();
      if (!q) return { error: 'A search term is required.' };
      const { data, error } = await supabaseAdmin
        .from('jobs')
        .select('id, job_number, name, address, city, state, stage, client_name, deadline')
        .or(`job_number.ilike.%${q}%,name.ilike.%${q}%,address.ilike.%${q}%,client_name.ilike.%${q}%`)
        .is('deleted_at', null)
        .limit(10);
      if (error) return { error: error.message };
      return { jobs: data ?? [], note: (data ?? []).length === 0 ? 'No jobs matched. Do not invent one.' : undefined };
    },
  },

  {
    name: 'my_hours',
    description:
      'The signed-in user’s recent time entries and whether they are currently clocked in. Use for "how many hours have I worked", "am I still clocked in", "did I forget to clock out".',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days back to look. Defaults to 7.' },
      },
    },
    confirm: false,
    reversible: true,
    async run(input, ctx) {
      const days = Math.min(90, Math.max(1, Number(input.days ?? 7)));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [{ data: entries }, { data: active }] = await Promise.all([
        supabaseAdmin
          .from('daily_time_logs')
          .select('work_date, hours, job_id, notes')
          .eq('user_email', ctx.email)
          .gte('work_date', since.slice(0, 10))
          .order('work_date', { ascending: false })
          .limit(60),
        supabaseAdmin.from('active_clock_sessions').select('clock_in_at, job_id').eq('user_email', ctx.email).maybeSingle(),
      ]);
      const rows = (entries ?? []) as Array<{ hours: number | null }>;
      return {
        entries: entries ?? [],
        total_hours: rows.reduce((a, r) => a + (r.hours ?? 0), 0),
        currently_clocked_in: !!active,
        clocked_in_since: (active as { clock_in_at: string } | null)?.clock_in_at ?? null,
      };
    },
  },

  {
    name: 'equipment_status',
    description:
      'Where a piece of equipment is and who has it. Use for "who has the Trimble", "is the total station available", "when is that instrument due for calibration".',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, brand, model, or serial number.' },
      },
      required: ['query'],
    },
    confirm: false,
    reversible: true,
    async run(input) {
      const q = String(input.query ?? '').trim();
      if (!q) return { error: 'A search term is required.' };
      const { data, error } = await supabaseAdmin
        .from('equipment_inventory')
        .select('id, name, brand, model, serial_number, current_status, next_calibration_due_at, home_location')
        .or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%`)
        .is('retired_at', null)
        .limit(10);
      if (error) return { error: error.message };
      return { equipment: data ?? [] };
    },
  },

  {
    name: 'search_everything',
    description:
      'Search every document and record the user can see — deeds, plats, research documents, job files, customers, jobs, leads and invoices. Spelling-tolerant. Use this before saying you cannot find something.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for. Ordinary words; typos are tolerated.' },
      },
      required: ['query'],
    },
    confirm: false,
    reversible: true,
    async run(input, ctx) {
      const q = String(input.query ?? '').trim();
      if (!q) return { error: 'A search term is required.' };
      // The RPC applies its own permission and tenant filtering (§3b) — the tool does not re-implement
      // it, because two places deciding who may see a document is how they come to disagree.
      const { data, error } = await supabaseAdmin.rpc('search_everything', {
        p_query: q,
        p_roles: ctx.roles,
        p_corpora: null,
        p_mime: null,
        p_date_role: null,
        p_from: null,
        p_to: null,
        p_org: null,
        p_limit: 15,
      });
      if (error) return { error: error.message };
      return { results: data ?? [] };
    },
  },

  {
    name: 'compliance_due',
    description:
      'Licences, certifications, insurance, vehicle registration and instrument calibration that are expired or expiring. Use for "what is expiring", "is my licence current", "what needs renewing".',
    input_schema: {
      type: 'object',
      properties: {
        within_days: { type: 'integer', description: 'Look ahead this many days. Defaults to 60.' },
      },
    },
    roles: ['admin', 'developer', 'tech_support'],
    confirm: false,
    reversible: true,
    async run(input) {
      const within = Math.min(365, Math.max(1, Number(input.within_days ?? 60)));
      const cutoff = new Date(Date.now() + within * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabaseAdmin
        .from('compliance_register')
        .select('title, subject_kind, subject_label, category, expires_on')
        .not('expires_on', 'is', null)
        .lte('expires_on', cutoff)
        .order('expires_on');
      if (error) return { error: error.message };
      return { items: data ?? [] };
    },
  },

  {
    name: 'log_mileage',
    description:
      'Record a mileage entry for the signed-in user. Only use when the user explicitly asks to log miles and has given a date, a distance and a purpose.',
    input_schema: {
      type: 'object',
      properties: {
        miles: { type: 'number', description: 'Distance driven.' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD. Defaults to today.' },
        purpose: { type: 'string', description: 'What the trip was for.' },
        job_id: { type: 'string', description: 'Job id, if the trip was for a specific job.' },
      },
      required: ['miles', 'purpose'],
    },
    // The one write in the first version. Chosen because it is small, personal, entirely reversible,
    // and the thing crews most often forget — §5's "AI in the data-entry paths where surveying is
    // painful". It still asks first: a mileage claim is a money claim.
    confirm: true,
    reversible: true,
    async run(input, ctx) {
      const miles = Number(input.miles);
      if (!Number.isFinite(miles) || miles <= 0) return { error: 'Miles must be a positive number.' };
      const purpose = String(input.purpose ?? '').trim();
      if (!purpose) return { error: 'A purpose is required.' };
      const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
        ? input.date
        : new Date().toISOString().slice(0, 10);

      const { data, error } = await supabaseAdmin
        .from('mileage_entries')
        .insert({
          user_email: ctx.email,
          miles,
          entry_date: date,
          purpose,
          job_id: typeof input.job_id === 'string' ? input.job_id : null,
          // Marked at the source. D4 requires an AI-created record be identifiable and reversible,
          // and a row that does not say where it came from is neither.
          source: 'ai-assistant',
        })
        .select('id, miles, entry_date, purpose')
        .single();
      if (error) return { error: error.message };
      return { created: data, note: 'Recorded. It appears on the mileage page and can be edited or deleted there.' };
    },
  },
];

/** The tools this user may invoke.
 *
 *  Filtered by role BEFORE the tool list reaches the model. Sending a tool and refusing the call is
 *  worse than not sending it: the model offers the capability, the user asks for it, and the refusal
 *  reads as a bug rather than a boundary. */
export function toolsFor(roles: UserRole[]): AiTool[] {
  const isAdmin = roles.includes('admin');
  return REGISTRY.filter((t) => !t.roles || isAdmin || t.roles.some((r) => roles.includes(r)));
}

/** The Anthropic tool definitions for a user. */
export function toolDefinitionsFor(roles: UserRole[]): Anthropic.Tool[] {
  return toolsFor(roles).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

/** Execute a tool the model asked for.
 *
 *  Re-checks the role rather than trusting that the filtered list was the one sent — the tool name
 *  arrives from model output, and model output is untrusted input. */
export async function runTool(name: string, input: Record<string, unknown>, ctx: AiToolContext): Promise<{ ok: boolean; result: unknown }> {
  const tool = toolsFor(ctx.roles).find((t) => t.name === name);
  if (!tool) {
    return { ok: false, result: { error: `No tool named "${name}" is available to you.` } };
  }
  try {
    return { ok: true, result: await tool.run(input, ctx) };
  } catch (err) {
    // Returned to the model as a result, not thrown. A tool that fails should let the assistant say
    // "that lookup failed" and carry on, not abort the whole conversation.
    return { ok: false, result: { error: err instanceof Error ? err.message : String(err) } };
  }
}

/** Tools that must be confirmed before running, for the UI. */
export function requiresConfirmation(name: string): boolean {
  return REGISTRY.find((t) => t.name === name)?.confirm ?? true;
}
