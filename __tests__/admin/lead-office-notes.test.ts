// __tests__/admin/lead-office-notes.test.ts
//
// LR3 of lead-reply-expansion-2026-06-18.md — locks the office-side
// conversation-notes surface:
//   - seed 320 creates the lead_notes table with the right shape +
//     RLS + the updated_at trigger.
//   - /api/admin/leads/[id]/notes handles GET / POST / PATCH / DELETE
//     under admin auth.
//   - <LeadNotesCard> renders the composer + pinned-first list under
//     the customer-notes card on the lead detail page.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('seed 320 — lead_notes table', () => {
  const SRC = read('seeds/320_lead_notes.sql');

  it('creates the lead_notes table with the audit columns', () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.lead_notes/);
    expect(SRC).toMatch(/lead_id\s+UUID NOT NULL REFERENCES public\.leads\(id\) ON DELETE CASCADE/);
    expect(SRC).toMatch(/author_email\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/body\s+TEXT NOT NULL/);
    expect(SRC).toMatch(/pinned\s+BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("indexes by (lead_id, pinned DESC, created_at DESC) so the list sort is cheap", () => {
    expect(SRC).toMatch(/idx_lead_notes_lead_pinned_created[\s\S]{0,200}\(lead_id, pinned DESC, created_at DESC\)/);
  });

  it("keeps updated_at fresh via a BEFORE UPDATE trigger", () => {
    expect(SRC).toMatch(/CREATE OR REPLACE FUNCTION public\.lead_notes_set_updated_at/);
    expect(SRC).toMatch(/CREATE TRIGGER lead_notes_updated_at\s+BEFORE UPDATE ON public\.lead_notes/);
  });

  it('enables RLS + adds the service_role full-access policy', () => {
    expect(SRC).toMatch(/ALTER TABLE public\.lead_notes ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_lead_notes/);
  });

  it('defaults org_id to the Starr tenant uuid', () => {
    expect(SRC).toMatch(/org_id\s+UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID/);
  });
});

describe('notes API route', () => {
  const SRC = read('app/api/admin/leads/[id]/notes/route.ts');

  it('exports GET / POST / PATCH / DELETE handlers under admin gate', () => {
    expect(SRC).toMatch(/export const GET = withErrorHandler/);
    expect(SRC).toMatch(/export const POST = withErrorHandler/);
    expect(SRC).toMatch(/export const PATCH = withErrorHandler/);
    expect(SRC).toMatch(/export const DELETE = withErrorHandler/);
    expect(SRC).toMatch(/async function requireAdmin/);
  });

  it('GET orders pinned-first, then newest-first', () => {
    expect(SRC).toMatch(/\.order\('pinned', \{ ascending: false \}\)\s*\n\s*\.order\('created_at', \{ ascending: false \}\)/);
  });

  it('POST 400s on empty body + 404s when the lead is missing', () => {
    expect(SRC).toMatch(/Note body is required/);
    expect(SRC).toMatch(/'Lead not found'/);
  });

  it('PATCH refuses an empty body + a no-op payload', () => {
    expect(SRC).toMatch(/Note body cannot be empty/);
    expect(SRC).toMatch(/'No fields to update'/);
  });

  it("DELETE looks up the note id from the URL search params", () => {
    expect(SRC).toMatch(/searchParams\.get\('id'\)/);
  });

  it("scopes every UPDATE / DELETE to (note id, lead id) so cross-lead writes can't happen", () => {
    expect(SRC).toMatch(/\.eq\('id', noteId\)\s*\n\s*\.eq\('lead_id', leadId\)/);
  });
});

describe('LeadNotesCard component', () => {
  const SRC = read('app/admin/leads/[id]/LeadNotesCard.tsx');

  it('renders the canonical data-section + testid on the card', () => {
    expect(SRC).toMatch(/data-section="office-notes"/);
    expect(SRC).toMatch(/data-testid="lead-office-notes"/);
  });

  it('exposes a composer with textarea + pin toggle + save button', () => {
    expect(SRC).toMatch(/data-testid="office-notes-textarea"/);
    expect(SRC).toMatch(/data-testid="office-notes-pin-toggle"/);
    expect(SRC).toMatch(/data-testid="office-notes-save"/);
  });

  it("Ctrl/⌘ + Enter inside the textarea submits the draft", () => {
    expect(SRC).toMatch(/\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'/);
  });

  it('renders the pin + delete row controls', () => {
    expect(SRC).toMatch(/data-testid="office-notes-pin-btn"/);
    expect(SRC).toMatch(/data-testid="office-notes-delete-btn"/);
  });

  it("delete confirms via window.confirm before firing the DELETE", () => {
    expect(SRC).toMatch(/window\.confirm\('Delete this note\? This can.t be undone\.'\)/);
  });

  it("pinned items get data-pinned + a tinted background via the css", () => {
    expect(SRC).toMatch(/data-pinned=\{n\.pinned \? 'true' : undefined\}/);
    expect(SRC).toMatch(/\.office-notes__item\[data-pinned='true'\]/);
  });

  it('toasts API errors so the surveyor sees why a save failed', () => {
    expect(SRC).toMatch(/addToast\(`Couldn't save note — \$\{data\.error \?\? `HTTP \$\{res\.status\}`\}`, 'error'\)/);
  });
});

describe('lead detail page mounts the LeadNotesCard', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it("imports LeadNotesCard", () => {
    expect(SRC).toMatch(/import LeadNotesCard from '\.\/LeadNotesCard'/);
  });

  it("renders <LeadNotesCard /> between the Notes card and the RepliesList", () => {
    // The page reads top-to-bottom as: customer notes → office notes →
    // outbound reply history. Verify the office notes section sits
    // before the RepliesList in the JSX source.
    const officeIdx = SRC.indexOf('<LeadNotesCard');
    const repliesIdx = SRC.indexOf('<RepliesList');
    expect(officeIdx).toBeGreaterThan(0);
    expect(repliesIdx).toBeGreaterThan(officeIdx);
  });
});
