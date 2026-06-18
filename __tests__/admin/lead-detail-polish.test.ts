// __tests__/admin/lead-detail-polish.test.ts
//
// lead-attachments-2026-06-18 — user complained the lead-detail page
// rendered the customer email past the parent card's border and the
// styling was generally flat. They also asked for an attachments
// section so the file uploads from the public intake form actually
// show up in the admin UI.
//
// Locks the contract from the polish pass:
//   - DetailRow uses overflow-wrap: anywhere + a flexible grid so a
//     long email word-wraps inside the card instead of bleeding out.
//   - The page renders a real card design (rounded corners, soft
//     shadow, header divider).
//   - A new Attachments section reads `lead.attachments` and renders a
//     chip strip with icon + name + size.
//   - The API GET selects the attachments column.
//   - The intake helper persists the file summaries into the row.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLeadRowFromForm } from '@/lib/leads/intake';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('lead detail page polish (lead-attachments-2026-06-18)', () => {
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it('fixes the email overflow with overflow-wrap: anywhere on the value cell', () => {
    expect(SRC).toMatch(/overflowWrap: 'anywhere'/);
  });

  it('uses overflow-wrap: anywhere on contact link text too', () => {
    expect(SRC).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('renders polished cards (rounded + bordered + shadowed) instead of inline boxes', () => {
    expect(SRC).toMatch(/className="lead-detail__card"/);
    expect(SRC).toMatch(/border-radius:\s*12px/);
    expect(SRC).toMatch(/box-shadow:\s*0 2px 4px rgba\(15, 23, 42, 0\.04\)/);
  });

  it('adds an Attachments section with the canonical data-section + data-testid', () => {
    expect(SRC).toMatch(/data-section="attachments"/);
    expect(SRC).toMatch(/data-testid="lead-attachments"/);
  });

  it('uses the lead.attachments array as the render source', () => {
    expect(SRC).toMatch(/const attachments = lead\.attachments \?\? \[\]/);
  });

  it("renders the attachment count beside the section title", () => {
    expect(SRC).toMatch(/className="lead-detail__counter">\{attachments\.length\}/);
  });

  it("informational chip variant when no storage_path is present (bytes were emailed)", () => {
    expect(SRC).toMatch(/lead-detail__attachment--info/);
  });
});

describe('lead detail page — pure helpers exported via page module', () => {
  // Source-locks for the fmtBytes + iconForAttachment helpers — they
  // live in the page module so the spec verifies via regex (the page
  // is a client component; importing it would pull React into vitest).
  const SRC = read('app/admin/leads/[id]/page.tsx');

  it('declares fmtBytes with the KB / MB / GB ladder', () => {
    expect(SRC).toMatch(/function fmtBytes\(n: number\): string/);
    expect(SRC).toMatch(/\(n \/ 1024\)\.toFixed\(1\)/);
    expect(SRC).toMatch(/\(n \/ \(1024 \* 1024\)\)\.toFixed\(1\)/);
  });

  it('declares iconForAttachment with the survey-friendly extension map', () => {
    expect(SRC).toMatch(/function iconForAttachment\(name: string\): string/);
    // surveyors care about these specifically.
    expect(SRC).toMatch(/'dwg', 'dxf'/);
    expect(SRC).toMatch(/'kml', 'kmz', 'gpx'/);
  });
});

describe('lead detail API — surfaces the attachments column', () => {
  const SRC = read('app/api/admin/leads/[id]/route.ts');

  it('SELECT_COLS now lists `attachments`', () => {
    expect(SRC).toMatch(/SELECT_COLS[\s\S]{1,400}?attachments/);
  });
});

describe('lead intake helper — persists attachments JSON', () => {
  it('declares the optional attachments field on LeadIntakeInput', () => {
    const SRC = read('lib/leads/intake.ts');
    expect(SRC).toMatch(/attachments\?: ReadonlyArray<\{ name: string; size: number; storage_path\?: string \}>/);
  });

  it("buildLeadRowFromForm carries the attachments through as a JSONB-ready array", () => {
    const row = buildLeadRowFromForm({
      name: 'Choi Esther',
      email: 'choi@x.com',
      referenceNumber: 'SS-260618-TEST',
      source: 'Website',
      attachments: [
        { name: 'plat.pdf', size: 12345 },
        { name: 'deed.pdf', size: 67890, storage_path: '/leads/x.pdf' },
      ],
    });
    expect(row.attachments).toEqual([
      { name: 'plat.pdf', size: 12345 },
      { name: 'deed.pdf', size: 67890, storage_path: '/leads/x.pdf' },
    ]);
  });

  it("defaults to an empty array when no attachments are passed (NOT NULL contract)", () => {
    const row = buildLeadRowFromForm({
      name: 'Jane Landowner',
      email: 'jane@x.com',
      referenceNumber: 'SS-260618-NONE',
      source: 'Website',
    });
    expect(row.attachments).toEqual([]);
  });
});

describe('seed 317 — lead.attachments JSONB column', () => {
  const SRC = read('seeds/317_leads_attachments.sql');

  it('adds the attachments column with empty-array default + NOT NULL', () => {
    expect(SRC).toMatch(/ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '\[\]'::JSONB/);
  });
});
